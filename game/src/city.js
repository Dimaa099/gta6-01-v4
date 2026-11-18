// PALMA HEAT — procedural coastal city "Bahía Palma".
// A street grid of avenues and cross-streets, procedural towers with lit
// windows, sidewalks, palm trees, street lights, and a marina on the
// southern shore with docks, boats and an animated water plane.

import * as THREE from '../vendor/three/three.module.min.js';

// --- deterministic RNG so the city is the same on every visit ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BLOCK = 40;            // building block size
export const ROAD_W = 14;           // road width
export const CELL = BLOCK + ROAD_W; // 54 — pitch of the grid
export const GRID = 3;              // blocks from centre: -3..3 roads
export const ROAD_COORDS = [];
for (let i = -GRID; i <= GRID; i++) ROAD_COORDS.push(i * CELL);
export const CITY_MIN = -GRID * CELL - ROAD_W / 2 - 6;
export const CITY_MAX = GRID * CELL + ROAD_W / 2 + 6;
export const SHORE_Z = CITY_MAX + 26;      // where the sand meets the sea
export const WORLD_HALF = 340;             // playable clamp radius-ish

const rand = mulberry32(1986);

// --- procedural facade texture: concrete + a grid of windows -----------
function makeFacadeTexture(baseColor, litRatio, floors, cols) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, 128, 256);
  // subtle vertical grime
  for (let i = 0; i < 40; i++) {
    g.fillStyle = 'rgba(0,0,0,' + (rand() * 0.08) + ')';
    const x = rand() * 128;
    g.fillRect(x, 0, 2 + rand() * 5, 256);
  }
  const fw = 128 / cols;
  const fh = 256 / floors;
  for (let y = 0; y < floors; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rand() < litRatio;
      const warm = rand() < 0.7;
      g.fillStyle = lit ? (warm ? '#ffd98a' : '#bfe3ff') : 'rgba(18,24,38,0.9)';
      g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.24, fw * 0.56, fh * 0.5);
      g.fillStyle = 'rgba(255,255,255,0.16)';
      g.fillRect(x * fw + fw * 0.22, y * fh + fh * 0.24, fw * 0.56, 2);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 2;
  return tex;
}

function makePalmTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#2e8b3a';
  g.lineWidth = 5;
  g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath();
    g.moveTo(32, 32);
    g.quadraticCurveTo(32 + Math.cos(a) * 20, 32 + Math.sin(a) * 14 - 6, 32 + Math.cos(a) * 30, 32 + Math.sin(a) * 22 + 6);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PALETTE = ['#d9c8a9', '#c7b299', '#e8dcc3', '#b8c4c9', '#d9a679', '#a8b8a0', '#cbb7d9', '#e3b7a0', '#9fb6c9', '#d6cf9f'];

export function isOnRoad(x, z) {
  for (const rc of ROAD_COORDS) {
    if (Math.abs(x - rc) < ROAD_W / 2 + 1.5) return true;
    if (Math.abs(z - rc) < ROAD_W / 2 + 1.5) return true;
  }
  return false;
}

export function nearestRoadCoord(v) {
  let best = ROAD_COORDS[0], bd = Infinity;
  for (const rc of ROAD_COORDS) { const d = Math.abs(v - rc); if (d < bd) { bd = d; best = rc; } }
  return best;
}

// Snap a point to the sidewalk beside the nearest road (for peds).
export function sidewalkPoint(x, z) {
  const rx = nearestRoadCoord(x);
  const rz = nearestRoadCoord(z);
  const dx = Math.abs(x - rx), dz = Math.abs(z - rz);
  if (dx < dz) return { x: rx + (x >= rx ? 1 : -1) * (ROAD_W / 2 + 2.2), z };
  return { x, z: rz + (z >= rz ? 1 : -1) * (ROAD_W / 2 + 2.2) };
}

export function buildCity(scene) {
  const colliders = [];
  const group = new THREE.Group();
  scene.add(group);

  // ---- sky, sun, fog, lights ------------------------------------------
  scene.background = new THREE.Color(0x87b7e8);
  scene.fog = new THREE.Fog(0xa8c4e4, 180, 620);
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x8a7a5a, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3b3, 1.9);
  sun.position.set(140, 190, 90);
  scene.add(sun);
  const sunBall = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, fog: false })
  );
  sunBall.position.set(420, 330, -260);
  scene.add(sunBall);
  // a few soft clouds
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false });
  const clouds = [];
  for (let i = 0; i < 10; i++) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(16 + rand() * 22, 10, 8), cloudMat);
    cl.scale.y = 0.32;
    cl.position.set((rand() - 0.5) * 700, 120 + rand() * 60, (rand() - 0.5) * 700);
    scene.add(cl); clouds.push(cl);
  }

  // ---- ground: city slab, sand, sea bed -------------------------------
  const cityGround = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY_MAX - CITY_MIN + 90, CITY_MAX - CITY_MIN + 60),
    new THREE.MeshLambertMaterial({ color: 0x9aa0a3 })
  );
  cityGround.rotation.x = -Math.PI / 2;
  cityGround.position.set(0, -0.05, (CITY_MIN + CITY_MAX) / 2 - 4);
  group.add(cityGround);

  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(760, 90),
    new THREE.MeshLambertMaterial({ color: 0xe6d29a })
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.02, SHORE_Z + 30);
  group.add(sand);

  // ---- water ------------------------------------------------------------
  const waterMat = new THREE.MeshPhongMaterial({
    color: 0x1a6f9e, transparent: true, opacity: 0.88,
    shininess: 140, specular: 0xbfe8ff,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 320), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.25, SHORE_Z + 150);
  group.add(water);

  // ---- roads ------------------------------------------------------------
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });
  const span = CITY_MAX - CITY_MIN;
  for (const rc of ROAD_COORDS) {
    const vRoad = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, span), roadMat);
    vRoad.rotation.x = -Math.PI / 2; vRoad.position.set(rc, 0.01, 0);
    group.add(vRoad);
    const hRoad = new THREE.Mesh(new THREE.PlaneGeometry(span, ROAD_W), roadMat);
    hRoad.rotation.x = -Math.PI / 2; hRoad.position.set(0, 0.012, rc);
    group.add(hRoad);
    // dashed centre lines
    for (let d = -span / 2 + 8; d < span / 2 - 4; d += 12) {
      const dashV = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 5), lineMat);
      dashV.rotation.x = -Math.PI / 2; dashV.position.set(rc, 0.03, d);
      group.add(dashV);
      const dashH = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.5), lineMat);
      dashH.rotation.x = -Math.PI / 2; dashH.position.set(d, 0.03, rc);
      group.add(dashH);
    }
  }
  // promenade road along the shore
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(span + 60, ROAD_W), roadMat);
  prom.rotation.x = -Math.PI / 2; prom.position.set(0, 0.012, SHORE_Z - 8);
  group.add(prom);

  // ---- sidewalks ---------------------------------------------------------
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xcac2b2 });
  for (let bx = -GRID; bx < GRID; bx++) {
    for (let bz = -GRID; bz < GRID; bz++) {
      const cx = ROAD_COORDS[bx + GRID] + ROAD_W / 2 + BLOCK / 2 + 1;
      const cz = ROAD_COORDS[bz + GRID] + ROAD_W / 2 + BLOCK / 2 + 1;
      const pad = new THREE.Mesh(new THREE.BoxGeometry(BLOCK + 3, 0.35, BLOCK + 3), walkMat);
      pad.position.set(cx, 0.17, cz);
      group.add(pad);
    }
  }

  // ---- buildings -----------------------------------------------------------
  const facadeTextures = PALETTE.map((col, i) =>
    makeFacadeTexture(col, 0.34 + (i % 4) * 0.1, 10 + (i % 5), 6));
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x6b6259 });
  const shopMat = new THREE.MeshLambertMaterial({ color: 0xff9a3c });
  const shopMat2 = new THREE.MeshLambertMaterial({ color: 0x3cc8c0 });
  let buildingCount = 0;
  for (let bx = -GRID; bx < GRID; bx++) {
    for (let bz = -GRID; bz < GRID; bz++) {
      const blockCx = ROAD_COORDS[bx + GRID] + ROAD_W / 2 + BLOCK / 2 + 1;
      const blockCz = ROAD_COORDS[bz + GRID] + ROAD_W / 2 + BLOCK / 2 + 1;
      const perBlock = 2 + Math.floor(rand() * 3); // 2..4 towers per block
      const slots = [[-10, -10], [10, -10], [-10, 10], [10, 10]];
      for (let s = 0; s < perBlock; s++) {
        const ox = slots[s][0] + (rand() - 0.5) * 3;
        const oz = slots[s][1] + (rand() - 0.5) * 3;
        const w = 13 + rand() * 5;
        const d = 13 + rand() * 5;
        const downtown = Math.max(0, 1 - Math.hypot(blockCx, blockCz) / 260);
        const h = 14 + rand() * 22 + downtown * 34;
        const tex = facadeTextures[Math.floor(rand() * facadeTextures.length)];
        const mat = new THREE.MeshLambertMaterial({ map: tex });
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
        b.position.set(blockCx + ox, h / 2 + 0.3, blockCz + oz);
        group.add(b);
        const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.7, 1.1, d + 0.7), roofMat);
        roof.position.set(blockCx + ox, h + 0.85, blockCz + oz);
        group.add(roof);
        // ground-floor shopfront awning on some buildings
        if (rand() < 0.45) {
          const awn = new THREE.Mesh(
            new THREE.BoxGeometry(w * 0.9, 0.5, 3.2),
            rand() < 0.5 ? shopMat : shopMat2
          );
          awn.position.set(blockCx + ox, 3.1, blockCz + oz + d / 2 + 1.2);
          group.add(awn);
        }
        colliders.push({
          minX: blockCx + ox - w / 2, maxX: blockCx + ox + w / 2,
          minZ: blockCz + oz - d / 2, maxZ: blockCz + oz + d / 2,
        });
        buildingCount++;
      }
    }
  }

  // ---- palm trees ----------------------------------------------------------
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b45 });
  const frondTex = makePalmTexture();
  const frondMat = new THREE.MeshBasicMaterial({ map: frondTex, transparent: true, side: THREE.DoubleSide, alphaTest: 0.3 });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6.4, 6);
  const frondGeo = new THREE.PlaneGeometry(7.5, 7.5);
  const palms = [];
  function addPalm(x, z) {
    const p = new THREE.Group();
    const lean = (rand() - 0.5) * 0.16;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3.2;
    trunk.rotation.z = lean;
    p.add(trunk);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(frondGeo, frondMat);
      f.rotation.x = -Math.PI / 2 + (rand() - 0.5) * 0.5;
      f.rotation.z = rand() * Math.PI;
      f.position.set(lean * -9, 6.5 + i * 0.16, 0);
      p.add(f);
    }
    p.position.set(x, 0, z);
    group.add(p);
    palms.push(p);
    colliders.push({ minX: x - 0.45, maxX: x + 0.45, minZ: z - 0.45, maxZ: z + 0.45 });
  }
  for (const rc of ROAD_COORDS) {
    for (let d = CITY_MIN + 12; d < CITY_MAX - 6; d += 27) {
      if (rand() < 0.75) addPalm(rc + ROAD_W / 2 + 2.4, d + (rand() - 0.5) * 6);
      if (rand() < 0.75) addPalm(d + (rand() - 0.5) * 6, rc - ROAD_W / 2 - 2.4);
    }
  }
  for (let x = -200; x <= 200; x += 16) addPalm(x + (rand() - 0.5) * 5, SHORE_Z + 4 + rand() * 10);

  // ---- street lights -------------------------------------------------------
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x3a4048 });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.12, 5.6, 5);
  const bulbGeo = new THREE.SphereGeometry(0.32, 8, 6);
  for (const rx of ROAD_COORDS) {
    for (const rz of ROAD_COORDS) {
      const lamp = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 2.8;
      lamp.add(pole);
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.y = 5.7;
      lamp.add(bulb);
      lamp.position.set(rx + ROAD_W / 2 + 1.2, 0, rz + ROAD_W / 2 + 1.2);
      group.add(lamp);
    }
  }

  // ---- marina: docks + boats ------------------------------------------------
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
  const hullColors = [0xf2f2f2, 0xe63c30, 0x3c78e6, 0xffd21f, 0x3cc8c0];
  const boats = [];
  for (let i = 0; i < 5; i++) {
    const dockX = -140 + i * 62;
    const dock = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 52), dockMat);
    dock.position.set(dockX, 0.6, SHORE_Z + 42);
    group.add(dock);
    colliders.push({ minX: dockX - 2, maxX: dockX + 2, minZ: SHORE_Z + 16, maxZ: SHORE_Z + 68 });
    for (let bIdx = 0; bIdx < 2; bIdx++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(
        new THREE.BoxGeometry(4.4, 1.6, 11),
        new THREE.MeshLambertMaterial({ color: hullColors[Math.floor(rand() * hullColors.length)] })
      );
      hull.position.y = 0.7;
      boat.add(hull);
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(3, 1.6, 4),
        new THREE.MeshLambertMaterial({ color: 0xffffff })
      );
      cabin.position.set(0, 2.1, -0.8);
      boat.add(cabin);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 8, 5), poleMat);
      mast.position.set(0, 5.4, 2.4);
      boat.add(mast);
      boat.position.set(dockX + (bIdx === 0 ? -5.5 : 5.5), 0.35, SHORE_Z + 30 + bIdx * 22);
      boat.rotation.y = (rand() - 0.5) * 0.2;
      group.add(boat);
      boats.push({ mesh: boat, baseY: 0.35, phase: rand() * Math.PI * 2 });
    }
  }

  // ---- mission-friendly landmarks: hospital + police station ---------------
  function landmark(x, z, color, label) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 16), new THREE.MeshLambertMaterial({ color }));
    base.position.set(x, 5.3, z);
    group.add(base);
    colliders.push({ minX: x - 10, maxX: x + 10, minZ: z - 8, maxZ: z + 8 });
    return { x, z, label };
  }
  const hospital = landmark(-CELL * 3 + 27, -CELL * 3 + 27, 0xf4f6f8, 'Hospital');
  const policeStation = landmark(CELL * 2 + 27, -CELL * 2 + 27, 0x35507a, 'Police');

  let elapsed = 0;
  function update(dt) {
    elapsed += dt;
    water.position.y = 0.25 + Math.sin(elapsed * 0.8) * 0.07;
    waterMat.opacity = 0.84 + Math.sin(elapsed * 0.5) * 0.05;
    for (const b of boats) {
      b.mesh.position.y = b.baseY + Math.sin(elapsed * 1.1 + b.phase) * 0.14;
      b.mesh.rotation.z = Math.sin(elapsed * 0.9 + b.phase) * 0.03;
    }
    for (const cl of clouds) {
      cl.position.x += dt * 1.6;
      if (cl.position.x > 420) cl.position.x = -420;
    }
  }

  return {
    group, colliders, update,
    hospital, policeStation,
    buildingCount,
    palmCount: palms.length,
  };
}

// Circle-vs-AABB push-out used by player, cars and peds.
export function collideCircle(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // centre inside the box: push out along the smallest penetration
        const left = pos.x - c.minX, right = c.maxX - pos.x;
        const top = pos.z - c.minZ, bottom = c.maxZ - pos.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = c.minX - radius;
        else if (m === right) pos.x = c.maxX + radius;
        else if (m === top) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
  return pos;
}
