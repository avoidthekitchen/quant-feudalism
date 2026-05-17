# Quant Feudalism → Hyper Light Drifter Style Overhaul

**Date**: 2026-05-12

## Strategy

- **Art pipeline**: Dramatically improve procedural art (keep `generated-art.ts` codebase, rewrite frames)
- **Color palette**: Keep cyber-feudalism (neon teal/pink on dark), add additive blending glow
- **Scope**: Full batched overhaul in sequenced phases
- **Performance target**: 60fps on mid-range hardware
- **HUD**: Keep existing HUD, apply HLD-inspired glow styling
- **Attacks**: Add 3-hit slash combo chain
- **Dash cancel**: Smear blend from attack animation into dash

## Phase 0 — Art Pipeline Rewrite (`src/game/art/`)

```
src/game/art/
├── palette.ts              # Central palette + gradient utilities
├── actors/
│   ├── player.ts           # Draws player per frame (8 dirs × cols)
│   ├── bug.ts              # Draws bug per frame
│   └── hopper.ts           # Draws hopper per frame
├── vfx.ts                  # Slash arcs, bolt glows, spark rings, screen flash
├── environment.ts          # Floor, walls, gate, haze, parallax layers
└── sheets.ts               # Sheet layout, frame registration, animation configs
```

### Frame increase

| Action | Current | Target |
|--------|---------|--------|
| idle   | 2       | 6      |
| run    | 4       | 6-8    |
| attack | 3       | 5-7 (windup → arc → follow-through) |
| dash   | 3       | 4-6 (dissolve into streak) |

Smear frames: pixel-stretched intermediate frames for run/dash speed.

Sheet: 10 action columns × 8 direction rows = 80 frames per actor.

## Phase 1 — Combat Feel

### 1a. Movement priority override
WASD always applies velocity. Attack animation plays independently. Dash immediately cancels attack.

### 1b. Input buffering
150ms buffer window. Queue dash, melee, ranged, cycle end. Execute oldest valid on action complete.

### 1c. Afterimage chain
5 ghosts at 30ms spacing. Alpha 0.4→0, cyan tint, ADD blend. Replaces single dash ghost.

### 1d. 3-hit slash combo
Slash chains within 400ms window. Escalating arcs: horizontal → diagonal → overhead.
Damage: 15→18→28. Each hit recharges 3 Compute.

## Phase 2 — VFX Overhaul

All effects use ADD blend mode with drawn glow textures:

| Effect | Approach |
|--------|----------|
| Slash arcs | 5-7 frame arc animation with glow fringe |
| Bolt | Thin core + soft glow fringe + trailing particles |
| Impact burst | Radial glow ring + spark cluster + white flash |
| Kill burst | Expanding ring (cyan core) + particle scatter |
| Dash trail | Afterimage chain (Phase 1c) |
| Refund aura | Organic flame/corona with additive blend |
| Hit-stop flash | 1-frame white flash overlay (ADD blend) |

## Phase 3 — Camera & Environment

### 3a. Camera
- Smooth lerp follow (0.08-0.12 factor)
- Look-ahead toward pointer (32-48px)
- Death zoom out to 0.85x

### 3b. Parallax backgrounds
3 layers (far mountains / mid pillars / near debris) at 0.05× / 0.15× / 0.4× scroll rates.
Procedurally generated.

### 3c. Atmospheric particles
Floating dust/ember clusters, always active, animated.

## Phase 4 — Polish

- Hit-stop: extend + add white flash
- Screen shake: variance by damage magnitude
- Animation blending: deceleration frames on run→idle

## Implementation Order

```
Phase 0 (art pipeline)  →  Foundation, no gameplay changes
Phase 1 (combat feel)   →  Core gameplay transformation
Phase 2 (VFX)           →  Visual impact on existing systems
Phase 3 (camera + env)  →  Atmosphere and polish
```
