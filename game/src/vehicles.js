// PALMA HEAT — vehicles: car factory, parked cars, traffic AI and the
// player driving model. Cars are simple rigid bodies on the road grid:
// accelerate / brake / reverse, speed-sensitive steering, drift handbrake,
// building collision and car-to-car nudges.

import * as THREE from '../vendor/three/three.module.min.js';
import { ROAD_COORDS, CITY_MIN, CITY_MAX, collideCircle, mulberry32 } from './city.js';

const rand = mulberry32(4242);
const CAR_COLORS = [0xe63c30, 0x3c78e6, 0xffd21f, 0x39c26d, 0xf2f2f2, 0x22242a, 0xff7a3c, 0xb45ae0, 0x3cc8c0, 0xc0c6cc];

const bodyGeo = new THREE.BoxGeometry(2.0, 0.62, 4.3);
const cabinGeo = new THREE.BoxGeometry(1.7, 0.55, 2.1);
const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a3d });
const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a20 });

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(bodyGeo, paint);
  body.position.y = 0.62;
  g.add(body);
  const cabin = new THREE.Mesh(cabinGeo, glassMat);
  cabin.position.set(0, 1.18, -0.25);
  g.add(cabin);
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.2, 4.34),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.66;
    g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.18, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.56, -0.25);
    bar.name = 'lightbar';
    g.add(bar);
    const barRed = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.52),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    barRed.position.set(-0.35, 1.56, -0.25);
    barRed.name = 'lightbar-red';
    g.add(barRed);
  }
  const wheels = [];
  const wheelPos = [[-0.95, -1.45], [0.95, -1.45], [-0.95, 1.45], [0.95, 1.45]];
  for (const [wx, wz] of wheelPos) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.36, wz);
    g.add(w);
    wheels.push(w);
  }
  const hl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMat);
  hl1.position.set(-0.6, 0.68, -2.16); g.add(hl1);
  const hl2 = hl1.clone(); hl2.position.x = 0.6; g.add(hl2);
  const tl1 = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), tailMat);
  tl1.position.set(-0.6, 0.68, 2.16); g.add(tl1);
  const tl2 = tl1.clone(); tl2.position.x = 0.6; g.add(tl2);
  g.userData.wheels = wheels;
  return g;
}

let nextCarId = 1;

export class Car {
  constructor(scene, opts) {
    this.id = nextCarId++;
    this.isPolice = !!opts.isPolice;
    this.color = opts.color !== undefined ? opts.color : CAR_COLORS[Math.floor(rand() * CAR_COLORS.length)];
    this.mesh = makeCarMesh(this.isPolice ? 0x1c2f52 : this.color, this.isPolice);
    this.mesh.position.set(opts.x, 0, opts.z);
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.steer = 0;
    this.health = 100;
    this.occupied = false;
    this.stolen = false;
    this.kind = opts.kind || 'parked'; // parked | traffic | police | player
    // traffic state
    this.axis = opts.axis || 'z';       // travel along x or z
    this.dir = opts.dir || 1;           // +1 / -1 along the axis
    this.laneCoord = opts.laneCoord || 0;
    this.cruiseSpeed = 9 + rand() * 5;
    this.turnCooldown = 0;
    scene.add(this.mesh);
    this.syncMesh();
  }

  get pos() { return this.mesh.position; }

  forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  syncMesh() {
    // model front is local -Z; forward vector is (sin h, cos h), hence +PI
    this.mesh.rotation.y = this.heading + Math.PI;
    const spin = this.speed * 0.12;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin * 0.016 * 8;
    if (this.isPolice) {
      const t = performance.now() * 0.012;
      const bar = this.mesh.getObjectByName('lightbar');
      const barR = this.mesh.getObjectByName('lightbar-red');
      if (bar) bar.material.color.setHex(Math.sin(t) > 0 ? 0x4466ff : 0x101038);
      if (barR) barR.material.color.setHex(Math.sin(t) > 0 ? 0x381010 : 0xff2222);
    }
  }

  // Player driving model. input: {throttle -1..1, steer -1..1, handbrake}
  drive(dt, input, colliders) {
    const MAXF = 26, MAXR = -9;
    const accel = input.throttle > 0 ? 15 : 11;
    if (input.throttle !== 0) {
      this.speed += input.throttle * accel * dt;
    } else {
      // engine braking / rolling drag
      this.speed -= this.speed * 0.55 * dt;
      if (Math.abs(this.speed) < 0.08) this.speed = 0;
    }
    if (input.handbrake) {
      this.speed -= this.speed * 2.4 * dt;
    }
    this.speed = Math.max(MAXR, Math.min(MAXF, this.speed));
    // steering: stronger at low speed, capped at high speed
    const steerAuthority = 1.55 / (1 + Math.abs(this.speed) * 0.055);
    const targetSteer = input.steer * steerAuthority;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.2) {
      const dirSign = this.speed >= 0 ? 1 : -1;
      this.heading -= this.steer * dirSign * dt * (0.55 + Math.abs(this.speed) * 0.028);
    }
    const f = this.forward();
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.clampAndCollide(colliders);
    this.syncMesh();
  }

  clampAndCollide(colliders) {
    const before = { x: this.pos.x, z: this.pos.z };
    collideCircle(this.pos, 1.7, colliders);
    // if collision pushed us hard, bleed speed and register a bump
    const moved = Math.hypot(this.pos.x - before.x, this.pos.z - before.z);
    let bumped = 0;
    if (moved > 0.25 && Math.abs(this.speed) > 4) {
      bumped = Math.abs(this.speed);
      this.speed *= 0.35;
    }
    this.pos.x = Math.max(-330, Math.min(330, this.pos.x));
    this.pos.z = Math.max(-330, Math.min(300, this.pos.z));
    return bumped;
  }

  // Traffic: follow the current road, maybe turn at intersections.
  updateTraffic(dt, colliders, others) {
    if (this.kind !== 'traffic') return 0;
    let blocked = false;
    const f = this.forward();
    for (const o of others) {
      if (o === this) continue;
      const dx = o.pos.x - this.pos.x, dz = o.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 7 && (dx * f.x + dz * f.z) > 2) { blocked = true; break; }
    }
    const target = blocked ? 0 : this.cruiseSpeed;
    this.speed += Math.max(-22 * dt, Math.min(9 * dt, target - this.speed));
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    this.turnCooldown -= dt;

    // near an intersection on the cross axis? maybe turn
    const crossCoord = this.axis === 'z' ? this.pos.x : this.pos.z;
    const alongCoord = this.axis === 'z' ? this.pos.z : this.pos.x;
    for (const rc of ROAD_COORDS) {
      if (Math.abs(alongCoord - rc) < 1.6 && this.turnCooldown <= 0) {
        if (rand() < 0.4) {
          const turnDir = rand() < 0.5 ? 1 : -1;
          this.axis = this.axis === 'z' ? 'x' : 'z';
          this.heading = this.axis === 'x'
            ? (turnDir > 0 ? Math.PI / 2 : -Math.PI / 2)
            : (turnDir > 0 ? 0 : Math.PI);
          this.dir = turnDir;
          if (this.axis === 'x') this.pos.z = rc + (turnDir > 0 ? -2.2 : 2.2) * 0 + (this.pos.z - rc) * 0;
          this.turnCooldown = 2.5;
        }
        break;
      }
    }
    void crossCoord;
    // leaving the city: wrap around to the far side
    if (this.pos.x < CITY_MIN - 30 || this.pos.x > CITY_MAX + 30 ||
        this.pos.z < CITY_MIN - 30 || this.pos.z > CITY_MAX + 30) {
      if (this.axis === 'z') {
        this.pos.z = this.pos.z > 0 ? CITY_MIN - 20 : CITY_MAX + 20;
        this.pos.x = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)] + (this.dir > 0 ? 2.4 : -2.4);
        this.heading = this.dir > 0 ? 0 : Math.PI;
      } else {
        this.pos.x = this.pos.x > 0 ? CITY_MIN - 20 : CITY_MAX + 20;
        this.pos.z = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)] + (this.dir > 0 ? -2.4 : 2.4);
        this.heading = this.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      this.speed = this.cruiseSpeed * 0.6;
    }
    this.clampAndCollide(colliders);
    this.syncMesh();
    return blocked ? 1 : 0;
  }

  remove(scene) { scene.remove(this.mesh); }
}

// Build the parked + traffic population.
export function populateVehicles(scene) {
  const cars = [];
  // parked cars along road edges
  for (const rc of ROAD_COORDS) {
    for (let d = CITY_MIN + 16; d < CITY_MAX - 10; d += 26) {
      if (rand() < 0.42) {
        const side = rand() < 0.5 ? 1 : -1;
        const vertical = rand() < 0.5;
        const car = new Car(scene, vertical
          ? { x: rc + side * (7.6), z: d, heading: side > 0 ? 0 : Math.PI, kind: 'parked' }
          : { x: d, z: rc + side * (7.6), heading: side > 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'parked' });
        cars.push(car);
      }
    }
  }
  // moving traffic
  for (let i = 0; i < 11; i++) {
    const axis = rand() < 0.5 ? 'z' : 'x';
    const dir = rand() < 0.5 ? 1 : -1;
    const road = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)];
    const along = CITY_MIN + rand() * (CITY_MAX - CITY_MIN);
    const laneOffset = 2.4;
    const car = new Car(scene, axis === 'z'
      ? { x: road + dir * laneOffset, z: along, heading: dir > 0 ? 0 : Math.PI, kind: 'traffic', axis, dir, laneCoord: road }
      : { x: along, z: road - dir * laneOffset, heading: dir > 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'traffic', axis, dir, laneCoord: road });
    car.speed = car.cruiseSpeed;
    cars.push(car);
  }
  return cars;
}
