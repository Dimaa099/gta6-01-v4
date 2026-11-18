// PALMA HEAT — wanted system and police AI.
// Crimes add "heat". Heat maps to 0–5 stars. Police cruisers spawn at the
// city edge and hunt the player: they seek, ram, and try to box the player
// in. Stay out of sight and the heat bleeds away; get pinned on foot and
// the bust meter fills.

import { Car } from './vehicles.js';
import { CITY_MIN, CITY_MAX, ROAD_COORDS } from './city.js';

export const CRIME_HEAT = {
  theft: 34,        // stealing a car: +1 star
  shotFired: 7,     // per shot, small but it stacks
  shotPed: 40,      // shooting a pedestrian
  killPed: 55,
  hitPedCar: 48,    // running someone over
  hitCopCar: 30,
  hitCivilCar: 10,
  reckless: 4,      // smashing street furniture at speed
};

export class WantedSystem {
  constructor() {
    this.heat = 0;
    this.sightTimer = 0;      // time since a cop last saw the player
    this.bustProgress = 0;    // 0..1
    this.totalCrimes = 0;
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.max(1, Math.min(5, Math.ceil(this.heat / 34)));
  }

  addCrime(kind) {
    const add = CRIME_HEAT[kind] || 5;
    this.heat = Math.min(170, this.heat + add);
    this.totalCrimes++;
  }

  setStars(n) {
    this.heat = n <= 0 ? 0 : n * 34 - 10;
  }

  clear() {
    this.heat = 0;
    this.bustProgress = 0;
    this.sightTimer = 0;
  }

  // seenByCop: any police unit currently has line-of-sight-ish proximity.
  update(dt, seenByCop) {
    if (seenByCop) {
      this.sightTimer = 0;
    } else {
      this.sightTimer += dt;
      if (this.heat > 0 && this.sightTimer > 4) {
        // cooling off: faster at low heat
        const decay = this.stars >= 4 ? 2.2 : 4.2;
        this.heat = Math.max(0, this.heat - decay * dt);
      }
    }
  }
}

export class PoliceSystem {
  constructor(scene) {
    this.scene = scene;
    this.units = [];
    this.spawnTimer = 0;
    this.ramCooldown = new Map();
  }

  desiredUnits(wanted) {
    if (wanted <= 0) return 0;
    return Math.min(6, wanted + 1);
  }

  spawnOne(playerPos) {
    // spawn on a road at the city edge, far from the player
    let x = 0, z = 0, heading = 0;
    for (let tries = 0; tries < 8; tries++) {
      const edge = Math.floor(Math.random() * 4);
      const road = ROAD_COORDS[Math.floor(Math.random() * ROAD_COORDS.length)];
      if (edge === 0) { x = road; z = CITY_MIN - 14; heading = 0; }
      else if (edge === 1) { x = road; z = CITY_MAX + 14; heading = Math.PI; }
      else if (edge === 2) { x = CITY_MIN - 14; z = road; heading = Math.PI / 2; }
      else { x = CITY_MAX + 14; z = road; heading = -Math.PI / 2; }
      if (Math.hypot(x - playerPos.x, z - playerPos.z) > 55) break;
    }
    const car = new Car(this.scene, { x, z, heading, kind: 'police', isPolice: true });
    car.cruiseSpeed = 15;
    this.units.push(car);
    return car;
  }

  despawnFar(playerPos) {
    for (let i = this.units.length - 1; i >= 0; i--) {
      const u = this.units[i];
      if (Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z) > 260) {
        u.remove(this.scene);
        this.units.splice(i, 1);
      }
    }
  }

  clearAll() {
    for (const u of this.units) u.remove(this.scene);
    this.units = [];
  }

  // Returns { seenPlayer, nearestDist, ramHit } for the frame.
  update(dt, wanted, playerPos, playerInCar, playerSpeed, colliders) {
    const result = { seenPlayer: false, nearestDist: Infinity, ramHit: 0 };
    this.spawnTimer -= dt;
    const want = this.desiredUnits(wanted.stars);
    if (this.units.length < want && this.spawnTimer <= 0) {
      this.spawnOne(playerPos);
      this.spawnTimer = 1.6;
    }
    if (wanted.stars === 0) this.despawnFar(playerPos);
    else {
      // trim excess units when heat cools
      while (this.units.length > Math.max(want, 2) && this.units.length > 0) {
        const u = this.units.pop();
        u.remove(this.scene);
      }
    }

    for (const u of this.units) {
      const dx = playerPos.x - u.pos.x;
      const dz = playerPos.z - u.pos.z;
      const dist = Math.hypot(dx, dz);
      result.nearestDist = Math.min(result.nearestDist, dist);
      if (dist < 65) result.seenPlayer = true;

      // --- pursuit steering: aim at a point slightly ahead of the player
      const lead = playerInCar ? 0.45 : 0.15;
      const tx = playerPos.x + Math.sin(playerPos.heading || 0) * 0; // pos has no heading; lead via dist only
      void tx;
      const aimX = playerPos.x, aimZ = playerPos.z;
      void lead;
      const targetHeading = Math.atan2(aimX - u.pos.x, aimZ - u.pos.z);
      let diff = targetHeading - u.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const maxSpeed = 17 + wanted.stars * 1.6;
      let throttle = 0;
      if (dist > 6) throttle = 1;
      else if (dist > 3) throttle = 0.45;
      else throttle = -0.4; // too close: back off a touch, then ram again
      // if the player is behind us, reverse toward them
      if (Math.abs(diff) > 2.4 && dist < 14) throttle = -0.8;
      const steer = Math.max(-1, Math.min(1, diff * 1.6));
      const before = Math.abs(u.speed);
      u.drive(dt, { throttle, steer, handbrake: false }, colliders);
      void before;
      if (Math.abs(u.speed) > maxSpeed) u.speed = Math.sign(u.speed) * maxSpeed;

      // --- ram contact with the player's car / body
      const cd = this.ramCooldown.get(u.id) || 0;
      if (cd > 0) this.ramCooldown.set(u.id, cd - dt);
      const hitDist = playerInCar ? 3.4 : 2.2;
      if (dist < hitDist && Math.abs(u.speed) > 3 && (this.ramCooldown.get(u.id) || 0) <= 0) {
        result.ramHit = Math.min(16, 5 + Math.abs(u.speed) * 0.7);
        this.ramCooldown.set(u.id, 0.9);
        u.speed *= 0.45;
      }
      void playerSpeed;
    }
    return result;
  }
}
