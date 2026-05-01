# Asset Work Spec

This file lists all authored assets needed to replace procedural placeholders while preserving gameplay behavior.

The current runtime default is procedural art. Use `?art=external` while integrating these files, and use `?art=external-only` when you want missing atlas keys or frames to surface during validation.

## Output Format

- Preferred: PNG + JSON atlas exported in Phaser/TexturePacker-compatible format.
- Include normal maps where noted (`*_n.png`).
- Transparent backgrounds for actor and VFX textures.
- Keep color space and export settings consistent across each atlas.

## Naming And Frame Contracts

- Actor atlas keys:
  - `qf-player-sheet`
  - `qf-drone-sheet`
- Frame names must remain:
  - `<action>-<direction>-<frame>`
- Directions:
  - `s`, `se`, `e`, `ne`, `n`, `nw`, `w`, `sw`
- Actions and frame counts:
  - `idle` = 2 frames (`0..1`)
  - `run` = 4 frames (`0..3`)
  - `attack` = 3 frames (`0..2`)
  - `dash` = 3 frames (`0..2`)

## Required Assets

### Actors

- `assets/art/actors/player.png`
- `assets/art/actors/player.json`
- `assets/art/actors/player_n.png`
- `assets/art/actors/drone.png`
- `assets/art/actors/drone.json`
- `assets/art/actors/drone_n.png`

### Environment

- `assets/art/environment/floor.png` (`qf-floor`)
- `assets/art/environment/shadow.png` (`qf-shadow`)
- `assets/art/environment/pillar.png` + `pillar_n.png` (`qf-pillar`)
- `assets/art/environment/gate.png` + `gate_n.png` (`qf-gate`)
- `assets/art/environment/terminal.png` (`qf-terminal`)

### Combat VFX / Props

- `assets/art/vfx/bolt.png` (`qf-bolt`)
- `assets/art/vfx/slash.png` (`qf-slash`)
- `assets/art/vfx/haze.png` (`qf-haze`, reused by displacement and particles)

## Resolution Targets

- Actor frames:
  - Target logical frame footprint equivalent to current 96x112 layout, but authored at higher source resolution.
  - Recommended source export per frame cell: 192x224 or 256x298 (2x to ~2.66x).
- Environment textures:
  - Floor tile: at least 256 px wide; 512 px preferred for crisp filtering.
  - Pillar/gate/terminal: sized to avoid upscaling in-scene.
- VFX:
  - Slash and bolt should hold up under additive blending and scale tweening; avoid compression artifacts.

## Pivot, Spacing, And Padding

- Keep actor foot contact region stable across frames and directions.
- Use atlas padding/extrusion (minimum 2 px, preferred 4 px) to avoid sampling seams with smooth rendering.
- Maintain consistent framing so physics hitbox alignment in scene code stays valid.

## Blender Render Guidance

- Use orthographic camera for actor sheet renders.
- Lock camera distance, focal setup, and per-action root transform.
- Export diffuse/albedo and normal outputs with identical framing.
- Avoid baked background lighting that conflicts with runtime lighting pipeline.

## Acceptance Checklist

- All required keys load through `ART_ASSET_MANIFEST`.
- `?art=external` loads authored art with no missing-asset loader errors.
- `validateLoadedAssets` passes with external art present.
- Animations play with no missing-frame warnings.
- Arena gameplay remains readable during dash/melee/ranged/lunge/collapse moments.
