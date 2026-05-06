export type CombatAbilityAction = "dash" | "melee" | "ranged";

export const ABILITY_COOLDOWNS_MS: Record<CombatAbilityAction, number> = {
  dash: 1100,
  melee: 350,
  ranged: 820,
};

export const RANGED_PULL_RADIUS = 112;
export const RANGED_PULL_FORCE = 220;
export const RANGED_SIPHON_REFUND_PER_ENEMY = 6;
export const RANGED_SIPHON_REFUND_CAP = 18;

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
