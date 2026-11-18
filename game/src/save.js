// PALMA HEAT — localStorage save/load. Stores cash, player position,
// completed mission count and lifetime stats. Deliberately tiny and
// defensive: a corrupt save must never break the game.

const SAVE_KEY = 'palma-heat-save-v1';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      cash: Number.isFinite(data.cash) ? Math.max(0, Math.floor(data.cash)) : 0,
      x: Number.isFinite(data.x) ? data.x : 0,
      z: Number.isFinite(data.z) ? data.z : 20,
      missionsDone: Number.isFinite(data.missionsDone) ? data.missionsDone : 0,
      timesBusted: Number.isFinite(data.timesBusted) ? data.timesBusted : 0,
      timesWasted: Number.isFinite(data.timesWasted) ? data.timesWasted : 0,
      playSeconds: Number.isFinite(data.playSeconds) ? data.playSeconds : 0,
    };
  } catch (err) {
    return null;
  }
}

export function writeSave(state) {
  try {
    const data = {
      cash: Math.floor(state.cash || 0),
      x: state.x || 0,
      z: state.z || 0,
      missionsDone: state.missionsDone || 0,
      timesBusted: state.timesBusted || 0,
      timesWasted: state.timesWasted || 0,
      playSeconds: Math.floor(state.playSeconds || 0),
      savedAt: Date.now(),
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    return false;
  }
}

export function clearSave() {
  try { window.localStorage.removeItem(SAVE_KEY); } catch (err) { /* ignore */ }
}

export function hasSave() {
  return loadSave() !== null;
}
