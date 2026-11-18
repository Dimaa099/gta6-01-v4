[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Dimaa099/gta6-01-v4/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Dimaa099/gta6-01-v4/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# PALMA HEAT — Open-World Crime in Bahía Palma

An original open-world crime game that runs entirely in the browser.
Welcome to **Bahía Palma**, a sun-bleached coastal vice city of palm
avenues, marble towers and a marina full of other people's money.

You arrive with empty pockets and a borrowed pistol. Rico at the marina
needs packages moved, Salomé at the club needs favours, and the Palma PD
needs very little excuse. Steal a car, run the job, shake the heat, get
paid — and try not to wake up outside Santa Palma Hospital.

## What is in the city

- A procedural street grid with ~140 towers (canvas-generated lit-window
  facades), sidewalks, palm trees, street lights and dashed avenues
- A working marina: docks, bobbing boats, animated water, a beach and a
  promenade along the shore
- Parked cars and live traffic that cruises, turns at intersections and
  brakes for the car in front
- 24 pedestrians who stroll the sidewalks and flee from gunfire and
  fast cars
- A 5-star wanted system: police cruisers spawn at the city edge, hunt,
  ram and try to pin you — stay out of sight to cool the heat down
- A repeatable 3-step mission chain (*drive to the marker → grab the
  package on foot → deliver it while wanted*) with scaling payouts
- BUSTED and WASTED states, fines, hospital respawns, and save/load

## Controls

| Input | Action |
| --- | --- |
| W A S D / Arrows | Move / drive |
| Mouse | Look (pointer lock) |
| Mouse click (hold) | Shoot pistol |
| Shift | Sprint |
| E | Enter / exit vehicle |
| R | Reload |
| Space | Handbrake |
| M | Start a mission job |
| Esc / P | Pause |

HUD: health bar, cash, wanted stars, weapon & ammo, in-game clock,
objective banner with distance, a live minimap (streets, shore, traffic,
police blips, mission marker) and a bust meter when the police pin you.

## How to run

The game is plain static files — no build step, no network needed
(three.js is vendored under `game/vendor/three/`).

Option A, with the kit's server (Node 22):

```sh
node serve.ts        # then open http://localhost:8080
```

Option B, any static file server:

```sh
cd game && python3 -m http.server 8080   # open http://localhost:8080
```

For the competition hand-in, `node main.ts` copies `game/` and
`screenshots/` to the output directory and writes `dossier.json`.

Progress (cash, position, jobs done, stats) is saved to `localStorage`
and can be resumed from the start screen's **Continue** button.

## Tech notes

- three.js (vendored ES modules, r180) for the 3D world; everything else
  is hand-written ES modules under `game/src/`:
  `city.js` (procedural city + collision), `player.js` (on-foot
  controller + camera rig), `vehicles.js` (car factory, traffic AI,
  driving model), `police.js` (wanted heat + pursuit AI), `peds.js`
  (pedestrians), `combat.js` (hitscan pistol, tracers, sparks),
  `missions.js` (the job chain), `hud.js` (DOM HUD + canvas minimap),
  `audio.js` (fully procedural WebAudio SFX — engine, shots, sirens,
  pickups; no audio files), `save.js` (localStorage).
- Deterministic seeded city generation: Bahía Palma looks the same on
  every visit.
- `e2e.mjs` is a Playwright end-to-end test that serves the repo,
  boots the game headlessly, exercises movement, car entry and the
  police spawn, and captures the four entry screenshots.
- Screenshot modes for the kit: `game/index.html?shot=start|drive|
  mission|vista` pose the game for `shots.json`.

PALMA HEAT is a work of fiction. Any resemblance to actual vice
capitals is purely tropical.
