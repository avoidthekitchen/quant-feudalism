import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITY_COOLDOWNS_MS,
  calculateRangedSiphonRefund,
  getCooldownProgress,
} from "./combat.ts";

test("combat cooldowns preserve the existing action cadence without cache discounts", () => {
  assert.equal(ABILITY_COOLDOWNS_MS.dash, 1100);
  assert.equal(ABILITY_COOLDOWNS_MS.melee, 350);
  assert.equal(ABILITY_COOLDOWNS_MS.ranged, 820);
});

test("Function siphon refunds scale per bug and cap below the original shot cost", () => {
  assert.equal(calculateRangedSiphonRefund(0), 0);
  assert.equal(calculateRangedSiphonRefund(1), 6);
  assert.equal(calculateRangedSiphonRefund(2), 12);
  assert.equal(calculateRangedSiphonRefund(3), 18);
  assert.equal(calculateRangedSiphonRefund(7), 18);
});

test("cooldown progress reports readiness for the player-adjacent rings", () => {
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, ABILITY_COOLDOWNS_MS.ranged), 0);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 0), 1);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 410), 0.5);
});
