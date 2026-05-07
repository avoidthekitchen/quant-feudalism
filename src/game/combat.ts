export type CombatAbilityAction = "dash" | "melee" | "ranged";

export const ABILITY_COOLDOWNS_MS: Record<CombatAbilityAction, number> = {
  dash: 1100,
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

export function formatRefundFeedback(restored: {
  computeRateLimit: number;
  computeCredits: number;
}): string {
  if (restored.computeRateLimit <= 0 && restored.computeCredits <= 0) {
    return "Refund found both compute pools full.";
  }

  return `Refund restored +${restored.computeRateLimit} Compute Rate Limit, +${restored.computeCredits} Compute Credits.`;
}
