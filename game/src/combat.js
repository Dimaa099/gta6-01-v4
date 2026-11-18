// PALMA HEAT — hitscan pistol combat: tracers, muzzle flash, impact
// sparks, ammo & reload, and damage against pedestrians and cars.

import * as THREE from '../vendor/three/three.module.min.js';
import { audio } from './audio.js';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.magSize = 30;
    this.ammo = this.magSize;
    this.reloading = 0;
    this.cooldown = 0;
    this.tracers = [];
    this.sparks = [];
    this.flashTimer = 0;
    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 220;

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0 })
    );
    this.flashLight = new THREE.PointLight(0xffb347, 0, 18);
    scene.add(this.flash);
    scene.add(this.flashLight);

    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
    this.sparkGeo = new THREE.SphereGeometry(0.09, 6, 5);
    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffc46a });
  }

  get reloadingNow() { return this.reloading > 0; }

  startReload() {
    if (this.reloading > 0 || this.ammo === this.magSize) return false;
    this.reloading = 1.15;
    audio.reload();
    return true;
  }

  // Fire one round from the camera centre. targets: {peds, cars}
  // Returns an outcome object describing what happened.
  fire(originPos, targets, onCrime) {
    if (this.cooldown > 0) return { fired: false };
    if (this.reloading > 0) return { fired: false };
    if (this.ammo <= 0) {
      audio.dryFire();
      this.cooldown = 0.25;
      this.startReload();
      return { fired: false, dry: true };
    }
    this.ammo--;
    this.cooldown = 0.14;
    audio.shot();
    if (onCrime) onCrime('shotFired');

    // direction from the camera, with a whisper of spread
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * 0.012;
    dir.y += (Math.random() - 0.5) * 0.012;
    dir.z += (Math.random() - 0.5) * 0.012;
    dir.normalize();
    const origin = new THREE.Vector3(originPos.x, originPos.y + 1.55, originPos.z);
    const muzzle = origin.clone().add(dir.clone().multiplyScalar(0.7));
    muzzle.y -= 0.12;

    let bestT = 160;
    let hitKind = null;
    let hitObj = null;

    // pedestrians: treat as vertical capsules (distance to segment)
    for (const ped of targets.peds) {
      if (ped.state === 'down') continue;
      const px = ped.pos.x - origin.x, pz = ped.pos.z - origin.z;
      const t = px * dir.x + pz * dir.z;
      if (t < 1 || t > bestT) continue;
      const cx = origin.x + dir.x * t, cz = origin.z + dir.z * t;
      const lateral = Math.hypot(ped.pos.x - cx, ped.pos.z - cz);
      const yAt = origin.y + dir.y * t;
      if (lateral < 0.55 && yAt > -0.2 && yAt < 2.1) {
        bestT = t; hitKind = 'ped'; hitObj = ped;
      }
    }
    // cars: bounding sphere around the chassis
    for (const car of targets.cars) {
      const px = car.pos.x - origin.x, pz = car.pos.z - origin.z;
      const t = px * dir.x + pz * dir.z;
      if (t < 1 || t > bestT + 2) continue;
      const cx = origin.x + dir.x * t, cz = origin.z + dir.z * t;
      const lateral = Math.hypot(car.pos.x - cx, car.pos.z - cz);
      const yAt = origin.y + dir.y * t;
      if (lateral < 2.1 && yAt > -0.2 && yAt < 2.2) {
        bestT = Math.min(bestT, t); hitKind = 'car'; hitObj = car;
      }
    }

    const end = origin.clone().add(dir.clone().multiplyScalar(bestT));
    this.spawnTracer(muzzle, end);
    this.flash.position.copy(muzzle);
    this.flash.material.opacity = 0.95;
    this.flashLight.position.copy(muzzle);
    this.flashLight.intensity = 14;
    this.flashTimer = 0.05;

    const outcome = { fired: true, hitKind, hitObj, point: end };
    if (hitKind === 'ped') {
      const died = hitObj.hurt(30);
      audio.hit();
      this.spawnSparks(end, 4);
      if (onCrime) onCrime(died ? 'killPed' : 'shotPed');
      outcome.killed = died;
    } else if (hitKind === 'car') {
      hitObj.health -= 14;
      audio.hit();
      this.spawnSparks(end, 7);
      if (onCrime) onCrime(hitObj.isPolice ? 'hitCopCar' : 'hitCivilCar');
      if (hitObj.health <= 0 && !hitObj.occupied) {
        hitObj.health = 30; // smoking wreck, still driveable-ish; keep simple
      }
    }
    if (this.ammo === 0) this.startReload();
    return outcome;
  }

  spawnTracer(from, to) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(geo, this.tracerMat.clone());
    this.scene.add(line);
    this.tracers.push({ line, life: 0.07 });
  }

  spawnSparks(point, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      m.position.copy(point);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.4,
        Math.random() * 3,
        (Math.random() - 0.5) * 3.4
      );
      this.scene.add(m);
      this.sparks.push({ mesh: m, vel, life: 0.4 + Math.random() * 0.25 });
    }
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) this.ammo = this.magSize;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flash.material.opacity = 0;
        this.flashLight.intensity = 0;
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        this.tracers.splice(i, 1);
      }
    }
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      s.vel.y -= 9 * dt;
      s.mesh.position.addScaledVector(s.vel, dt);
      if (s.life <= 0 || s.mesh.position.y < 0.03) {
        this.scene.remove(s.mesh);
        this.sparks.splice(i, 1);
      }
    }
  }
}
