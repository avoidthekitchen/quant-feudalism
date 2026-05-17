export type CombatAbilityAction = "dash" | "melee" | "ranged";

export const ABILITY_COOLDOWNS_MS: Record<CombatAbilityAction, number> = {
  dash: 350,
  melee: 350,
  ranged: 820,
};

export const RANGED_PROJECTILE_SPEED = 590;
export const RANGED_PULL_RADIUS = 184;
export const RANGED_PULL_FORCE = 220;
export const MELEE_DAMAGE = 23;
export const RANGED_DIRECT_DAMAGE = 40;
export const RANGED_SPLASH_DAMAGE = RANGED_DIRECT_DAMAGE / 2;
export const RANGED_SIPHON_REFUND_PER_ENEMY = 6;
export const RANGED_SIPHON_REFUND_CAP = 18;
export const HOPPER_HP = 36;
export const HOPPER_TOUCH_DAMAGE = 10;
export const HOPPER_CHARGED_SHOT_DAMAGE = 18;
export const HOPPER_CHARGED_SHOT_SPEED = 350;
export const HOPPER_CHARGED_SHOT_HIT_RADIUS = 20;

export function getCooldownProgress(cooldownMs: number, remainingMs: number): number {
  if (cooldownMs <= 0) {
    return 1;
  }

  const safeRemainingMs = Math.max(0, Math.min(cooldownMs, remainingMs));
  return 1 - safeRemainingMs / cooldownMs;
}

export function calculateRangedSiphonRefund(affectedEnemies: number): number {
  const safeEnemyCount = Math.max(0, Math.floor(affectedEnemies));
  return Math.min(RANGED_SIPHON_REFUND_CAP, safeEnemyCount * RANGED_SIPHON_REFUND_PER_ENEMY);
}
