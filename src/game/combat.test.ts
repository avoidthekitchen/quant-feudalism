import assert from "node:assert/strict";
import test from "node:test";
import {
  ABILITY_COOLDOWNS_MS,
  CACHE_DISCOUNT_WINDOWS_MS,
  calculateRangedSiphonRefund,
  getCachedAbilityCost,
  getCacheWindowRatio,
  getCooldownProgress,
  isCacheWindowOpen,
} from "./combat.ts";

test("dash and ranged cache windows open during the final 140ms before readiness", () => {
  assert.equal(
    isCacheWindowOpen("dash", CACHE_DISCOUNT_WINDOWS_MS.dash + 1, ABILITY_COOLDOWNS_MS.dash, false, true),
    false,
  );
  assert.equal(
    isCacheWindowOpen("dash", CACHE_DISCOUNT_WINDOWS_MS.dash, ABILITY_COOLDOWNS_MS.dash, false, true),
    true,
  );
  assert.equal(isCacheWindowOpen("dash", 1, ABILITY_COOLDOWNS_MS.dash, false, true), true);
  assert.equal(isCacheWindowOpen("dash", 0, ABILITY_COOLDOWNS_MS.dash, false, true), false);
});

test("melee cache timing is now much closer to ranged than before", () => {
  assert.equal(CACHE_DISCOUNT_WINDOWS_MS.melee, CACHE_DISCOUNT_WINDOWS_MS.ranged);
  assert.equal(
    isCacheWindowOpen("melee", 160, ABILITY_COOLDOWNS_MS.melee, false, true),
    true,
  );
  assert.equal(
    isCacheWindowOpen("melee", 161, ABILITY_COOLDOWNS_MS.melee, false, true),
    false,
  );
});

test("cache window closes when blocked or when compute cannot support a discount", () => {
  assert.equal(isCacheWindowOpen("melee", 80, ABILITY_COOLDOWNS_MS.melee, true, true), false);
  assert.equal(isCacheWindowOpen("melee", 80, ABILITY_COOLDOWNS_MS.melee, false, false), false);
});

test("cached ability costs retain the same symmetric 90 percent discount floor", () => {
  assert.equal(getCachedAbilityCost(24), 3);
  assert.equal(getCachedAbilityCost(18), 2);
  assert.equal(getCachedAbilityCost(40), 4);
});

test("ranged siphon refunds scale per enemy and cap below the original shot cost", () => {
  assert.equal(calculateRangedSiphonRefund(0), 0);
  assert.equal(calculateRangedSiphonRefund(1), 6);
  assert.equal(calculateRangedSiphonRefund(2), 12);
  assert.equal(calculateRangedSiphonRefund(3), 18);
  assert.equal(calculateRangedSiphonRefund(7), 18);
});

test("cooldown helpers expose ratios for the cache wedge and progress ring", () => {
  assert.equal(getCacheWindowRatio("melee", ABILITY_COOLDOWNS_MS.melee), CACHE_DISCOUNT_WINDOWS_MS.melee / 700);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, ABILITY_COOLDOWNS_MS.ranged), 0);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 0), 1);
  assert.equal(getCooldownProgress(ABILITY_COOLDOWNS_MS.ranged, 410), 0.5);
});
