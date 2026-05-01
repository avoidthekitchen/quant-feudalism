# Quant Feudalism

Quant Feudalism is a compact Phaser 4 arena prototype about surviving a corporate combat loop while managing compute pressure.

## Running Locally

```sh
npm install
npm run dev
```

Build the production bundle with:

```sh
npm run build
```

Run the automated state and rewind tests with:

```sh
npm test
```

## Visual Pipeline

The game now supports a staged authored-art pipeline with procedural fallback:

- The default art mode is `procedural`, so a fresh checkout boots without trying to load missing authored atlases.
- External authored assets are loaded in `BootScene` using `ART_ASSET_MANIFEST` in `src/game/assets-manifest.ts` when requested with `?art=external` or `?art=external-preferred`.
- If required authored assets are missing in external-preferred mode, the game falls back to `createGeneratedArt` from `src/game/generated-art.ts`.
- `?art=external-only` is available for asset-production validation and fails fast through manifest validation rather than silently using placeholders.

### Authored Art Paths

- Actors:
  - `assets/art/actors/player.png` + `player.json` (+ optional `player_n.png`)
  - `assets/art/actors/drone.png` + `drone.json` (+ optional `drone_n.png`)
- Environment and VFX:
  - `assets/art/environment/*`
  - `assets/art/vfx/*`

See the full required asset list and frame contract in [docs/ASSET_WORK_SPEC.md](/Users/mistercheese/Code/quant-feudalism/docs/ASSET_WORK_SPEC.md).

Example authored-art smoke test URL:

```txt
http://localhost:5173/?art=external
```

## Visual Systems

Arena presentation now layers:

- Camera color grading and vignette filters.
- Context-sensitive blur and collapse displacement.
- Scene lighting (`this.lights.enable()`) with lit actors/props.
- Reusable combat VFX presets (`src/game/vfx.ts`) used by dash/melee/ranged/lunge/collapse/ghost events.
- Ambient particle pass for subtle arena motion and depth.

## Performance Guidance

- The renderer is WebGL-first for high-fidelity filters, lights, and particles.
- Keep atlas padding/extrusion enabled to avoid texture sampling seams.
- If performance dips on lower-end hardware, lower effect density before changing core combat timings.
- Validate readability first: combat telegraphs and hit feedback should remain legible under all effects.

## Publishing

Cloudflare Workers Static Assets serves the game from
`https://unformedideas.com/qf-arpg/`. The Cloudflare build writes the app under
`dist/qf-arpg/` so the asset directory mirrors the deployed subpath.

```sh
npm run build:cloudflare
npx wrangler deploy --dry-run
npm run deploy:cloudflare
```

The itch.io build uses relative asset URLs and writes a browser-playable upload
folder to `dist-itch/`.

```sh
npm run build:itch
npm run publish:itch
```

To upload manually without butler, zip the `dist-itch/` folder:

```sh
cd dist-itch && zip -r ../quant-feudalism-itch.zip . && cd ..
```

Then upload the resulting `quant-feudalism-itch.zip` on the itch.io game edit page and set the kind to HTML/browser-playable.

The itch.io publish target is
`avoidthekitchen/quant-feudalism:html5`. After the first butler push, set the
itch.io project kind to HTML/browser-playable on the game's edit page.

## Core Loop

Each save file now revolves around runs. A run starts in the shop, spans repeated deployments into the arena, and continues until the player manually ends it or their integrity collapses without enough Compute Credits left to buy a repair.

Within a run, start in the shop, buy Compute Credits with shop credits, deploy into the arena, defeat drones, and extract at the northern gate. Clearing all drones pays the largest reward. Emergency extraction is allowed before the arena is clear, but surviving drones void the clear bonus.

The first arena round starts with `5` drones. Each cleared round increases future enemy count by `1`, up to the available spawn set. `Rounds Finished` and `Kills` are tracked across the whole run, and the shop sidebar shows the top three runs ranked by rounds finished, with kills as a secondary stat.

## Resources

Compute has two linked limits:

- Compute Rate Limit is the regenerating short-term meter. It starts at `96`, regenerates after a `720ms` delay, and regenerates at `13` per second.
- Compute Credits are the purchased long-term reserve. They start at `1360`, cap at `2800`, and are spent alongside the rate limit.

Every ability spends from both Compute Rate Limit and Compute Credits. If either resource is driven into debt, movement and vision degrade. Abilities are denied once the overdraw caps are reached.

Shop credits are now run-scoped currency earned from arena results. They buy Compute Credit refills and Compute Rate Limit upgrades during the current run only.

- Minor Refill: `+720` Compute Credits for `20` shop credits.
- Corporate Slice: `+1440` Compute Credits for `38` shop credits.
- Dynasty Reserve: `+2400` Compute Credits for `58` shop credits.

Integrity does not automatically refill after extraction. Repairs must be bought in the shop with Compute Credits:

- Repair amount: `25` Integrity.
- Repair cost: `180` Compute Credits.

Quantum Tuner charges are bought in the Workshop and banked for the current run:

- Starting charges: `1`.
- Tuner cost: `250` Compute Credits.
- Charge cap: `3`.
- Charges persist until spent on Collapse or until the run ends.

Compute Rate Limit can be upgraded during a run:

- Upgrade amount: `+16` Compute Rate Limit.
- First upgrade cost: `42` shop credits.
- Each later upgrade costs `28` more shop credits than the previous one.

## Run Lifecycle

- A run can contain many arena deployments.
- The `End Run` button in the shop lets the player archive the current run manually and restart from the base loadout.
- A run ends automatically when `Integrity` is `0` and the player has fewer than `180` Compute Credits left, which means they cannot buy a repair.
- When a run ends, the game shows a summary with rounds cleared, kills, Quantum Tuner charges used, and Compute Rate Limit upgrades gained during that run.
- Starting a new run resets shop credits, Compute Credits, integrity, banked Quantum Tuners, rounds finished, kills, and Compute Rate Limit upgrades back to the opening values.
- Reloading the page resumes the active run. If the player was mid-Arena, the game resumes from the latest saved arena checkpoint.
- Only the current arena checkpoint persists across reloads. The full 15-second Collapse rewind history does not.

## Arena Controls

- Move: `W A S D`
- Dash: `Space`
- Melee: `Left Click`
- Ranged: `Right Click`
- Collapse: `Q`
- Extract: `F` at the gate

## Player Movement

The player uses `W A S D` movement and aims attacks with the pointer.

- Base movement speed is `330 px/s` before resource throttling.
- Acceleration is `765 px/s^2` before throttling.
- Deceleration is also scaled up for snappier stopping.
- Low Compute Credits or compute debt reduces movement speed.

## Dash

Press `Space` to dash.

- Cost: `24` Compute.
- Cooldown: `700ms`.
- Dash speed: `780 px/s` before resource throttling.
- Dash duration: `160ms`.
- Invulnerability: `240ms`.
- During dash invulnerability, enemy bodies do not block the player, so the dash can pass through enemies.

## Melee

Left click to melee toward the pointer.

- Cost: `18` Compute.
- Cooldown: `700ms`.
- Damage: `24`.
- Reach: `166 px` in a forward arc.
- Stun: `280ms`.
- Melee now commits the player to a longer `260ms` attack animation lock so each swing feels less spammable and closer in weight to ranged.

## Ranged

Right click to fire a ranged bolt toward the pointer.

- Cost: `40` Compute.
- Cooldown: `820ms`.
- Damage: `31`.
- Projectile speed: `490 px/s`.
- Projectile lifetime: `1.2s`.
- Firing causes a `320ms` movement pause and a longer `280ms` attack animation, so ranged attacks require deliberate commitment instead of being fully mobile.
- On direct hit, the bolt creates a `112 px` pull splash that drags nearby enemies inward without dealing extra damage or stun.
- Each enemy affected by that splash refunds `6` Compute Credits, up to `18` per shot.
- The siphon refund restores `Compute Credits` only. It does not restore `Compute Rate Limit`, and it does not shorten the rate-limit recovery delay.

## Cache Discount Timing

Dash, melee, and ranged each have a repeated-action cache window.

If the same action is repeated during the final cache window before its cooldown completes, it costs one tenth of its normal Compute cost:

- Dash cache cost: `3`.
- Melee cache cost: `2`.
- Ranged cache cost: `4`.
- Dash cache window: final `140ms`.
- Melee cache window: final `160ms`.
- Ranged cache window: final `160ms`.

A successful cache hit shows a cache visual near the player and posts a status note. Abilities only show their player-adjacent cooldown circle while they are actually cooling down. Each visible circle shows overall cooldown progress, a highlighted cache wedge during the final timing window, a stronger pulse exactly when the cache window opens, a short audio tick on window entry, and a miss state if the discount was invalidated for the current cycle. Pressing the repeated action too early invalidates the cache discount for that cooldown cycle and shows a miss visual. Pressing after the cooldown has fully ended still performs the action, but at full cost.

Cache timing is tracked separately per action, so mixed cached combos are possible. Cached ability spends still hit both `Compute Rate Limit` and `Compute Credits` equally, while ranged siphon refunds restore only `Compute Credits`. A player can use ranged, use melee, hit the melee cache window, and then hit the ranged cache window if each repeated action lands in its own timing window. Cached chains can continue as long as each repeat is timed correctly, the player is not Compute Rate Limited, and there are positive Compute Credits available.

## Quantum Tuner And Collapse

Press `Q` in the Arena to trigger Collapse if at least one Quantum Tuner charge is banked and there is at least five seconds of recorded timeline history.

- Each Collapse consumes `1` banked Quantum Tuner charge.
- Collapse rewinds the exact authoritative Arena state by `5s`.
- The visible rewind effect compresses those `5s` into a `1s` cinematic backward scrub before control resumes.
- Player position, movement state, cooldowns, compute recovery delay, integrity, Compute Rate Limit, Compute Credits, kills, and prompt/status text revert to the earlier snapshot.
- Enemies return to their earlier positions and state, including resurrection of enemies that were dead in the discarded timeline.
- Projectiles and arena clear-state also revert to the earlier snapshot.
- A faint persistent quantum trail shows the recent 5-second path and rewind destination while you play.
- After Collapse, a subtle non-interactive ghost replays the discarded player timeline at normal speed.
- Up to `15s` of history are retained, so multiple banked charges can be chained immediately for deeper rewinds.

## Enemies

Drones pursue, orbit, and lunge.

- Standard chase speed is `198 px/s`.
- Close-range pressure speed is `102 px/s`.
- Contact damage is `14`.
- Lunge windup is `340ms` and displays a magenta warning line.
- Lunge speed is `705 px/s`.
- Lunge duration is `180ms`.
- Lunge cooldown is `1.35s`.
- Lunge contact damage is `18`.

The lunge direction is committed during the telegraph, so precise dashes and footwork can dodge it.

## Extraction And Rewards

The extraction gate is in the north of the arena.

- Press `F` at the gate to extract.
- Clearing the arena pays `kills * 12 + 36` shop credits.
- Emergency extraction pays `kills * 8` shop credits.
- Decommissioning pays `0`.
- Each cleared arena increments Rounds Finished.

Compute Credits spent during each arena deployment are reported when returning to the shop. Integrity remains at its post-deployment value until repaired, unless the run ends first because repairs can no longer be funded.
