import { createAttackCard, getAttackCardDefinition, type CardId, type CardType } from "./card-catalog.ts";
import type { DraftDeck } from "./deck.ts";

export type AttackCardType = CardType;
export type ComputeCyclePhase = "active" | "preparing";

export interface AttackCard {
  id: CardId;
  name: string;
  type: AttackCardType;
}

export interface AttackQueues {
  melee: AttackCard[];
  ranged: AttackCard[];
}

export interface ComputeCycleState {
  phase: ComputeCyclePhase;
  drawPile: AttackCard[];
  discardPile: AttackCard[];
  queues: AttackQueues;
  queueLimit: number;
  preparingRemainingMs: number;
  computeRefill: number;
  seed: number;
}

export interface ActiveWindowEndCheck {
  computeCurrent: number;
  allotmentCurrent: number;
  meleeCost: number;
  rangedCost: number;
  cooldowns: Record<AttackCardType, number>;
  attackCommitted: boolean;
}

export interface AttackCardAffordability {
  computeCurrent: number;
  allotmentCurrent: number;
}

export type AttackCardRejectionReason = "rate-limit" | "credits" | "compute";

const STARTER_MELEE_COUNT = 15;
const STARTER_RANGED_COUNT = 5;
export const STARTER_DECK_SIZE = STARTER_MELEE_COUNT + STARTER_RANGED_COUNT;
export const DEFAULT_QUEUE_LIMIT = 7;
export const PREPARING_WINDOW_MS = 3_000;

export function createStarterComputeCycle(seed = Date.now()): ComputeCycleState {
  return createComputeCycleFromDeck({
    slash: STARTER_MELEE_COUNT,
    bolt: STARTER_RANGED_COUNT,
  }, seed);
}

export function createComputeCycleFromDeck(deckCounts: DraftDeck, seed = Date.now()): ComputeCycleState {
  const deck: AttackCard[] = Object.entries(deckCounts).flatMap(([id, count]) => {
    const definition = getAttackCardDefinition(id);
    const safeCount = Math.max(0, Math.floor(count ?? 0));
    if (!definition || safeCount <= 0) {
      return [];
    }

    return Array.from({ length: safeCount }, () => createAttackCard(definition.id));
  });

  return {
    phase: "active",
    drawPile: shuffleCards(deck, seed),
    discardPile: [],
    queues: {
      melee: [],
      ranged: [],
    },
    queueLimit: DEFAULT_QUEUE_LIMIT,
    preparingRemainingMs: 0,
    computeRefill: 0,
    seed: nextSeed(seed),
  };
}

export function createArenaComputeCycle({
  currentDraftDeck,
  resumeCycle,
  seed = Date.now(),
  computeRefill,
}: {
  currentDraftDeck: DraftDeck;
  resumeCycle?: ComputeCycleState;
  seed?: number;
  computeRefill: number;
}): ComputeCycleState {
  if (resumeCycle) {
    return cloneComputeCycleState({
      ...resumeCycle,
      computeRefill,
    });
  }

  return startActiveWindow(createComputeCycleFromDeck(currentDraftDeck, seed), computeRefill);
}

export function startActiveWindow(state: ComputeCycleState, computeRefill: number): ComputeCycleState {
  const next = cloneComputeCycleState({
    ...state,
    phase: "active",
    preparingRemainingMs: 0,
    computeRefill,
  });

  return drawToQueueLimit(next);
}

export function playAttackCard(
  state: ComputeCycleState,
  type: AttackCardType,
  affordability?: AttackCardAffordability,
): { played: boolean; state: ComputeCycleState; card?: AttackCard; rejectionReason?: AttackCardRejectionReason } {
  const next = cloneComputeCycleState(state);
  if (next.phase !== "active") {
    return { played: false, state: next };
  }

  const cardIndex = next.queues[type].findIndex((card) => isAttackCardAffordable(card, affordability));
  if (cardIndex < 0) {
    return {
      played: false,
      state: next,
      rejectionReason: getQueueRejectionReason(next.queues[type], affordability),
    };
  }

  const [card] = next.queues[type].splice(cardIndex, 1);
  if (!card) {
    return { played: false, state: next };
  }

  next.discardPile.push(card);
  return { played: true, state: next, card };
}

export function drawBonusAttackCard(
  state: ComputeCycleState,
): { state: ComputeCycleState; drew: boolean; shuffled: boolean; card?: AttackCard } {
  const next = cloneComputeCycleState(state);
  let shuffled = false;

  if (next.drawPile.length === 0 && next.discardPile.length > 0) {
    next.drawPile = shuffleCards(next.discardPile, next.seed);
    next.discardPile = [];
    next.seed = nextSeed(next.seed);
    shuffled = true;
  }

  const card = next.drawPile.shift();
  if (!card) {
    return { state: next, drew: false, shuffled };
  }

  next.queues[card.type].push(card);
  return { state: next, drew: true, shuffled, card };
}

export function getAttackCardDisplayName(card: Pick<AttackCard, "id" | "name">): string {
  return card.name || card.id;
}

export function endActiveWindow(state: ComputeCycleState): ComputeCycleState {
  const next = cloneComputeCycleState(state);
  next.discardPile.push(...next.queues.melee, ...next.queues.ranged);
  next.queues = {
    melee: [],
    ranged: [],
  };
  next.phase = "preparing";
  next.preparingRemainingMs = PREPARING_WINDOW_MS;
  return next;
}

export function advanceComputeCycle(
  state: ComputeCycleState,
  elapsedMs: number,
  computeRefill: number,
): ComputeCycleState {
  const next = cloneComputeCycleState(state);
  if (next.phase !== "preparing") {
    return next;
  }

  next.preparingRemainingMs = Math.max(0, next.preparingRemainingMs - Math.max(0, elapsedMs));
  if (next.preparingRemainingMs > 0) {
    return next;
  }

  return startActiveWindow(next, computeRefill);
}

export function shouldEndActiveWindow(
  state: ComputeCycleState,
  check: ActiveWindowEndCheck,
): boolean {
  if (state.phase !== "active" || check.attackCommitted) {
    return false;
  }

  return !canEventuallyPlay(state, check, "melee") && !canEventuallyPlay(state, check, "ranged");
}

export function cloneComputeCycleState(state: ComputeCycleState): ComputeCycleState {
  return {
    phase: state.phase,
    drawPile: state.drawPile.map(cloneCard),
    discardPile: state.discardPile.map(cloneCard),
    queues: {
      melee: state.queues.melee.map(cloneCard),
      ranged: state.queues.ranged.map(cloneCard),
    },
    queueLimit: state.queueLimit,
    preparingRemainingMs: state.preparingRemainingMs,
    computeRefill: state.computeRefill,
    seed: state.seed,
  };
}

function drawToQueueLimit(state: ComputeCycleState): ComputeCycleState {
  const next = cloneComputeCycleState(state);

  while (queuedCount(next) < next.queueLimit && (next.drawPile.length > 0 || next.discardPile.length > 0)) {
    if (next.drawPile.length === 0) {
      next.drawPile = shuffleCards(next.discardPile, next.seed);
      next.discardPile = [];
      next.seed = nextSeed(next.seed);
    }

    const card = next.drawPile.shift();
    if (!card) {
      break;
    }

    next.queues[card.type].push(card);
  }

  return next;
}

function queuedCount(state: ComputeCycleState): number {
  return state.queues.melee.length + state.queues.ranged.length;
}

function canEventuallyPlay(
  state: ComputeCycleState,
  check: ActiveWindowEndCheck,
  type: AttackCardType,
): boolean {
  const hasAffordableQueuedCard = state.queues[type].some((card) =>
    isAttackCardAffordable(card, {
      computeCurrent: check.computeCurrent,
      allotmentCurrent: check.allotmentCurrent,
    })
  );
  if (!hasAffordableQueuedCard) {
    return false;
  }

  return check.cooldowns[type] >= 0;
}

export function isAttackCardAffordable(card: AttackCard, affordability?: AttackCardAffordability): boolean {
  if (!affordability) {
    return true;
  }

  const cost = getAttackCardDefinition(card.id)?.cost ?? Number.POSITIVE_INFINITY;
  return affordability.computeCurrent >= cost && affordability.allotmentCurrent >= cost;
}

function getQueueRejectionReason(
  cards: AttackCard[],
  affordability?: AttackCardAffordability,
): AttackCardRejectionReason | undefined {
  if (!affordability || cards.length <= 0) {
    return undefined;
  }

  const costs = cards.map((card) => getAttackCardDefinition(card.id)?.cost ?? Number.POSITIVE_INFINITY);
  const lacksRateLimit = costs.every((cost) => affordability.computeCurrent < cost);
  const lacksCredits = costs.every((cost) => affordability.allotmentCurrent < cost);

  if (lacksRateLimit && lacksCredits) {
    return "compute";
  }

  if (lacksRateLimit) {
    return "rate-limit";
  }

  if (lacksCredits) {
    return "credits";
  }

  return "compute";
}

function cloneCard(card: AttackCard): AttackCard {
  return { ...card };
}

function shuffleCards(cards: AttackCard[], seed: number): AttackCard[] {
  const shuffled = cards.map(cloneCard);
  let currentSeed = seed;

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    currentSeed = nextSeed(currentSeed);
    const swapIndex = currentSeed % (index + 1);
    const card = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = card;
  }

  return shuffled;
}

function nextSeed(seed: number): number {
  return (Math.imul(seed || 1, 1664525) + 1013904223) >>> 0;
}
