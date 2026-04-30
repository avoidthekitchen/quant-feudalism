export type CombatAbilityAction = "dash" | "melee" | "ranged";

export const ABILITY_COOLDOWNS_MS: Record<CombatAbilityAction, number> = {
  dash: 700,
  melee: 700,
  ranged: 820,
};

export const CACHE_DISCOUNT_WINDOWS_MS: Record<CombatAbilityAction, number> = {
  dash: 140,
  melee: 160,
  ranged: 160,
};
export const CACHE_DISCOUNT_MULTIPLIER = 0.1;

export const RANGED_PULL_RADIUS = 112;
export const RANGED_PULL_FORCE = 220;
export const RANGED_SIPHON_REFUND_PER_ENEMY = 6;
export const RANGED_SIPHON_REFUND_CAP = 18;

export function getCachedAbilityCost(baseCost: number): number {
  return Math.max(1, Math.ceil(baseCost * CACHE_DISCOUNT_MULTIPLIER));
}

export function isCacheWindowOpen(
  action: CombatAbilityAction,
  remainingMs: number,
  cooldownMs: number,
  blocked: boolean,
  canUseDiscount: boolean,
): boolean {
  if (!canUseDiscount || blocked || remainingMs <= 0) {
    return false;
  }

  return remainingMs <= Math.min(CACHE_DISCOUNT_WINDOWS_MS[action], cooldownMs);
}

export function getCacheWindowRatio(action: CombatAbilityAction, cooldownMs: number): number {
  if (cooldownMs <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, CACHE_DISCOUNT_WINDOWS_MS[action] / cooldownMs));
}

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
