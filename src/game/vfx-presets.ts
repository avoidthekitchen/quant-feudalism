export type VfxPreset = {
  id: string;
  lifespanMs: number;
  blendMode?: "normal" | "add" | "screen";
  glowColor?: number;
  cameraShake?: { durationMs: number; intensity: number };
};

export const VFX_PRESETS: Record<string, VfxPreset> = {
  dash_afterimage: {
    id: "dash_afterimage",
    lifespanMs: 180,
    blendMode: "screen",
    glowColor: 0x60ffd3,
    cameraShake: { durationMs: 90, intensity: 0.0022 },
  },
  melee_slash: {
    id: "melee_slash",
    lifespanMs: 110,
    blendMode: "add",
    glowColor: 0xff4fa4,
  },
  ranged_siphon: {
    id: "ranged_siphon",
    lifespanMs: 220,
    blendMode: "screen",
    glowColor: 0x60ffd3,
  },
  drone_lunge_windup: {
    id: "drone_lunge_windup",
    lifespanMs: 340,
    blendMode: "normal",
    glowColor: 0xff4fa4,
  },
  collapse_pulse: {
    id: "collapse_pulse",
    lifespanMs: 1000,
    blendMode: "screen",
    glowColor: 0xff4fa4,
    cameraShake: { durationMs: 140, intensity: 0.0022 },
  },
  ghost_replay: {
    id: "ghost_replay",
    lifespanMs: 800,
    blendMode: "screen",
    glowColor: 0x9cf9ff,
  },
};

export function validateVfxPresetCatalog(ids: string[]): { ok: boolean; missing: string[] } {
  const missing = ids.filter((id) => !VFX_PRESETS[id]);
  return { ok: missing.length === 0, missing };
}
