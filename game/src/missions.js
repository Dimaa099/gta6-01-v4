// PALMA HEAT — missions. One repeatable 3-step chain, "The Favour":
//   1. Drive to the pickup marker across town.
//   2. Grab the package (walk into the glow on foot).
//   3. Lose the heat and deliver it to the drop-off for cash.
// Payout grows a little with every completed run. Markers are a tall
// light pillar in the world plus a blip on the minimap.

import * as THREE from '../vendor/three/three.module.min.js';
import { ROAD_COORDS, mulberry32 } from './city.js';
import { audio } from './audio.js';

const rand = mulberry32(31337);

const STORY = [
  { from: 'Marina boss Rico', text: 'Rico needs a package moved. No questions, no dents.' },
  { from: 'Club owner Salomé', text: 'Salomé left something sensitive at the docks. Fetch it.' },
  { from: 'A voice on a payphone', text: 'The voice says: "Pick it up. Drive fast. Do not stop."' },
  { from: 'Cousin Tito', text: 'Tito swears this one is totally legal. It is not.' },
];

function roadPoint(minDistFrom) {
  // a point on a road somewhere interesting
  for (let i = 0; i < 12; i++) {
    const rx = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)];
    const rz = ROAD_COORDS[Math.floor(rand() * ROAD_COORDS.length)];
    const onVertical = rand() < 0.5;
    const along = -150 + rand() * 300;
    const p = onVertical ? { x: rx, z: along } : { x: along, z: rz };
    if (!minDistFrom || Math.hypot(p.x - minDistFrom.x, p.z - minDistFrom.z) > 130) return p;
  }
  return { x: 120, z: -120 };
}

export class MissionSystem {
  constructor(scene) {
    this.scene = scene;
    this.state = 'idle'; // idle | pickup | deliver | done
    this.step = 0;
    this.runsDone = 0;
    this.pickup = null;
    this.dropoff = null;
    this.marker = null;
    this.markerMat = null;
    this.ring = null;
    this.elapsed = 0;
    this.storyLine = null;
    this.buildMarker();
  }

  buildMarker() {
    this.markerMat = new THREE.MeshBasicMaterial({
      color: 0xffd21f, transparent: true, opacity: 0.34,
      depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.CylinderGeometry(3.2, 3.2, 42, 18, 1, true);
    this.marker = new THREE.Mesh(geo, this.markerMat);
    this.marker.position.y = 21;
    this.marker.visible = false;
    this.scene.add(this.marker);
    const ringGeo = new THREE.RingGeometry(2.2, 3.2, 28);
    this.ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({
      color: 0xffd21f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
    }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.15;
    this.ring.visible = false;
    this.scene.add(this.ring);
  }

  get active() { return this.state === 'pickup' || this.state === 'deliver'; }

  get target() {
    if (this.state === 'pickup') return this.pickup;
    if (this.state === 'deliver') return this.dropoff;
    return null;
  }

  payout() { return 600 + this.runsDone * 150; }

  start(playerPos) {
    if (this.active) return false;
    this.pickup = roadPoint(playerPos);
    this.dropoff = roadPoint(this.pickup);
    this.state = 'pickup';
    this.storyLine = STORY[Math.floor(rand() * STORY.length)];
    this.placeMarker(this.pickup, 0xffd21f);
    return true;
  }

  placeMarker(p, color) {
    this.marker.position.x = p.x;
    this.marker.position.z = p.z;
    this.markerMat.color.setHex(color);
    this.marker.visible = true;
    this.ring.position.x = p.x;
    this.ring.position.z = p.z;
    this.ring.material.color.setHex(color);
    this.ring.visible = true;
  }

  hideMarker() {
    this.marker.visible = false;
    this.ring.visible = false;
  }

  objectiveText() {
    if (this.state === 'pickup') return 'Pick up the package';
    if (this.state === 'deliver') return 'Deliver the package — shake the heat!';
    return '';
  }

  objectiveSub() {
    if (!this.storyLine) return '';
    return this.storyLine.from + ': ' + this.storyLine.text;
  }

  // Called every frame. events: callbacks into the main game.
  update(dt, player, events) {
    this.elapsed += dt;
    if (this.marker.visible) {
      this.markerMat.opacity = 0.26 + Math.sin(this.elapsed * 3) * 0.1;
      const s = 1 + Math.sin(this.elapsed * 3) * 0.07;
      this.ring.scale.set(s, s, 1);
    }
    if (!this.active) return;
    const t = this.target;
    if (!t) return;
    const dist = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
    if (this.state === 'pickup') {
      // package must be collected on foot, close in
      if (!player.inCar && dist < 3.4) {
        this.state = 'deliver';
        this.placeMarker(this.dropoff, 0x39c26d);
        audio.pickup();
        events.onPickup();
      }
    } else if (this.state === 'deliver') {
      if (dist < 5) {
        const pay = this.payout();
        this.state = 'idle';
        this.runsDone++;
        this.hideMarker();
        audio.cashRegister();
        events.onDeliver(pay);
      }
    }
  }

  fail() {
    this.state = 'idle';
    this.hideMarker();
  }
}
