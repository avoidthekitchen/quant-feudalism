# Hopper Enemy

## Problem Statement

Quant Feudalism currently has one arena enemy pattern: **Bugs** pursue the player, lunge, and create close-range pressure. This makes arena deployments readable, but it leaves later rounds tactically flat because the player can solve most enemy pressure with the same spacing, **Dash**, and attack rhythm.

The game needs a first non-Bug enemy that changes how the player uses existing tools without introducing a large wave-system rewrite. The enemy should make **Dash** useful as an offensive commitment, not only as an escape, and should create readable punish windows for **Statement** attacks while preserving the current round-count difficulty curve.

## Solution

Add **Hopper** as a distinct arena enemy type. Hopper maintains distance through hops, uses bounded corner-escape hops to avoid permanent wall trapping, and fires telegraphed charged shots with aim locked at windup start.

The first slice introduces exactly one Hopper from round 2 onward. The Hopper replaces the newest deterministic **Bug** spawn slot for that round, so total enemy count remains unchanged. This lets the team test whether Hopper's combat loop is fun before adding enemy preview, weighted wave composition, variants, HP scaling, or additional enemy types.

Hopper is always damageable. Its intended player answer is proactive **Dash** into **Statement** range during charged-shot windup or post-hop landing recovery. **Function** attacks can hit Hopper normally, but they are a fallback or chip option rather than the primary intended counter.

## User Stories

1. As a player, I want to encounter a new enemy pattern after the first round, so that arena deployments become less repetitive.
2. As a player, I want round 1 to remain Bugs only, so that the baseline combat loop stays learnable.
3. As a player, I want exactly one Hopper to appear from round 2 onward, so that I can learn the new enemy without being overwhelmed.
4. As a player, I want the Hopper to replace a Bug instead of adding extra enemy count, so that the new enemy does not accidentally spike round difficulty.
5. As a player, I want Hopper to be visually distinct from Bug, so that I can identify it quickly during combat.
6. As a player, I want Hopper to fight from range, so that it feels meaningfully different from Bug.
7. As a player, I want Hopper to move through hops instead of walking, so that its movement has a distinct rhythm.
8. As a player, I want Hopper hops to be telegraphed, so that I can read when it is about to move.
9. As a player, I want Hopper to have landing recovery after a hop, so that chasing it creates a clear punish opportunity.
10. As a player, I want Hopper to be damageable while hopping, so that successful attacks never feel invalidated by hidden invulnerability.
11. As a player, I want Hopper to avoid being permanently pinned against a wall, so that fighting it stays mobile.
12. As a player, I want Hopper corner escape to obey normal hop rules, so that it does not feel like teleportation or unfair immunity.
13. As a player, I want Hopper to prioritize preserving distance before shooting, so that it does not fire unfair point-blank shots.
14. As a player, I want Hopper to avoid shooting while I am too close, so that close pressure changes its behavior.
15. As a player, I want Hopper charged shots to have a clear windup, so that I have time to react.
16. As a player, I want Hopper charged shots to lock aim at windup start, so that movement and Dash can outplay the shot.
17. As a player, I want the shot telegraph to show the committed aim direction, so that I can choose a safe angle.
18. As a player, I want Hopper shots to stop tracking after windup begins, so that offensive Dash is not punished by perfect tracking.
19. As a player, I want Dash invulnerability to prevent Hopper shot damage, so that Dash remains a consistent defensive rule.
20. As a player, I want a Dashing collision with a Hopper shot to consume the shot, so that a successful dodge cannot hit me from behind afterward.
21. As a player, I want Hopper to deal some touch damage, so that standing inside it is not free.
22. As a player, I want Hopper touch damage to be lower than Bug pressure, so that contact is secondary to the charged shot.
23. As a player, I want Hopper to be fragile once reached, so that solving the approach is rewarded.
24. As a player, I want **Statement** attacks to hit and stun Hopper normally, so that close-range commitment works as expected.
25. As a player, I want **Function** attacks to hit Hopper normally, so that the existing projectile role remains useful.
26. As a player, I want **Function** splash, pull, and siphon effects to include Hopper, so that enemy type variety does not create special-case attack rules.
27. As a player, I want killing Hopper to count toward kills and rewards, so that it is treated as a real arena enemy.
28. As a player, I want extraction to remain locked until all Bugs and the Hopper are dead, so that arena clear rules stay consistent.
29. As a player, I want the arena HUD to show a neutral enemy count, so that the combat UI stays simple until enemy preview exists.
30. As a player, I want Collapse to restore Hopper state correctly, so that rewinding remains trustworthy.
31. As a player, I want Collapse to restore active Hopper shots, so that projectiles do not disappear or duplicate after rewind.
32. As a developer, I want enemies to have explicit types, so that Bug and Hopper behavior can coexist without duplicating shared combat rules.
33. As a developer, I want shared enemy operations for damage, stun, kill registration, targeting, clear checks, and snapshot restoration, so that adding Hopper does not fork the whole enemy system.
34. As a developer, I want Hopper-specific hop and shot state isolated from Bug lunge state, so that each enemy behavior remains understandable.
35. As a developer, I want enemy projectile ownership or type represented where needed, so that player **Function** projectiles and Hopper shots can have different effects safely.
36. As a developer, I want structural rules covered by automated tests, so that spawn composition, targeting, rewards, and Collapse support do not regress.
37. As a developer, I want feel-heavy tuning verified by manual playtest, so that tests do not overfit movement internals.

## Implementation Decisions

- Add **Hopper** as the first non-**Bug** arena enemy type.
- Do not create an ADR for this slice. Typed enemies are expected once a second enemy exists; broader wave generation or enemy architecture decisions can get an ADR later if they become hard to reverse.
- Use **Bug**, **Hopper**, **Statement**, and **Function** in product-facing language. Internal code may still contain older Bug-specific names during incremental refactoring.
- Keep the current deterministic total enemy-count formula.
- Round 1 spawns only Bugs.
- From round 2 onward, exactly one Hopper spawns.
- From round 2 onward, Hopper replaces the newest deterministic Bug spawn slot for that round.
- Do not add random Hopper placement in this slice.
- Do not add more than one Hopper in this slice.
- Change the arena HUD from Bug-specific count wording to neutral enemy count wording, such as `Enemies 06`.
- Hopper's combat role is to test proactive **Dash** into **Statement** opportunities.
- Hopper tries to fight from roughly `250-350px` away from the player.
- Hopper prioritizes preserving distance before making a charged shot.
- Hopper does not start a charged shot while the player is too close or overlapping it.
- Hopper is always damageable.
- Hopper's strongest punish windows are charged-shot windup and post-hop landing recovery.
- Hopper should be fragile once reached. Initial HP is `36`, with a playtest tuning range of `32-40`.
- Hopper has contact damage, but contact is not its main threat. Initial touch damage is `10`, with a playtest tuning range of `8-12`.
- Hopper has no lunge bonus damage.
- Hopper uses hops as its primary movement.
- Initial hop windup is `0.20s`, with a playtest tuning range of `0.15-0.25s`.
- Initial hop duration is `0.18s`, with a playtest tuning range of `0.14-0.24s`.
- Initial landing recovery is `0.45s`, with a playtest tuning range of `0.35-0.55s`.
- Initial cooldown after landing recovery is `0.80s`, with a playtest tuning range of `0.65-1.00s`.
- Initial hop distance is `150-200px`, with a playtest tuning range of `130-230px`.
- If the player is closer than `250px`, Hopper hops away or uses corner escape.
- If the player is roughly `250-350px` away, Hopper may hold position or strafe-hop to preserve range.
- If the player is beyond `400px`, Hopper hops toward the player.
- Hop direction and distance may include modest randomness, but movement must remain readable.
- Corner escape is in scope.
- Corner escape triggers when Hopper's normal chosen landing point would put it too close to an arena wall.
- Corner escape should cross or skirt around the player only through normal hop behavior.
- Corner escape uses normal hop windup, duration, landing recovery, damageability, and arena-collision rules.
- Corner escape does not teleport, phase, grant invulnerability, or ignore arena collision.
- If no good escape destination exists, Hopper takes the best legal hop available.
- Hopper active hop movement should finish even if damaged, unless implementation playtesting proves this feels broken.
- **Statement** stun cancels Hopper shot windup and hop windup.
- **Statement** stun does not need to cancel active hop movement in the first slice.
- Hopper charged shot uses a visible windup and a visible aim telegraph.
- Initial charged-shot windup is `0.55s`, with a playtest tuning range of `0.45-0.70s`.
- Initial charged-shot projectile speed is `350px/s`, with a playtest tuning range of `300-420px/s`.
- Initial charged-shot damage is `18`, with a playtest tuning range of `14-20`.
- Initial charged-shot hit radius is `20px`, with a playtest tuning range of `16-24px`.
- Initial charged-shot cooldown is `2.20s` after firing, with a playtest tuning range of `1.80-2.60s`.
- Hopper charged shot locks aim at windup start.
- Hopper charged shot fires toward the player's position captured at windup start.
- Hopper charged shot does not track the player after windup starts.
- Hopper stops moving during shot windup.
- If a Hopper shot has already fired, it behaves as an independent projectile.
- **Dash** invulnerability prevents Hopper shot damage.
- A Hopper shot expires when it contacts an invulnerable Dashing player.
- Successful Dash consumption of a Hopper shot should have visible pop or dissipation feedback.
- Hopper shots should expire when they hit the player, arena bounds, or wall collision that blocks normal movement/projectile expectations.
- If existing player **Function** projectiles do not collide with walls, Hopper shots may use arena bounds only for first-slice parity, but the implementation should call that out.
- Hopper should use a distinct warm color family from Bug, such as orange/yellow.
- Hopper should appear slightly smaller than Bug.
- Hop windup should have a clear flash or crouch/squash.
- Active hop movement should have a clear fast movement read.
- Landing recovery should have a clear tint or flash.
- Charged-shot windup should have an orange/red glow.
- Charged-shot telegraph should use a visible aim line.
- The first slice may reuse and tint the existing Bug sprite sheet or use simple temporary shapes.
- Final bespoke Hopper sprite-sheet art is out of scope.
- **Statement** attacks hit and stun Hopper normally.
- **Function** attacks hit Hopper directly.
- **Function** splash, pull, and siphon include Hopper in the affected enemy set.
- Killing Hopper increments kills.
- Killing Hopper contributes to normal arena rewards.
- Arena clear requires all Bugs and the Hopper to be dead.
- Collapse snapshots must preserve enemy type.
- Collapse snapshots must preserve Hopper alive/dead state, HP, position, velocity, touch cooldown, stun timer, hop state and timers, hop direction or destination if needed, landing recovery timer, shot cooldown, shot windup timer, and locked shot direction or target point.
- Collapse snapshots must preserve active Hopper projectiles.
- Hopper projectile snapshots must preserve owner/type if projectile behavior differs from player **Function** projectiles.
- Hopper projectile snapshots must preserve position, velocity, TTL or equivalent lifetime, and rotation.
- Telegraph visuals do not need to be snapshotted as objects. They may be recreated from restored Hopper state.
- Suggested module boundary: a wave/spawn composition helper that converts round state and deterministic spawn slots into typed enemy spawn plans.
- Suggested module boundary: a shared enemy model for targetable arena enemies, covering type, health, position, common timers, damage, stun, kill registration, and snapshot shape.
- Suggested module boundary: Bug behavior remains isolated around chase/lunge state.
- Suggested module boundary: Hopper behavior is isolated around hop, corner escape, landing recovery, charged-shot, and shot cooldown state.
- Suggested module boundary: projectile behavior distinguishes player **Function** projectiles from Hopper charged shots when ownership, collision, damage, or snapshot rules differ.

## Testing Decisions

- Automated tests should cover external behavior and stable state transitions, not private movement math or exact animation internals.
- Spawn composition should be tested because it is deterministic and easy to regress.
- Enemy targeting should be tested because Hopper must be a normal target for **Statement**, **Function**, splash, pull, and siphon behavior.
- Clear and reward behavior should be tested because Hopper must participate in normal arena completion rules.
- Hopper projectile behavior should be tested for player damage, Dash invulnerability, and Dash projectile consumption.
- Snapshot behavior should be tested because Collapse is authoritative arena state and currently stores Bug-specific state.
- Feel-heavy behavior such as whether hop movement feels fair, whether corner escape feels slippery, and whether telegraphs are readable should be verified through manual playtest rather than brittle unit tests.
- Prior art exists in the current game tests for combat constants, compute-cycle behavior, game state behavior, and Quantum Tuner snapshot behavior.
- Suggested automated coverage:
  - Round 1 contains only Bugs.
  - Round 2+ keeps existing total enemy count.
  - Round 2+ contains exactly one Hopper.
  - Hopper occupies the newest deterministic spawn slot for that round.
  - **Statement** hit detection includes Hoppers.
  - **Function** direct hit includes Hoppers.
  - **Function** splash, pull, and siphon include Bugs and Hoppers together.
  - Hopper death increments kills.
  - Arena is not cleared while Hopper is alive.
  - Arena clears when the final remaining enemy is a Hopper and it dies.
  - A normal Hopper shot hit applies Hopper shot damage.
  - **Dash** invulnerability prevents Hopper shot damage.
  - **Dash** contact expires the Hopper shot.
  - Clone and restore preserve enemy type.
  - Clone and restore preserve Hopper timers and locked shot direction.
  - Clone and restore preserve active Hopper projectiles.
- Suggested manual playtest checks:
  - Round 2 clearly reads as the first Hopper encounter.
  - Player can identify Hopper without a preview screen.
  - Player can punish charged-shot windup with offensive **Dash** plus **Statement**.
  - Player can punish landing recovery after a hop.
  - Corner escape prevents permanent wall trapping without making Hopper feel untouchable.
  - Hopper pressure feels distinct from Bug pressure.

## Out of Scope

- Publishing this PRD to GitHub Issues.
- Applying a triage label.
- Pre-arena enemy preview.
- Weighted random wave composition.
- Random Hopper placement.
- Multiple Hoppers in one arena deployment.
- Shield, Armor, or other enemy variants.
- Global per-round HP scaling.
- Grappler, Sower, Wraith, bosses, or other enemy types.
- Final bespoke Hopper sprite-sheet art.
- A broad enemy architecture ADR.
- Changing **Dash** into an **Attack Card**.
- Changing **Statement** or **Function** card availability rules.
- Rebalancing Bugs.
- Rebalancing round rewards.

## Further Notes

This PRD intentionally keeps the first Hopper slice narrow. The design should answer one question first: does a single evasive, telegraphed ranged enemy make **Dash** and **Statement** positioning more interesting?

The resolved domain glossary updates live in `CONTEXT.md`. The existing research note that motivated this PRD is `rpi/research/2026-05-07T22-38-02Z_enemy-ideas.md`, but this PRD narrows that research substantially by excluding preview, weighted waves, variants, HP scaling, and later enemy types.

Initial tuning values are defaults, not sacred constants. Core behavior rules are stricter: one Hopper from round 2 onward, Hopper replaces the newest Bug slot, charged-shot aim locks at windup start, **Dash** consumes Hopper shots, corner escape obeys normal hop rules, Hopper is a normal enemy target, and Collapse restores Hopper state.
