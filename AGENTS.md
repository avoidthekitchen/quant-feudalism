# AGENTS

Contributor guidance for visual-pipeline and combat-polish work.

## Art Pipeline Rules

- Procedural art (`src/game/generated-art.ts`) is the default runtime mode until the authored atlas set exists.
- External authored assets are loaded in `BootScene` via `ART_ASSET_MANIFEST` (`src/game/assets-manifest.ts`) only when requested with `?art=external`, `?art=external-preferred`, or `?art=external-only`.
- Keep procedural fallback runnable; a fresh checkout must not emit missing authored-asset loader errors.
- Keep manifest keys stable:
  - Actor atlases: `qf-player-sheet`, `qf-drone-sheet`
  - Environment/VFX: `qf-floor`, `qf-shadow`, `qf-pillar`, `qf-gate`, `qf-terminal`, `qf-bolt`, `qf-slash`, `qf-haze`
- Preserve frame naming for actor atlases: `<action>-<direction>-<frame>` (example: `attack-ne-1`).

## Animation Rules

- Animation coverage must include all combinations of actor, action, direction.
- Any change to action counts/frame names must update:
  - `SPRITE_ACTIONS` / directional assumptions in `generated-art.ts`
  - `buildAnimationSpec` in `src/game/animation-spec.ts`
  - related tests in `src/game/animation-spec.test.ts`

## VFX Rules

- Use `ArenaVfxSystem` (`src/game/vfx.ts`) for combat presentation events rather than embedding one-off effect logic in scene methods.
- Preset IDs are contract surface. If you rename/remove IDs, update tests and all trigger call sites.
- New presets should define:
  - finite `lifespanMs`
  - blend mode (if non-default)
  - optional camera impulse where justified

## Lighting And Filters

- Arena is WebGL-first. Keep fallback behavior safe when assets or filters are unavailable.
- Keep camera filters bounded by gameplay readability; avoid persistent high-strength blur/distortion during normal play.
- Use `setLighting(true)` only on objects intended to participate in scene lighting.

## Test Expectations

- Before merging visual-pipeline changes, run:
  - `npm test`
  - `npm run build`
- Required automated coverage:
  - manifest validation + art-mode fallback behavior
  - animation spec completeness and fallback behavior
  - VFX preset contract IDs
