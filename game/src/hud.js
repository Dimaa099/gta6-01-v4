// PALMA HEAT — HUD: health, cash, wanted stars, weapon/ammo, objective
// banner, prompts, toasts, bust meter, and the 2D canvas minimap
// (streets, shore, player arrow, police blips, mission marker).

import { ROAD_COORDS, CITY_MIN, CITY_MAX, SHORE_Z } from './city.js';

function el(id) { return document.getElementById(id); }

export class Hud {
  constructor() {
    this.root = el('hud');
    this.healthBar = el('health-bar');
    this.healthText = el('health-text');
    this.cashEl = el('cash');
    this.starsEl = el('stars');
    this.clockEl = el('clock');
    this.objectiveEl = el('objective');
    this.objectiveText = el('objective-text');
    this.objectiveDist = el('objective-dist');
    this.weaponName = el('weapon-name');
    this.ammoEl = el('ammo');
    this.speedo = el('speedo');
    this.promptEl = el('prompt');
    this.toastEl = el('toast');
    this.crosshair = el('crosshair');
    this.hitmarker = el('hitmarker');
    this.bustWrap = el('bust-wrap');
    this.bustBar = el('bust-bar');
    this.vignette = el('damage-vignette');
    this.minimap = el('minimap');
    this.mm = this.minimap.getContext('2d');
    this.toastTimer = 0;
    this.hitTimer = 0;
    this.lastCash = -1;
    this.lastStars = -1;
    this.gameMinutes = 9 * 60; // start at 09:00 in-game
  }

  show() { this.root.classList.remove('hidden'); }
  hide() { this.root.classList.add('hidden'); }

  toast(msg, seconds) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.remove('hidden');
    this.toastTimer = seconds || 3;
  }

  hitmark() {
    this.hitmarker.classList.remove('hidden');
    this.hitTimer = 0.14;
  }

  setPrompt(html) {
    if (html) {
      this.promptEl.innerHTML = html;
      this.promptEl.classList.remove('hidden');
    } else {
      this.promptEl.classList.add('hidden');
    }
  }

  update(dt, s) {
    // s: {health, maxHealth, cash, stars, ammo, reloading, inCar, speedKmh,
    //     objective, objectiveDist, bust, damaged}
    this.healthBar.style.width = Math.max(0, (s.health / s.maxHealth) * 100) + '%';
    this.healthBar.style.background = s.health < 30
      ? '#e63c30' : 'linear-gradient(90deg, #e63c30, #ff7a3c)';
    this.healthText.textContent = Math.ceil(s.health);
    if (s.cash !== this.lastCash) {
      this.cashEl.textContent = '$' + s.cash.toLocaleString('en-US');
      this.lastCash = s.cash;
    }
    if (s.stars !== this.lastStars) {
      let html = '';
      for (let i = 0; i < 5; i++) html += '<span class="' + (i < s.stars ? '' : 'off') + '">★</span>';
      this.starsEl.innerHTML = html;
      this.lastStars = s.stars;
    }
    this.gameMinutes += dt * 2; // 2 game-minutes per real second
    const hh = Math.floor(this.gameMinutes / 60) % 24;
    const mm = Math.floor(this.gameMinutes % 60);
    this.clockEl.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');

    this.ammoEl.textContent = s.reloading ? 'RELOADING…' : (s.ammo + ' / ∞');
    this.weaponName.textContent = s.inCar ? 'VEHICLE' : 'PISTOL';
    if (s.inCar) {
      this.speedo.classList.remove('hidden');
      this.speedo.textContent = Math.abs(Math.round(s.speedKmh)) + ' km/h';
    } else {
      this.speedo.classList.add('hidden');
    }
    this.crosshair.classList.toggle('hidden', !!s.inCar);

    if (s.objective) {
      this.objectiveEl.classList.remove('hidden');
      this.objectiveText.textContent = s.objective;
      this.objectiveDist.textContent = s.objectiveDist !== null && s.objectiveDist !== undefined
        ? Math.round(s.objectiveDist) + ' m' : '';
    } else {
      this.objectiveEl.classList.add('hidden');
    }

    if (s.bust > 0.01) {
      this.bustWrap.classList.remove('hidden');
      this.bustBar.style.width = (s.bust * 100) + '%';
    } else {
      this.bustWrap.classList.add('hidden');
    }
    this.vignette.style.opacity = s.damaged ? '1' : (s.health < 30 ? '0.55' : '0');

    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.classList.add('hidden');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= dt;
      if (this.hitTimer <= 0) this.hitmarker.classList.add('hidden');
    }
  }

  // --- minimap -------------------------------------------------------------
  worldToMap(x, z, size) {
    const span = 560;
    const mx = ((x + span / 2) / span) * size;
    const my = ((z + span / 2) / span) * size;
    return [mx, my];
  }

  drawMinimap(player, policeUnits, missionTarget, cars) {
    const g = this.mm;
    const S = this.minimap.width;
    g.clearRect(0, 0, S, S);
    // sea
    g.fillStyle = '#1a5f8e';
    g.fillRect(0, 0, S, S);
    // land
    const [lx0, lz0] = this.worldToMap(CITY_MIN - 30, CITY_MIN - 30, S);
    const [lx1, lz1] = this.worldToMap(CITY_MAX + 30, SHORE_Z + 16, S);
    g.fillStyle = '#c9bd9d';
    g.fillRect(lx0, lz0, lx1 - lx0, lz1 - lz0);
    // streets
    g.strokeStyle = '#3a3f47';
    g.lineWidth = 3;
    for (const rc of ROAD_COORDS) {
      const [vx] = this.worldToMap(rc, 0, S);
      const [, hy] = this.worldToMap(0, rc, S);
      g.beginPath(); g.moveTo(vx, lz0); g.lineTo(vx, lz1); g.stroke();
      g.beginPath(); g.moveTo(lx0, hy); g.lineTo(lx1, hy); g.stroke();
    }
    // traffic dots
    g.fillStyle = '#e8e8e8';
    for (const c of cars) {
      if (c.isPolice) continue;
      const [x, y] = this.worldToMap(c.pos.x, c.pos.z, S);
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    // mission marker
    if (missionTarget) {
      const [x, y] = this.worldToMap(missionTarget.x, missionTarget.z, S);
      g.fillStyle = '#ffd21f';
      g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
    }
    // police blips (flashing)
    const flash = Math.floor(performance.now() / 280) % 2 === 0;
    for (const u of policeUnits) {
      const [x, y] = this.worldToMap(u.pos.x, u.pos.z, S);
      g.fillStyle = flash ? '#3c78ff' : '#ff3c30';
      g.beginPath(); g.arc(x, y, 3.4, 0, Math.PI * 2); g.fill();
    }
    // player arrow
    const [px, py] = this.worldToMap(player.pos.x, player.pos.z, S);
    g.save();
    g.translate(px, py);
    g.rotate(playerHeadingAngle(player));
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#000';
    g.beginPath();
    g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 2.6); g.lineTo(-4, 5); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // frame label
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.font = 'bold 9px sans-serif';
    g.fillText('BAHÍA PALMA', 6, S - 6);
  }
}

function playerHeadingAngle(player) {
  // The arrow glyph points up (0,-1). Canvas rotation maps (0,-1) to
  // (sin θ, -cos θ); the player's map forward is (sin h, cos h) because
  // world +z maps to canvas +y. Solving gives θ = π - h.
  return Math.PI - player.heading;
}
