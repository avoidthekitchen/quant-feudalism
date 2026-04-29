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

## Core Loop

Start in the shop, buy Compute Credits with shop credits, deploy into the arena, defeat drones, and extract at the northern gate. Clearing all drones pays the largest reward. Emergency extraction is allowed before the arena is clear, but surviving drones void the clear bonus.

The first arena round starts with `5` drones. Each cleared round increases future enemy count by `1`, up to the available spawn set. The HUD tracks completed rounds as Rounds Finished.

## Resources

Compute has two linked limits:

- Compute Rate Limit is the regenerating short-term meter. It starts at `96`, regenerates after a `720ms` delay, and regenerates at `13` per second.
- Compute Credits are the purchased long-term reserve. They start at `1640`, cap at `2800`, and are spent alongside the rate limit.

Every ability spends from both Compute Rate Limit and Compute Credits. If either resource is driven into debt, movement and vision degrade. Abilities are denied once the overdraw caps are reached.

Shop credits are the between-run currency earned from arena results. They buy Compute Credit refills and permanent Compute Rate Limit upgrades in the shop.

Integrity does not automatically refill after extraction. Repairs must be bought in the shop with Compute Credits:

- Repair amount: `25` Integrity.
- Repair cost: `180` Compute Credits.

Compute Rate Limit can be upgraded permanently:

- Upgrade amount: `+16` Compute Rate Limit.
- First upgrade cost: `42` shop credits.
- Each later upgrade costs `28` more shop credits than the previous one.

## Player Movement

The player uses `W A S D` movement and aims attacks with the pointer.

- Base movement speed is `330 px/s` before resource throttling.
- Acceleration is `765 px/s^2` before throttling.
- Deceleration is also scaled up for snappier stopping.
- Low Compute Credits or compute debt reduces movement speed.

## Dash

Press `Space` to dash.

- Cost: `24` Compute.
- Cooldown: `620ms`.
- Dash speed: `780 px/s` before resource throttling.
- Dash duration: `160ms`.
- Invulnerability: `240ms`.
- During dash invulnerability, enemy bodies do not block the player, so the dash can pass through enemies.

## Melee

Left click to melee toward the pointer.

- Cost: `18` Compute.
- Cooldown: `230ms`.
- Damage: `24`.
- Reach: `166 px` in a forward arc.
- Stun: `280ms`.
- Melee recovery is intentionally short so dash-in, slash, dash-out timing feels responsive.

## Ranged

Right click to fire a ranged bolt toward the pointer.

- Cost: `40` Compute.
- Cooldown: `520ms`.
- Damage: `31`.
- Projectile speed: `490 px/s`.
- Projectile lifetime: `1.2s`.
- Firing causes a `200ms` movement pause, so ranged attacks require deliberate commitment instead of being fully mobile.

## Cache Discount Timing

Dash, melee, and ranged each have a repeated-action cache window.

If the same action is repeated during the final `90ms` before its cooldown completes, it costs one tenth of its normal Compute cost:

- Dash cache cost: `3`.
- Melee cache cost: `2`.
- Ranged cache cost: `4`.

A successful cache hit shows a cache visual near the player and posts a status note. A ready visual appears during the cache timing window for each action. Pressing the repeated action too early invalidates the cache discount for that cooldown cycle and shows a miss visual. Pressing after the cooldown has fully ended still performs the action, but at full cost.

Cache timing is tracked separately per action, so mixed cached combos are possible. For example, a player can use ranged, use melee, hit the melee cache window, and then hit the ranged cache window if each repeated action lands in its own timing window. Cached chains can continue as long as each repeat is timed correctly, the player is not Compute Rate Limited, and there are positive Compute Credits available.

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

Compute Credits spent during the run are reported when returning to the shop. Integrity remains at its post-run value until repaired.
