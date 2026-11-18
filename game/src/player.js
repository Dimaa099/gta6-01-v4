// PALMA HEAT — the player character: a low-poly beach-shirt hoodlum with
// WASD movement, sprint, a mouse-look third-person camera, simple limb
// swing animation, building collision and a health/damage model.

import * as THREE from '../vendor/three/three.module.min.js';
import { collideCircle, WORLD_HALF } from './city.js';
import { audio } from './audio.js';

export function buildCharacterMesh() {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d5e });
  const shirt = new THREE.MeshLambertMaterial({ color: 0xff5a8a });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2a4d8f });
  const hairM = new THREE.MeshLambertMaterial({ color: 0x1d1410 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirt);
  torso.position.y = 1.18;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.46, 0.42), skin);
  head.position.y = 1.86;
  g.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), hairM);
  hair.position.y = 2.12;
  g.add(hair);
  const shades = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.05),
    new THREE.MeshBasicMaterial({ color: 0x0a0a12 }));
  shades.position.set(0, 1.9, -0.22);
  g.add(shades);

  function limb(w, h, d, mat, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.y = -h / 2;
    pivot.add(m);
    g.add(pivot);
    return pivot;
  }
  const armL = limb(0.2, 0.72, 0.2, skin, -0.48, 1.55, 0);
  const armR = limb(0.2, 0.72, 0.2, skin, 0.48, 1.55, 0);
  const legL = limb(0.24, 0.8, 0.24, pants, -0.18, 0.78, 0);
  const legR = limb(0.24, 0.8, 0.24, pants, 0.18, 0.78, 0);
  // pistol appears in the right hand while on foot
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.42),
    new THREE.MeshLambertMaterial({ color: 0x23262c }));
  gun.position.set(0, -0.72, -0.18);
  armR.add(gun);
  g.userData = { armL, armR, legL, legR, torso, head };
  return g;
}

export class Player {
  constructor(scene) {
    this.mesh = buildCharacterMesh();
    this.pos = this.mesh.position;
    this.pos.set(0, 0, 26);
    this.heading = Math.PI; // face the city centre
    this.health = 100;
    this.maxHealth = 100;
    this.cash = 0;
    this.speedNow = 0;
    this.walkCycle = 0;
    this.stepTimer = 0;
    this.inCar = null;
    this.dead = false;
    this.regenTimer = 0;
    scene.add(this.mesh);
  }

  get x() { return this.pos.x; }
  get z() { return this.pos.z; }

  teleport(x, z) {
    this.pos.set(x, 0, z);
  }

  // move: {x,z} wish direction in world space, sprint flag, dt
  update(dt, wish, sprint, colliders) {
    if (this.inCar || this.dead) {
      this.mesh.visible = !this.inCar;
      return;
    }
    this.mesh.visible = true;
    const len = Math.hypot(wish.x, wish.z);
    let speed = 0;
    if (len > 0.01) {
      const nx = wish.x / len, nz = wish.z / len;
      speed = sprint ? 9.2 : 5.4;
      this.pos.x += nx * speed * dt;
      this.pos.z += nz * speed * dt;
      const targetHeading = Math.atan2(nx, nz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      this.walkCycle += dt * (sprint ? 11 : 8);
      this.stepTimer -= dt;
      if (this.stepTimer <= 0) { audio.step(); this.stepTimer = sprint ? 0.3 : 0.38; }
    } else {
      this.walkCycle += (0 - this.walkCycle % (Math.PI * 2)) * 0; // settle handled below
    }
    this.speedNow = len > 0.01 ? speed : 0;
    collideCircle(this.pos, 0.55, colliders);
    this.pos.x = Math.max(-WORLD_HALF, Math.min(WORLD_HALF, this.pos.x));
    this.pos.z = Math.max(-WORLD_HALF, Math.min(WORLD_HALF - 40, this.pos.z));
    this.mesh.position.y = 0;
    // model faces local -Z; forward vector is (sin h, cos h), hence +PI
    this.mesh.rotation.y = this.heading + Math.PI;
    // limb swing
    const swing = Math.sin(this.walkCycle) * (this.speedNow > 0 ? 0.55 : 0);
    const u = this.mesh.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    if (this.aiming) {
      u.armR.rotation.x = -Math.PI / 2 + 0.12;
      u.armL.rotation.x = swing * 0.4;
    } else {
      u.armR.rotation.x = -swing * 0.8;
      u.armL.rotation.x = swing * 0.8;
    }
    // slow health regen after 6 calm seconds
    this.regenTimer += dt;
    if (this.regenTimer > 6 && this.health > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + dt * 3.2);
    }
  }

  damage(amount) {
    if (this.dead) return 0;
    this.health -= amount;
    this.regenTimer = 0;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
    }
    return amount;
  }

  healFull() {
    this.health = this.maxHealth;
    this.dead = false;
  }
}

// Third-person camera rig: yaw/pitch from mouse, smoothed follow.
export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.distance = 8.5;
    this.smoothed = new THREE.Vector3(0, 4, 18);
    this.lookTarget = new THREE.Vector3();
  }

  addLook(dx, dy) {
    this.yaw -= dx * 0.0026;
    this.pitch += dy * 0.0022;
    this.pitch = Math.max(-0.12, Math.min(1.05, this.pitch));
  }

  update(dt, focusPos, focusHeading, driving) {
    let dist = driving ? 10.5 : 8.5;
    let height = driving ? 3.4 : 2.6;
    if (driving) {
      // ease the camera behind the car's heading
      let diff = focusHeading - this.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.yaw += diff * Math.min(1, dt * 2.2);
    }
    const cx = focusPos.x - Math.sin(this.yaw) * Math.cos(this.pitch) * dist;
    const cz = focusPos.z - Math.cos(this.yaw) * Math.cos(this.pitch) * dist;
    const cy = focusPos.y + height + Math.sin(this.pitch) * dist * 0.7;
    const k = Math.min(1, dt * (driving ? 5 : 9));
    this.smoothed.x += (cx - this.smoothed.x) * k;
    this.smoothed.y += (Math.max(1.2, cy) - this.smoothed.y) * k;
    this.smoothed.z += (cz - this.smoothed.z) * k;
    this.camera.position.copy(this.smoothed);
    this.lookTarget.set(focusPos.x, focusPos.y + 1.7, focusPos.z);
    this.camera.lookAt(this.lookTarget);
  }

  snapTo(focusPos) {
    const dist = 8.5;
    this.smoothed.set(
      focusPos.x - Math.sin(this.yaw) * dist,
      focusPos.y + 4,
      focusPos.z - Math.cos(this.yaw) * dist
    );
  }

  forwardFlat() {
    return { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
  }
}
