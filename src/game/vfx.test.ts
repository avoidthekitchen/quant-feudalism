import assert from "node:assert/strict";
import test from "node:test";
import { VFX_PRESETS, validateVfxPresetCatalog } from "./vfx-presets.ts";

test("required combat VFX preset ids are registered", () => {
  const expected = [
    "dash_afterimage",
    "melee_slash",
    "ranged_siphon",
    "drone_lunge_windup",
    "collapse_pulse",
    "ghost_replay",
  ];
  const validation = validateVfxPresetCatalog(expected);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.missing, []);
});

test("all VFX presets have positive lifespans", () => {
  Object.values(VFX_PRESETS).forEach((preset) => {
    assert.equal(preset.lifespanMs > 0, true);
  });
});

test("camera-impulse VFX remain defined for dash and collapse beats", () => {
  assert.equal(Boolean(VFX_PRESETS.dash_afterimage.cameraShake), true);
  assert.equal(Boolean(VFX_PRESETS.collapse_pulse.cameraShake), true);
});
