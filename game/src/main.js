// PALMA HEAT — main entry: boot, input, the game loop, and the glue
// between city / player / vehicles / police / peds / combat / missions /
// HUD / audio / save. Also exposes window.__palma for automated tests
// and implements the ?shot= screenshot modes used by shots.json.

import * as THREE from '../vendor/three/three.module.min.js';
import { buildCity, SHORE_Z } from './city.js';
import { Player, CameraRig } from './player.js';
import { populateVehicles } from './vehicles.js';
import { WantedSystem, PoliceSystem } from './police.js';
import { PedSystem } from './peds.js';
import { Combat } from './combat.js';
import { MissionSystem } from './missions.js';
import { Hud } from './hud.js';
import { audio } from './audio.js';
import { loadSave, writeSave, clearSave } from './save.js';

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');

const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 4, 44);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const city = buildCity(scene);
const player = new Player(scene);
const rig = new CameraRig(camera);
rig.yaw = player.heading;
rig.snapTo(player.pos);
const cars = populateVehicles(scene);
const peds = new PedSystem(scene, 24);
const wanted = new WantedSystem();
const police = new PoliceSystem(scene);
const combat = new Combat(scene, camera);
const missions = new MissionSystem(scene);
const hud = new Hud();

const state = {
  mode: 'menu', // menu | playing | paused | ended
  endKind: null, // 'busted' | 'wasted'
  time: 0,
  playSeconds: 0,
  missionsDone: 0,
  timesBusted: 0,
  timesWasted: 0,
  shooting: false,
  pointerLocked: false,
  damagedFlash: 0,
  saveTimer: 0,
  startedWithSave: false,
};

// ---------- input --------------------------------------------------------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state.mode === 'playing') {
    if (e.code === 'KeyE') tryEnterExit();
    if (e.code === 'KeyR') combat.startReload();
    if (e.code === 'KeyM') startMissionWithToast();
    if (e.code === 'KeyP') pauseGame();
    if (['ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault();
  } else if (state.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) {
    resumeGame();
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; state.shooting = false; });

canvas.addEventListener('mousedown', (e) => {
  if (state.mode !== 'playing') return;
  if (!state.pointerLocked) {
    lockPointer();
    return;
  }
  if (e.button === 0 && !player.inCar) state.shooting = true;
});
window.addEventListener('mouseup', (e) => { if (e.button === 0) state.shooting = false; });
document.addEventListener('pointerlockchange', () => {
  state.pointerLocked = document.pointerLockElement === canvas;
  if (!state.pointerLocked && state.mode === 'playing' && !shotMode) {
    // losing the lock (Esc) pauses, like most desktop games
    pauseGame();
  }
});
document.addEventListener('mousemove', (e) => {
  if (!state.pointerLocked || state.mode !== 'playing') return;
  rig.addLook(e.movementX || 0, e.movementY || 0);
});
canvas.addEventListener('click', () => {
  audio.unlock();
  if (state.mode === 'playing' && !state.pointerLocked && !shotMode) lockPointer();
});

function keyDown(code) { return !!keys[code]; }

function lockPointer() {
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => { /* headless / denied */ });
  } catch (err) { /* pointer lock unavailable — mouse-look just stays off */ }
}

// ---------- game flow ------------------------------------------------------
const startScreen = document.getElementById('start-screen');
const pauseScreen = document.getElementById('pause-screen');
const endScreen = document.getElementById('end-screen');
const existingSave = loadSave();
if (existingSave && (existingSave.cash > 0 || existingSave.missionsDone > 0)) {
  const btn = document.getElementById('continue-btn');
  btn.classList.remove('hidden');
  document.getElementById('continue-info').textContent =
    '$' + existingSave.cash + ' · ' + existingSave.missionsDone + ' jobs done';
  btn.addEventListener('click', () => startGame(existingSave));
}
document.getElementById('start-btn').addEventListener('click', () => startGame(null));
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('save-btn').addEventListener('click', () => { saveNow(); hud.toast('Game saved.', 2); });
document.getElementById('restart-btn').addEventListener('click', () => { clearSave(); window.location.reload(); });
document.getElementById('respawn-btn').addEventListener('click', respawn);

function startGame(save) {
  audio.unlock();
  startScreen.classList.add('hidden');
  hud.show();
  state.mode = 'playing';
  if (save) {
    player.cash = save.cash;
    player.teleport(save.x, save.z);
    missions.runsDone = save.missionsDone;
    state.missionsDone = save.missionsDone;
    state.timesBusted = save.timesBusted;
    state.timesWasted = save.timesWasted;
    state.playSeconds = save.playSeconds;
    state.startedWithSave = true;
    hud.toast('Welcome back to Bahía Palma. $' + save.cash + ' in your pocket.', 4);
  } else {
    hud.toast('Press M for a job, or just cause some trouble.', 5);
  }
  rig.snapTo(player.pos);
  if (!shotMode) lockPointer();
}

function pauseGame() {
  if (state.mode !== 'playing') return;
  state.mode = 'paused';
  pauseScreen.classList.remove('hidden');
  document.getElementById('pause-stats').textContent =
    'Cash: $' + player.cash + '\nJobs done: ' + state.missionsDone +
    '\nBusted: ' + state.timesBusted + ' · Wasted: ' + state.timesWasted;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.engineStop();
}

function resumeGame() {
  if (state.mode !== 'paused') return;
  pauseScreen.classList.add('hidden');
  state.mode = 'playing';
  if (!shotMode) lockPointer();
}

function endGame(kind) {
  state.mode = 'ended';
  state.endKind = kind;
  if (document.pointerLockElement) document.exitPointerLock();
  audio.engineStop();
  endScreen.classList.remove('hidden');
  endScreen.classList.toggle('busted', kind === 'busted');
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'busted') {
    title.textContent = 'BUSTED';
    const fine = Math.min(player.cash, 200 + wanted.stars * 60);
    text.textContent = 'The Palma PD impound your dignity and fine you $' + fine + '.';
    player.cash -= fine;
    state.timesBusted++;
    audio.bustSting();
  } else {
    title.textContent = 'WASTED';
    const bill = Math.min(player.cash, 150);
    text.textContent = 'You wake up outside Santa Palma Hospital. Medical bill: $' + bill + '.';
    player.cash -= bill;
    state.timesWasted++;
    audio.wastedSting();
  }
  wanted.clear();
  police.clearAll();
  saveNow();
}

function respawn() {
  endScreen.classList.add('hidden');
  player.healFull();
  player.inCar = null;
  player.teleport(city.hospital.x + 14, city.hospital.z + 14);
  player.heading = Math.PI * 0.75;
  rig.yaw = player.heading;
  rig.snapTo(player.pos);
  missions.fail();
  state.mode = 'playing';
  hud.toast('Back on the street. Stay out of trouble (or don\'t).', 3.5);
  if (!shotMode) lockPointer();
}

function saveNow() {
  writeSave({
    cash: player.cash,
    x: player.pos.x, z: player.pos.z,
    missionsDone: state.missionsDone,
    timesBusted: state.timesBusted,
    timesWasted: state.timesWasted,
    playSeconds: state.playSeconds,
  });
}

// ---------- interactions ---------------------------------------------------
function nearestCar(maxDist) {
  let best = null, bd = maxDist;
  const all = cars.concat(police.units);
  for (const c of all) {
    const d = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function tryEnterExit() {
  if (player.inCar) {
    const car = player.inCar;
    const f = car.forward();
    // step out on the left side of the car
    player.teleport(car.pos.x - f.z * 2.4, car.pos.z + f.x * 2.4);
    player.heading = car.heading;
    player.inCar = null;
    car.occupied = false;
    if (car.kind === 'player') car.kind = 'parked';
    audio.door();
    audio.engineStop();
    hud.setPrompt(null);
    return;
  }
  const car = nearestCar(4.2);
  if (!car) return;
  player.inCar = car;
  car.occupied = true;
  car.kind = 'player';
  rig.yaw = car.heading;
  audio.door();
  audio.engineStart();
  if (!car.stolen && !car.isPolice) {
    car.stolen = true;
    wanted.addCrime('theft');
    hud.toast('Vehicle stolen! The owner is calling the police…', 3);
  } else if (car.isPolice) {
    wanted.addCrime('theft');
    wanted.addCrime('hitCopCar');
    hud.toast('You stole a POLICE CRUISER. Bold. Stupid, but bold.', 3);
  }
}

function startMissionWithToast() {
  if (missions.active) { hud.toast('Finish the current job first!', 2.5); return; }
  if (missions.start(player.pos)) {
    hud.toast(missions.objectiveSub(), 5);
  }
}

const missionEvents = {
  onPickup() {
    wanted.addCrime('theft'); // the pickup itself draws a star of attention
    hud.toast('Package secured! The cops are onto you — deliver it!', 4);
  },
  onDeliver(pay) {
    player.cash += pay;
    state.missionsDone++;
    hud.toast('Job done! +$' + pay + '. Rico sends his regards.', 4.5);
    saveNow();
  },
};

// ---------- per-frame update -------------------------------------------------
const clock = new THREE.Clock();
let minimapTimer = 0;

function focusPos() {
  return player.inCar ? player.inCar.pos : player.pos;
}

function update(dt) {
  state.time += dt;
  city.update(dt);
  if (state.mode !== 'playing') {
    // idle camera drift on the menu
    if (state.mode === 'menu') {
      const t = state.time * 0.05;
      camera.position.set(Math.sin(t) * 120, 46, Math.cos(t) * 120);
      camera.lookAt(0, 0, 40);
    }
    return;
  }
  state.playSeconds += dt;

  const fp = focusPos();

  // ----- movement / driving
  let wish = { x: 0, z: 0 };
  const fwd = rig.forwardFlat();
  const right = { x: -Math.cos(rig.yaw), z: Math.sin(rig.yaw) };
  // note: right = forward x up for this heading convention
  if (keyDown('KeyW') || keyDown('ArrowUp')) { wish.x += fwd.x; wish.z += fwd.z; }
  if (keyDown('KeyS') || keyDown('ArrowDown')) { wish.x -= fwd.x; wish.z -= fwd.z; }
  if (keyDown('KeyA') || keyDown('ArrowLeft')) { wish.x -= right.x; wish.z -= right.z; }
  if (keyDown('KeyD') || keyDown('ArrowRight')) { wish.x += right.x; wish.z += right.z; }
  const sprint = keyDown('ShiftLeft') || keyDown('ShiftRight');
  player.aiming = state.shooting;
  player.update(dt, wish, sprint, city.colliders);

  let carBump = 0;
  if (player.inCar) {
    const car = player.inCar;
    const input = {
      throttle: (keyDown('KeyW') || keyDown('ArrowUp') ? 1 : 0) + (keyDown('KeyS') || keyDown('ArrowDown') ? -1 : 0),
      steer: (keyDown('KeyA') || keyDown('ArrowLeft') ? 1 : 0) + (keyDown('KeyD') || keyDown('ArrowRight') ? -1 : 0),
      handbrake: keyDown('Space'),
    };
    const beforeSpeed = Math.abs(car.speed);
    car.drive(dt, input, city.colliders);
    const afterSpeed = Math.abs(car.speed);
    if (beforeSpeed - afterSpeed > 5 && beforeSpeed > 8) {
      carBump = beforeSpeed;
      audio.crash((beforeSpeed - afterSpeed) / 20);
      player.damage((beforeSpeed - afterSpeed) * 0.22);
      state.damagedFlash = 0.4;
      if (beforeSpeed > 15) wanted.addCrime('reckless');
    }
    player.pos.set(car.pos.x, 0, car.pos.z);
    player.heading = car.heading;
    audio.engineUpdate(car.speed / 26, Math.abs(input.throttle));
    // running over a pedestrian — grim, costly
    const victim = peds.nearest(car.pos.x, car.pos.z, 2.1);
    if (victim && Math.abs(car.speed) > 3.5) {
      const died = victim.hurt(100);
      wanted.addCrime(died ? 'killPed' : 'hitPedCar');
      hud.toast(died ? 'You ran someone over!' : 'You clipped a pedestrian!', 3);
      audio.crash(0.5);
      car.speed *= 0.7;
    }
    // bumping other cars
    for (const other of cars) {
      if (other === car) continue;
      const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
      if (d < 3.1 && Math.abs(car.speed) > 2) {
        other.health -= 8;
        wanted.addCrime(other.isPolice ? 'hitCopCar' : 'hitCivilCar');
        audio.crash(0.4);
        car.speed *= 0.6;
        const push = 3.1 - d;
        const nx = (other.pos.x - car.pos.x) / (d || 1);
        const nz = (other.pos.z - car.pos.z) / (d || 1);
        other.pos.x += nx * push; other.pos.z += nz * push;
        other.syncMesh();
      }
    }
  }

  // ----- traffic
  for (const c of cars) {
    if (c === player.inCar) continue;
    if (c.kind === 'traffic') c.updateTraffic(dt, city.colliders, cars);
  }

  // ----- shooting
  if (state.shooting && !player.inCar && state.pointerLocked) {
    const out = combat.fire(player.pos, { peds: peds.peds, cars: cars.concat(police.units) },
      (kind) => wanted.addCrime(kind));
    if (out.fired) {
      peds.scareAll(player.pos.x, player.pos.z, 26);
      if (out.hitKind) hud.hitmark();
    }
  }
  combat.update(dt);

  // ----- police & wanted
  const pol = police.update(dt, wanted, player.pos, !!player.inCar,
    player.inCar ? player.inCar.speed : player.speedNow, city.colliders);
  wanted.update(dt, pol.seenPlayer);
  if (pol.ramHit > 0) {
    player.damage(pol.ramHit);
    state.damagedFlash = 0.5;
    audio.crash(0.7);
    if (player.inCar) player.inCar.speed *= 0.55;
  }
  // bust logic: on foot, close cop, barely moving
  let bust = 0;
  if (!player.inCar && wanted.stars > 0 && pol.nearestDist < 4.5 && player.speedNow < 1.2) {
    wanted.bustProgress += dt / 2.6;
    bust = wanted.bustProgress;
    if (wanted.bustProgress >= 1) { endGame('busted'); return; }
  } else if (player.inCar && wanted.stars > 0 && pol.nearestDist < 5 && Math.abs(player.inCar.speed) < 0.6) {
    wanted.bustProgress += dt / 4.5;
    bust = wanted.bustProgress;
    if (wanted.bustProgress >= 1) { endGame('busted'); return; }
  } else {
    wanted.bustProgress = Math.max(0, wanted.bustProgress - dt * 0.7);
    bust = wanted.bustProgress;
  }

  // ----- peds danger sense (fast car nearby)
  const danger = player.inCar && Math.abs(player.inCar.speed) > 7
    ? { x: player.pos.x, z: player.pos.z, fastCar: true } : null;
  peds.update(dt, city.colliders, danger);

  // ----- missions
  missions.update(dt, player, missionEvents);

  // ----- water is not swimmable streets: keep the player out of the sea
  if (!player.inCar && player.pos.z > SHORE_Z + 12) {
    player.pos.z = SHORE_Z + 12;
    hud.toast('The tide pushes you back. This is a driving town.', 2);
  }

  // ----- camera
  rig.update(dt, fp, player.inCar ? player.inCar.heading : player.heading, !!player.inCar);

  // ----- audio ambience
  audio.update(dt, { policeNear: pol.nearestDist < 42, wanted: wanted.stars });

  // ----- HUD
  state.damagedFlash = Math.max(0, state.damagedFlash - dt);
  const target = missions.target;
  hud.update(dt, {
    health: player.health, maxHealth: player.maxHealth,
    cash: player.cash, stars: wanted.stars,
    ammo: combat.ammo, reloading: combat.reloadingNow,
    inCar: !!player.inCar,
    speedKmh: player.inCar ? player.inCar.speed * 3.6 : 0,
    objective: missions.active ? missions.objectiveText() : null,
    objectiveDist: target ? Math.hypot(player.pos.x - target.x, player.pos.z - target.z) : null,
    bust, damaged: state.damagedFlash > 0,
  });
  minimapTimer -= dt;
  if (minimapTimer <= 0) {
    minimapTimer = 0.12;
    hud.drawMinimap(player, police.units, target, cars);
  }

  // ----- prompts
  if (player.inCar) {
    hud.setPrompt('<b>E</b> Exit vehicle');
  } else {
    const car = nearestCar(4.2);
    hud.setPrompt(car ? '<b>E</b> Enter vehicle' : null);
  }

  // ----- death
  if (player.dead) { endGame('wasted'); return; }

  // ----- autosave every 20s
  state.saveTimer -= dt;
  if (state.saveTimer <= 0) { state.saveTimer = 20; saveNow(); }
  void carBump;
}

function loop() {
  requestAnimationFrame(loop);
  // Fixed-step catch-up: on slow machines (or a busy tab) run several
  // small physics steps per frame so game time tracks real time, capped
  // to avoid a spiral of death after long hitches.
  let acc = Math.min(0.25, clock.getDelta());
  while (acc > 0.0001) {
    const step = Math.min(0.05, acc);
    update(step);
    acc -= step;
    if (state.mode === 'ended') break;
  }
  renderer.render(scene, camera);
}
loop();

// ---------- screenshot modes (shots.json) ------------------------------------
function applyShotMode() {
  if (!shotMode) return;
  if (shotMode === 'start') return; // start screen is the default state
  startGame(null);
  if (shotMode === 'foot') {
    player.teleport(-8, SHORE_Z - 26);
    player.heading = Math.PI; // look north up the avenue, marina behind
    rig.yaw = Math.PI * 0.15;
    rig.snapTo(player.pos);
  } else if (shotMode === 'drive') {
    const car = nearestCar(60);
    if (car) {
      player.teleport(car.pos.x + 2, car.pos.z);
      tryEnterExit();
      if (player.inCar) {
        player.inCar.speed = 11;
        wanted.setStars(2);
      }
    }
  } else if (shotMode === 'mission') {
    missions.start(player.pos);
    if (missions.pickup) {
      player.teleport(missions.pickup.x - 14, missions.pickup.z - 14);
      rig.yaw = Math.atan2(missions.pickup.x - player.pos.x, missions.pickup.z - player.pos.z);
      rig.snapTo(player.pos);
    }
  } else if (shotMode === 'vista') {
    // stand on the promenade and take in the skyline across the bay road
    player.teleport(-30, SHORE_Z - 24);
    player.heading = Math.PI * 1.12;
    rig.yaw = Math.PI * 1.12;
    rig.pitch = 0.12;
    rig.snapTo(player.pos);
  }
}
applyShotMode();

// ---------- debug / test handle ----------------------------------------------
window.__palma = {
  version: 'palma-heat-1.0',
  get state() {
    return {
      mode: state.mode,
      health: player.health,
      cash: player.cash,
      stars: wanted.stars,
      heat: wanted.heat,
      inCar: !!player.inCar,
      playerPos: { x: player.pos.x, z: player.pos.z },
      playerSpeed: player.inCar ? player.inCar.speed : player.speedNow,
      policeCount: police.units.length,
      carCount: cars.length,
      pedCount: peds.peds.length,
      missionState: missions.state,
      buildingCount: city.buildingCount,
      ammo: combat.ammo,
    };
  },
  player, cars, police, wanted, missions, combat,
  teleport(x, z) { player.teleport(x, z); rig.snapTo(player.pos); },
  startGame: (save) => startGame(save || null),
  enterCar() {
    if (player.inCar) return true;
    const car = nearestCar(9999);
    if (!car) return false;
    player.teleport(car.pos.x, car.pos.z);
    tryEnterExit();
    return !!player.inCar;
  },
  exitCar() { if (player.inCar) tryEnterExit(); },
  setWanted(n) { wanted.setStars(n); },
  startMission() { return startMissionWithToast(), missions.active; },
  nearestCarPos() {
    const c = nearestCar(9999);
    return c ? { x: c.pos.x, z: c.pos.z } : null;
  },
  pressKey(code, down) { keys[code] = down !== false; },
};
