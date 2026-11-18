// PALMA HEAT — pedestrians. Sunburnt tourists and locals who stroll the
// sidewalks, chat in pairs, and sprint screaming (silently) when shots
// ring out or a car mounts the pavement at them.

import * as THREE from '../vendor/three/three.module.min.js';
import { ROAD_COORDS, CITY_MIN, CITY_MAX, collideCircle, mulberry32 } from './city.js';

const rand = mulberry32(777);
const SHIRTS = [0xffe066, 0x6ab8ff, 0xff8a5c, 0xb8ffd0, 0xf2f2f2, 0xff5a8a, 0x9fe870, 0xd9b7ff];
const SKINS = [0xf0c8a0, 0xc98d5e, 0x8a5a34, 0xe8b088, 0x6e4423];

function buildPedMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: SKINS[Math.floor(rand() * SKINS.length)] });
  const shirt = new THREE.MeshLambertMaterial({ color: SHIRTS[Math.floor(rand() * SHIRTS.length)] });
  const legs = new THREE.MeshLambertMaterial({ color: 0x3a3f4a });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), shirt);
  torso.position.y = 1.12;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), skin);
  head.position.y = 1.76;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.72, 0.2), legs);
  legL.position.set(-0.15, 0.36, 0);
  g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.15; g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), skin);
  armL.position.set(-0.4, 1.12, 0);
  g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData = { legL, legR, armL, armR };
  return g;
}

class Ped {
  constructor(scene) {
    this.mesh = buildPedMesh();
    this.pos = this.mesh.position;
    // spawn on a sidewalk beside a random road
    const road = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)];
    const along = CITY_MIN + rand() * (CITY_MAX - CITY_MIN);
    const side = rand() < 0.5 ? 1 : -1;
    if (rand() < 0.5) this.pos.set(road + side * 9.4, 0, along);
    else this.pos.set(along, 0, road + side * 9.4);
    this.heading = rand() * Math.PI * 2;
    this.speed = 1.1 + rand() * 0.9;
    this.state = 'walk'; // walk | flee | down
    this.fleeTimer = 0;
    this.downTimer = 0;
    this.thinkTimer = rand() * 3;
    this.target = null;
    this.walkCycle = rand() * 6;
    this.health = 30;
    scene.add(this.mesh);
    this.pickTarget();
  }

  pickTarget() {
    // stroll to a point a few blocks away, staying near sidewalks
    const road = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)];
    const along = CITY_MIN + rand() * (CITY_MAX - CITY_MIN);
    const side = rand() < 0.5 ? 1 : -1;
    if (rand() < 0.5) this.target = { x: road + side * 9.4, z: along };
    else this.target = { x: along, z: road + side * 9.4 };
  }

  hurt(amount) {
    this.health -= amount;
    if (this.health <= 0 && this.state !== 'down') {
      this.state = 'down';
      this.downTimer = 9;
      this.mesh.rotation.x = Math.PI / 2;
      this.mesh.position.y = 0.25;
      return true; // died
    }
    if (this.state !== 'down') { this.state = 'flee'; this.fleeTimer = 3.5; }
    return false;
  }

  scare(fromX, fromZ, radius) {
    if (this.state === 'down') return;
    const d = Math.hypot(this.pos.x - fromX, this.pos.z - fromZ);
    if (d < radius) {
      this.state = 'flee';
      this.fleeTimer = 2.5 + rand() * 2;
      this.fleeFrom = { x: fromX, z: fromZ };
    }
  }

  update(dt, colliders, danger) {
    if (this.state === 'down') {
      this.downTimer -= dt;
      if (this.downTimer <= 0) {
        // ambulance-grade recovery: get up and limp off, game stays friendly
        this.state = 'flee';
        this.fleeTimer = 4;
        this.health = 30;
        this.mesh.rotation.x = 0;
        this.mesh.position.y = 0;
        this.fleeFrom = danger ? { x: danger.x, z: danger.z } : { x: 0, z: 0 };
      }
      return;
    }
    let moveSpeed = this.speed;
    let dirX = 0, dirZ = 0;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      const fx = this.fleeFrom ? this.pos.x - this.fleeFrom.x : Math.sin(this.heading);
      const fz = this.fleeFrom ? this.pos.z - this.fleeFrom.z : Math.cos(this.heading);
      const l = Math.hypot(fx, fz) || 1;
      dirX = fx / l; dirZ = fz / l;
      moveSpeed = 4.6;
      if (this.fleeTimer <= 0) { this.state = 'walk'; this.pickTarget(); }
    } else {
      if (!this.target) this.pickTarget();
      const dx = this.target.x - this.pos.x;
      const dz = this.target.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < 1.6) {
        this.thinkTimer -= dt;
        if (this.thinkTimer <= 0) { this.pickTarget(); this.thinkTimer = 1 + rand() * 3; }
        moveSpeed = 0;
      } else {
        dirX = dx / dist; dirZ = dz / dist;
      }
      // a fast car close by is also scary
      if (danger && danger.fastCar) {
        const d = Math.hypot(this.pos.x - danger.x, this.pos.z - danger.z);
        if (d < 6) this.scare(danger.x, danger.z, 7);
      }
    }
    if (moveSpeed > 0 && (dirX !== 0 || dirZ !== 0)) {
      this.pos.x += dirX * moveSpeed * dt;
      this.pos.z += dirZ * moveSpeed * dt;
      const targetHeading = Math.atan2(dirX, dirZ);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 8);
      this.walkCycle += dt * (this.state === 'flee' ? 13 : 6.5);
    }
    collideCircle(this.pos, 0.45, colliders);
    this.pos.x = Math.max(-320, Math.min(320, this.pos.x));
    this.pos.z = Math.max(-320, Math.min(290, this.pos.z));
    this.mesh.rotation.y = this.heading;
    const swing = Math.sin(this.walkCycle) * (moveSpeed > 0 ? 0.5 : 0.05);
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = this.state === 'flee' ? -2.6 : -swing * 0.7;
    u.armR.rotation.x = this.state === 'flee' ? -2.6 : swing * 0.7;
  }
}

export class PedSystem {
  constructor(scene, count) {
    this.peds = [];
    for (let i = 0; i < (count || 24); i++) this.peds.push(new Ped(scene));
  }

  scareAll(x, z, radius) {
    for (const p of this.peds) p.scare(x, z, radius);
  }

  update(dt, colliders, danger) {
    for (const p of this.peds) p.update(dt, colliders, danger);
  }

  // Find a ped within radius of a point (for car impacts / targeting).
  nearest(x, z, radius) {
    let best = null, bd = radius;
    for (const p of this.peds) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - x, p.pos.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
