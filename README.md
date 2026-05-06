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

Within a run, start in the shop, buy Compute Credits with bug bounty credits, deploy into the arena, clear bugs, and extract at the northern gate. Clearing all bugs pays the largest reward. Emergency extraction is allowed before the arena is clear, but surviving bugs void the clear bonus.

The first arena round starts with `5` bugs. Each cleared round increases future bug count by `1`, up to the available spawn set. `Rounds Finished` and `Kills` are tracked across the whole run, and the shop sidebar shows the top three runs ranked by rounds finished, with kills as a secondary stat.

## Resources

Compute has two linked limits:

- Compute Rate Limit is the short-term meter. It starts at `96` and refills at the start of each Active Window.
- Compute Credits are the purchased long-term reserve. They start at `1360`, cap at `2800`, and are spent alongside the rate limit.

Statement and Function Attack Cards spend from both Compute Rate Limit and Compute Credits. If either resource is driven into debt, attacks are denied once the overdraw caps are reached.

Bug bounty credits are run-scoped currency earned from arena results. They buy Compute Credit refills during the current run.

- Minor Refill: `+720` Compute Credits for `20` bug bounty credits.
- Corporate Slice: `+1440` Compute Credits for `38` bug bounty credits.
- Dynasty Reserve: `+2400` Compute Credits for `58` bug bounty credits.

Integrity does not automatically refill after extraction. Repairs must be bought in the shop with Compute Credits:

- Repair amount: `25` Integrity.
- Repair cost: `180` Compute Credits.

Quantum Tuner charges are bought in the Workshop and banked for the current run:

- Starting charges: `1`.
- Tuner cost: `250` Compute Credits.
- Charge cap: `3`.
- Charges persist until spent on Collapse or until the run ends.

## Run Lifecycle

- A run can contain many arena deployments.
- The `End Run` button in the shop lets the player archive the current run manually and restart from the base loadout.
- A run ends automatically when `Integrity` is `0` and the player has fewer than `180` Compute Credits left, which means they cannot buy a repair.
- When a run ends, the game shows a summary with rounds cleared, kills, and Quantum Tuner charges used.
- Starting a new run resets bug bounty credits, Compute Credits, integrity, banked Quantum Tuners, rounds finished, and kills back to the opening values.
- Reloading the page resumes the active run. If the player was mid-Arena, the game resumes from the latest saved arena checkpoint.
- Only the current arena checkpoint persists across reloads. The full 15-second Collapse rewind history does not.

## Arena Controls

- Move: `W A S D`
- Dash: `Space`
- Statement: `Left Click`
- Function: `Right Click`
- End Active Window: `E`
- Collapse: `Q`
- Extract: `F` at the gate

## Player Movement

The player uses `W A S D` movement and aims attacks with the pointer.

- Base movement speed is about `353 px/s`.
- Acceleration is `1140 px/s^2`.
- Deceleration is about `1470 px/s^2` for snappier stopping.
- Preparing Windows reduce movement speed to `60%`; low Compute Rate Limit does not slow movement.
- Low or exhausted Compute Credits reduce movement speed and add vision blur.

## Dash

Press `Space` to dash.

- Cost: free.
- Cooldown: `1100ms`.
- Dash speed: `780 px/s`.
- Dash duration: `145ms`.
- Invulnerability: `240ms`.
- During dash invulnerability, bug bodies do not block the player, so the dash can pass through bugs.

## Statement

Left click to play one Statement Attack Card from the Statement Attack Queue toward the pointer.

- Cost: `18` Compute.
- Cooldown: `350ms`.
- Damage: `24`.
- Reach: `166 px` in a forward arc.
- Stun: `280ms`.
- Statement commits the player to a short `130ms` attack animation lock, keeping close attacks agile.

## Function

Right click to play one Function Attack Card from the Function Attack Queue toward the pointer.

- Cost: `40` Compute.
- Cooldown: `820ms`.
- Damage: `31`.
- Projectile speed: `490 px/s`.
- Projectile lifetime: `1.2s`.
- Firing causes a `320ms` movement pause and a longer `280ms` attack animation, so Function attacks require deliberate commitment instead of being fully mobile.
- On direct hit, the bolt creates a `112 px` pull splash that drags nearby bugs inward without dealing extra damage or stun.
- Each bug affected by that splash refunds `6` Compute Credits, up to `18` per shot.
- The siphon refund restores `Compute Credits` only. It does not restore `Compute Rate Limit` and does not change the current Cycle.

## Cycles

Each arena deployment starts with a freshly shuffled Starter Deck of `20` Attack Cards:

- `15` Statement cards.
- `5` Function cards.

The arena runs through repeating Cycles:

- An Active Window refills Compute Rate Limit and draws until the Statement and Function Attack Queues contain `7` total cards.
- The lower-center arena HUD shows the Statement and Function Attack Queues, draw pile count, and discard pile count.
- Played Attack Cards go to discard immediately.
- Press `E` during the Active Window to discard the remaining queued cards and end the cycle early.
- The Active Window also ends automatically after committed attacks resolve when no queued Attack Card can become playable with current resources.
- Cycle End discards remaining queued Attack Cards and starts a `3s` Preparing Window.
- During Preparing, attacks are unavailable, movement is slowed to `60%`, Dash remains free and available, and bugs behave normally.
- When Preparing completes, the next Active Window refills Compute Rate Limit and draws back to the queue limit.

If the draw pile cannot satisfy a draw, the discard pile shuffles into a new draw pile and dealing continues.

## Quantum Tuner And Collapse

Press `Q` in the Arena to trigger Collapse if at least one Quantum Tuner charge is banked and there is at least five seconds of recorded timeline history.

- Each Collapse consumes `1` banked Quantum Tuner charge.
- Collapse rewinds the exact authoritative Arena state by `5s`.
- The visible rewind effect compresses those `5s` into a `1s` cinematic backward scrub before control resumes.
- Player position, movement state, cooldowns, compute recovery delay, integrity, Compute Rate Limit, Compute Credits, kills, and prompt/status text revert to the earlier snapshot.
- Bugs return to their earlier positions and state, including resurrection of bugs that were dead in the discarded timeline.
- Projectiles and arena clear-state also revert to the earlier snapshot.
- A faint persistent quantum trail shows the recent 5-second path and rewind destination while you play.
- After Collapse, a subtle non-interactive ghost replays the discarded player timeline at normal speed.
- Up to `15s` of history are retained, so multiple banked charges can be chained immediately for deeper rewinds.

## Bugs

Bugs pursue, orbit, and lunge.

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
- Clearing the arena pays `kills * 12 + 36` bug bounty credits.
- Emergency extraction pays `kills * 8` bug bounty credits.
- Decommissioning pays `0`.
- Each cleared arena increments Rounds Finished.

Compute Credits spent during each arena deployment are reported when returning to the shop. Integrity remains at its post-deployment value until repaired, unless the run ends first because repairs can no longer be funded.
