import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITY_COOLDOWNS_MS,
  calculateRangedSiphonRefund,
  getCooldownProgress,
  MELEE_DAMAGE,
  HOPPER_CHARGED_SHOT_DAMAGE,
  HOPPER_CHARGED_SHOT_HIT_RADIUS,
  HOPPER_CHARGED_SHOT_SPEED,
  HOPPER_HP,
  HOPPER_TOUCH_DAMAGE,
  RANGED_DIRECT_DAMAGE,
  RANGED_PROJECTILE_SPEED,
  RANGED_PULL_RADIUS,
  RANGED_SPLASH_DAMAGE,
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

test("Function attacks use a broad and quick siphon impact", () => {
  assert.equal(RANGED_PULL_RADIUS, 184);
  assert.equal(RANGED_PROJECTILE_SPEED, 590);
});

test("attack damage values preserve Statement tradeoffs and Function splash math", () => {
  assert.equal(MELEE_DAMAGE, 23);
  assert.equal(RANGED_DIRECT_DAMAGE, 40);
  assert.equal(RANGED_SPLASH_DAMAGE, 20);
});

test("Hopper combat defaults make it fragile but threatening at range", () => {
  assert.equal(HOPPER_HP, 36);
  assert.equal(HOPPER_TOUCH_DAMAGE, 10);
  assert.equal(HOPPER_CHARGED_SHOT_DAMAGE, 18);
  assert.equal(HOPPER_CHARGED_SHOT_SPEED, 350);
  assert.equal(HOPPER_CHARGED_SHOT_HIT_RADIUS, 20);
});

test("cooldown progress reports readiness for the player-adjacent rings", () => {
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, ABILITY_COOLDOWNS_MS.ranged), 0);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 0), 1);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 410), 0.5);
});
