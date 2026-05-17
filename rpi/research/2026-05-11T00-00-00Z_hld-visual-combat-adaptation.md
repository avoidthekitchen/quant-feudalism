# HLD Visual & Combat Adaptation Plan

Created: 2026-05-11T00:00:00Z

## Context

Research into Hyper Light Drifter's visual style and combat mechanics, and how to adapt its feel (not replicate its look) into Quant Feudalism's existing neon cyber aesthetic. This is a parallel effort across movement feel and visual richness, broken into 5 phases.

### Design Decisions (2026-05-11)

- **Visual direction:** Adapt HLD's feel into existing neon cyber procedural art. Keep the aesthetic, increase density and animation quality.
- **Combat rhythm:** Shorter Preparing Windows (~700ms, down from 3000ms). Keep the cycle concept but make it a brief weapon recovery, not a punishment.
- **Dash role:** Make dash the central defensive mechanic. ~350ms flat cooldown.
- **Resolution:** Keep 1280x720.
- **Art pipeline:** Keep procedural generation, go deeper.
- **Scope:** 5 focused phases.

---

## Where We Are vs. Where HLD Is

| Dimension | Hyper Light Drifter | Quant Feudalism (current) |
|---|---|---|
| Resolution | 480x270 native, nearest-neighbor upscale | 1280x720, pixelArt mode on |
| Art | High-density pixel art, rich environmental detail, handcrafted | Procedural canvas drawing, geometric shapes, neon cyber |
| Animation frames | High frame counts, fluid motion | 2 idle / 4 run / 3 attack / 3 dash per direction |
| Combat rhythm | Dash → sword → dash → gun, continuous flow | Active Window → 3s Preparing Window cooldown break |
| Dash identity | Core defensive tool, short cooldown, i-frames, constant use | Exists but 1100ms cooldown, used situationally |
| Enemy design | Telegraphed via animation, readable wind-ups | Telegraphed via geometric lines/rectangles |
| Resource tension | 5 HP, sword hits fuel gun ammo | Compute Credits + Rate Limit, card draw system |
| Movement | Instant acceleration | 1140 px/s² acceleration curve |
| Visual storytelling | No text, environments tell story | Text-heavy HTML HUD, scanlines, monospace UI |

### HLD Technical & Design Reference

**Engine & rendering:**
- GameMaker Studio, 480x270 native (upscaled to 1080p/4K with nearest-neighbor)
- 60fps target (120fps on iPad Pro)
- SNES-era inspiration pushed to modern limits

**Visual style:**
- High-density pixel art — more detail per sprite than typical retro games
- Muted, melancholic tones with vibrant accent colors
- Each area has distinct color identity
- Pink/magenta for Drifter's blood/illness contrasts cool blues and greens
- No text — UI projected from companion robot, dialogue is comic panels
- Environmental storytelling on every screen

**Animation:**
- Fluid, high-frame-count sprites despite pixel constraints
- Combat animations snappy — short wind-ups, fast execution, minimal recovery
- Enemy attack telegraphs readable from animation alone
- Bosses evolve attacks as HP drops

**Combat mechanics:**
- Energy sword: primary, short combos
- Guns: secondary, ammo charges by landing sword hits (forces melee engagement)
- Dash: core movement/combat tool, brief i-frames
- Gold blocks: area attack from sky
- 5 HP max — each hit matters enormously
- Skill-gated, not gear-gated
- Strategic sequence: dash to position → sword → dash away → gun pickoff → repeat

**Combat feel:**
- Zero margin for error — every dash and attack must be intentional
- Fair difficulty through readable telegraphs
- Nothing overtly punitive or unfair
- Post-launch patch added dash i-frames (community debated difficulty)

**Movement:**
- Instant acceleration — no gradual ramp
- Dash is the identity
- Disasterpeace soundtrack, no dialogue, visual cues only

---

## Current Code State

### Key Constants

| Value | Location | Current |
|---|---|---|
| Dash cooldown | `combat.ts:4` | 1100ms |
| Dash duration | `ArenaScene.ts:196` | 0.145s |
| Dash i-frames | `ArenaScene.ts:197` | 0.24s |
| Dash speed | `ArenaScene.ts:193` | 520 (base) × 1.5 = 780 effective |
| Movement accel | `ArenaScene.ts:191` | 760 × 1.5 = 1140 effective |
| Movement decel | `ArenaScene.ts:192` | 980 × 1.5 = 1470 effective |
| Max speed | `ArenaScene.ts:190` | 150 × 1.5 = 225 effective |
| Speed multiplier | `ArenaScene.ts:189` | 1.5 |
| Preparing Window | `compute-cycle.ts:52` | 3000ms |
| Preparing speed penalty | `ArenaScene.ts:825` | 0.6× |
| Melee attack lock | `ArenaScene.ts:198` | 0.13s |
| Ranged movement pause | `ArenaScene.ts:199` | 0.32s |
| Melee range | `ArenaScene.ts:194` | 166px |
| Melee stun | `ArenaScene.ts:195` | 0.28s |

### Animation System

**Frame counts** (`generated-art.ts:10-15`):
- idle: 2 frames
- run: 4 frames
- attack: 3 frames
- dash: 3 frames
- 8 directions × 12 frames = 96 frames per sheet
- Frame size: 192×224 pixels
- Display scale: 0.5

**Animation FPS** (ArenaScene):
- Run: 11 FPS (arena), 9 FPS (shop)
- Idle: 3-5 FPS
- Attack: 15 FPS
- Dash: 15 FPS

**Direction system:** 8-directional, west-facing mirrored from east-facing. 5 unique directions drawn.

### Combat System

- Card-driven: 4 cards (Slash, Bolt, Trim, Refund)
- Two queues: melee (Statement) and ranged (Function)
- Active Window (attack freely) → Preparing Window (3s cooldown, 60% movement)
- Compute Credits + Rate Limit dual resource
- Dash: free, 1100ms cooldown, 240ms i-frames, cannot cancel attacks

### Enemies

**Bug:**
- 44 HP, flock movement (boids), lunge attack
- Telegraph: magenta rectangle line during 340ms windup

**Hopper:**
- 36 HP, hop movement, ranged charged shot
- Telegraph: orange rectangle + orange glow circle during 550ms windup

---

## Phase 1: Movement Snap & Dash Centrality

*Files: `combat.ts`, `ArenaScene.ts`, `combat.test.ts`, `quantum-tuner.test.ts`*

### Changes

1. **Reduce dash cooldown** (`combat.ts:4`): `dash: 1100` → `dash: 350`
2. **Allow dash to cancel melee attacks** (`ArenaScene.ts:945`): Remove `playerAttackTimer > 0` guard from `tryDash()`. This is the single biggest feel change — enables dash-attack-dash chains.
3. **Sharpen acceleration** (`ArenaScene.ts:191`): `playerBaseAcceleration: 760` → `2000` (effective 3000 px/s², reaches max speed in ~4 frames)
4. **Keep deceleration as-is** — 1470 px/s² effective is already snappy.
5. **Increase dash speed** (`ArenaScene.ts:193`): `playerBaseDashSpeed: 520` → `580` for more punch per dash.
6. **Shorten i-frames** (`ArenaScene.ts:197`): `playerDashInvulnerabilityDuration: 0.24` → `0.16` — shorter i-frames since dash is more frequent, but still covers active dash.
7. **Update test assertions** (`combat.test.ts:20`, `quantum-tuner.test.ts` snapshots).

### Target Values

| Metric | Before | After |
|---|---|---|
| Dash cooldown | 1100ms | 350ms |
| Dash speed | 780 px/s | 870 px/s |
| Dash i-frames | 240ms | 160ms |
| Accel (effective) | 1140 px/s² | 3000 px/s² |
| Dash cancels melee | No | Yes |

### Verification

- Dash chainable every ~350ms
- Melee attack cancelable by dash mid-swing
- Movement reaches near-max speed within 4 frames
- `npm test` passes

### Risk

Dash-canceling melee with 350ms cooldown may trivialize combat. Player can attack with near-immunity. May need a brief "dash recovery" window (e.g., 100ms post-dash-cancel where you can't attack again). Evaluate after playtesting.

---

## Phase 2: Combat Flow — Shorter Preparing Window

*Files: `compute-cycle.ts`, `ArenaScene.ts`, `compute-cycle.test.ts`*

### Changes

1. **Reduce Preparing Window** (`compute-cycle.ts:52`): `PREPARING_WINDOW_MS: 3000` → `700`
2. **Remove Preparing movement penalty** (`ArenaScene.ts:825`): `preparingMultiplier` from `0.6` to `1.0`. At 700ms it's a brief cooldown — player should dash and position freely.
3. **Keep visual indicator** — red border bars still flash briefly.
4. **Rebalance cycle economy** — faster recycling means more attacks/minute. May need to reduce compute refill per cycle or increase card costs. Needs playtesting.

### Target Values

| Metric | Before | After |
|---|---|---|
| Preparing Window | 3000ms | 700ms |
| Preparing speed | 60% | 100% |
| Attacks per minute (estimated) | ~17 | ~40 |

### Verification

- Combat flows: attack → 0.7s breath → attack → 0.7s breath
- Preparing window feels like weapon recovery, not punishment
- Card economy still creates tension (not infinite attacks)
- `npm test` passes

### Risk

Card economy was designed around 3000ms windows. Faster cycling changes compute balance significantly. May need to adjust: compute refill per cycle, card costs, draw mechanics, or deck size. Evaluate after playtesting.

---

## Phase 3: Animation Fluidity

*Files: `generated-art.ts`, `ArenaScene.ts`*

### Changes

1. **Increase frame counts** (`generated-art.ts:10-15`):
   - idle: 2 → 4 (breathing cycle, subtle weight shift)
   - run: 4 → 6 (proper stride: contact → push → pass → pull → contact → push)
   - attack: 3 → 5 (windup → chamber → strike → follow-through → recovery)
   - dash: 3 → 4 (crouch → launch → travel → land)

2. **Increase animation FPS**:
   - Run: 11 → 14 FPS (smoother perceived motion)
   - Attack: 15 → 18 FPS (snappier combat)

3. **Richer per-frame variation** in `drawPlayerSheetFrame()`:
   - 6-point run cycle leg positions (current: 4-point via array index)
   - Torso rotation and cloth/cape flutter during run
   - Head bob varying by phase
   - Attack frames with escalating slash arc intensity (frame 0: windup glow, frame 1: chamber, frame 2: peak strike white flash, frame 3: follow-through arc, frame 4: recovery)
   - Dash frames with progressive blur/trail intensity

4. **Enemy animation improvements**:
   - Bug: `attack` frames show body coiling → launching with visible thrust
   - Hopper: `attack` frames show antenna raising → body glowing → firing
   - Match increased frame counts for all actors

5. **New frame dimensions**: Sheet grows from 12 columns to 19 columns (4+6+5+4). Total frames: 8 × 19 = 152 per sheet.

### Target Values

| Metric | Before | After |
|---|---|---|
| Idle frames | 2 | 4 |
| Run frames | 4 | 6 |
| Attack frames | 3 | 5 |
| Dash frames | 3 | 4 |
| Run FPS | 11 | 14 |
| Attack FPS | 15 | 18 |
| Total frames/sheet | 96 | 152 |

### Verification

- Animations fluid at speed, no frame-skipping during dash-attack-dash chains
- Enemy attacks readable from animation state alone
- Generated sprite sheets load without visual artifacts
- Frame rate stable at 60fps

### Risk

Larger sprite sheets = more texture memory. At 1280x720 should be fine, but profile after. `generated-art.ts` will grow significantly — consider splitting into per-actor files (`generated-art-player.ts`, `generated-art-drone.ts`, etc.).

---

## Phase 4: Visual Density & Environment

*Files: `generated-art.ts`, `ArenaScene.ts`*

### Changes

1. **Richer player sprite** — more layers per frame in `drawPlayerSheetFrame()`:
   - Cape/cloth responding to movement (flutter during dash, drag during run)
   - Armor edge highlights (brighter neon accents along polygon edges)
   - Glow emanation during dash and attack (not just color shifts — actual light bloom via ADD-blended shapes)
   - Particle trails baked into dash frames (small scattered pixels behind direction of travel)
   - Energy crackling along sword during attack windup

2. **Floor tile variety** — generate 3-5 floor tile textures:
   - Base tile (current diamond)
   - Cracked variant (broken diamond lines, displaced segments)
   - Circuit trace variant (thin teal lines running through)
   - Pool variant (dark reflection with faint glow)
   - Grate variant (grid pattern)
   - Random placement weighted toward base (70% base, 8% each variant)

3. **Environmental decorations**:
   - Cable runs along arena edges (thin colored lines, maybe with occasional sparks)
   - Broken machinery debris (small static obstacle sprites)
   - Wall-mounted light strips (thin glowing rectangles on borders)
   - Scorch marks on floor (semi-transparent dark shapes)
   - Rubble piles near pillars

4. **Atmospheric depth**:
   - More haze layers at varying depths and scales
   - Floating particles with varied sizes, speeds, and colors (not just embers)
   - Ambient light sources (glowing panels on pillars, flickering strips)
   - Subtle floor reflections (darker, shifted duplicate of nearby objects)

5. **Hit effect richness**:
   - Multi-layered slash arcs (3+ overlapping shapes with different colors and opacities)
   - Directional impact sparks that respect attack angle
   - Screen-wide flash on heavy hits
   - Enemy death explosions with more particle variety (color, size, spread)
   - Persistent scorch marks where kills happen

### Verification

- Arena feels dense and atmospheric
- Every screen region has visual interest
- No frame rate degradation (profile before/after)
- Maintains the neon cyber aesthetic identity

### Risk

Significant expansion of `generated-art.ts`. Recommend refactoring into separate files per category before starting this phase. Performance profiling critical — more draw calls per frame for environmental detail.

---

## Phase 5: Enemy Design & Telegraphs

*Files: `generated-art.ts`, `ArenaScene.ts`, `bug-movement.ts`, potentially new enemy files*

### Changes

1. **Replace geometric telegraphs with animation-driven telegraphs**:
   - Bug lunge: body compresses backward, wings fold, glow intensifies during 340ms windup → launch with visible thrust flash
   - Hopper shot: body glows progressively brighter, antennae lift and converge toward aim direction → fire with flash
   - Remove `qf-lunge-telegraph` and `qf-shot-telegraph` rectangle rendering
   - Keep the timing windows identical, just express them through sprite animation

2. **Dash-interactive enemy behaviors**:
   - Enemies that track dash direction and delay attacks to punish dash landing
   - Area-denial attacks (ground hazards that force dash timing)
   - Tracking projectiles that require dash i-frames to avoid
   - Enemies that punish stationary play and reward aggressive dash positioning

3. **Enemy stagger animations**:
   - Visible stagger on hit (body recoil, flash white, brief pause)
   - Stagger duration scales with hit strength
   - Stagger can interrupt windup animations (rewarding aggressive play)

4. **Kill effect variety**:
   - Melee kill: slash-through dissolve (enemy splits along attack angle)
   - Ranged kill: energy burst (explosion from impact point)
   - Dash-through kill: split apart (enemy divides perpendicular to dash direction)

5. **Third enemy type** (if scoped in):
   - Designed specifically for dash-centric combat
   - Punishes stationary play, rewards aggressive positioning
   - See `rpi/research/2026-05-07T22-38-02Z_enemy-ideas.md` for candidates

### Verification

- Enemy attacks readable from animation alone (no UI telegraph overlays needed)
- Every attack has a dodge window that rewards dash timing
- Kill effects feel distinct and satisfying
- New enemy type (if added) integrates with dash-centric combat loop

### Risk

Animation-driven telegraphs require more frames per enemy. Ensure Phase 3's frame structure supports this before starting Phase 5. New enemy type is optional — can be deferred.

---

## Implementation Order & Dependencies

```
Phase 1 (Movement/Dash) ← independent, start here
    ↓
Phase 2 (Combat Flow) ← depends on Phase 1 dash changes
    ↓
Phase 3 (Animation) ← can start alongside Phase 2
    ↓
Phase 4 (Visuals) ← depends on Phase 3 frame structure
    ↓
Phase 5 (Enemies) ← depends on Phase 3+4 for visual telegraphs
```

Phases 1+2 are constants/logic changes (fast). Phase 3 is the biggest effort (drawing code expansion). Phases 4+5 build on Phase 3's frame structure.

---

## Open Risks

1. **Dash-canceling may trivialize combat** — 130ms melee lock cancelable by 350ms dash means near-constant attacking with i-frames. May need a post-dash-cancel attack delay (100ms). Evaluate after Phase 1 playtesting.

2. **Preparing Window economy rebalance** — 700ms windows radically change attack frequency. Card costs, compute refill, and draw mechanics may need adjustment. Evaluate after Phase 2 playtesting.

3. **Code organization** — `generated-art.ts` at 741 lines will grow 3-5× across Phases 3-4. Refactor into per-actor/per-category files before Phase 3.

4. **Performance** — More frames = larger textures. More environment detail = more draw calls. Profile after Phase 3 and Phase 4.
