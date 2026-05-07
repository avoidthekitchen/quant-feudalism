import { ABILITY_COOLDOWNS_MS, MELEE_DAMAGE, RANGED_DIRECT_DAMAGE } from "./combat.ts";

export type CardId = "slash" | "bolt" | "trim" | "refund";
export type CardClass = "basic" | "special";
export type CardType = "melee" | "ranged";

export interface AttackCardDefinition {
  id: CardId;
  name: string;
  type: CardType;
  cardClass: CardClass;
  cost: number;
  cooldownMs: number;
  damage: number;
  copyLimit?: number;
  summary: string;
}

export const ATTACK_CARD_CATALOG: Record<CardId, AttackCardDefinition> = {
  slash: {
    id: "slash",
    name: "Slash",
    type: "melee",
    cardClass: "basic",
    cost: 18,
    cooldownMs: ABILITY_COOLDOWNS_MS.melee,
    damage: MELEE_DAMAGE,
    summary: "Existing close-range Statement attack.",
  },
  bolt: {
    id: "bolt",
    name: "Bolt",
    type: "ranged",
    cardClass: "basic",
    cost: 40,
    cooldownMs: ABILITY_COOLDOWNS_MS.ranged,
    damage: RANGED_DIRECT_DAMAGE,
    summary: "Existing projectile Function attack.",
  },
  trim: {
    id: "trim",
    name: "Trim",
    type: "melee",
    cardClass: "special",
    cost: 18,
    cooldownMs: ABILITY_COOLDOWNS_MS.melee,
    damage: 12,
    copyLimit: 10,
    summary: "Half-damage Statement that draws one card.",
  },
  refund: {
    id: "refund",
    name: "Refund",
    type: "ranged",
    cardClass: "special",
    cost: 0,
    cooldownMs: 1_000,
    damage: 0,
    copyLimit: 10,
    summary: "Arms a flat Compute discount for the next three attacks this Active Window.",
  },
};

export function createAttackCard(id: CardId): AttackCardDefinition {
  return { ...ATTACK_CARD_CATALOG[id] };
}

export function getAttackCardDefinition(id: string): AttackCardDefinition | undefined {
  return ATTACK_CARD_CATALOG[id as CardId];
}

export function getAttackCardDefinitions(): AttackCardDefinition[] {
  return Object.values(ATTACK_CARD_CATALOG).map((definition) => ({ ...definition }));
}
