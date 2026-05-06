export type AttackCardType = "melee" | "ranged";
export type ComputeCyclePhase = "active" | "preparing";

export interface AttackCard {
  id: string;
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
  computeOverdrawCap: number;
  allotmentCurrent: number;
  allotmentOverdrawCap: number;
  meleeCost: number;
  rangedCost: number;
  cooldowns: Record<AttackCardType, number>;
  attackCommitted: boolean;
}

const STARTER_MELEE_COUNT = 15;
const STARTER_RANGED_COUNT = 5;
export const STARTER_DECK_SIZE = STARTER_MELEE_COUNT + STARTER_RANGED_COUNT;
export const DEFAULT_QUEUE_LIMIT = 7;
export const PREPARING_WINDOW_MS = 3_000;

export function createStarterComputeCycle(seed = Date.now()): ComputeCycleState {
  const deck: AttackCard[] = [
    ...Array.from({ length: STARTER_MELEE_COUNT }, (_, index) => ({
      id: `melee-${index + 1}`,
      type: "melee" as const,
    })),
    ...Array.from({ length: STARTER_RANGED_COUNT }, (_, index) => ({
      id: `ranged-${index + 1}`,
      type: "ranged" as const,
    })),
  ];

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
): { played: boolean; state: ComputeCycleState; card?: AttackCard } {
  const next = cloneComputeCycleState(state);
  if (next.phase !== "active") {
    return { played: false, state: next };
  }

  const card = next.queues[type].shift();
  if (!card) {
    return { played: false, state: next };
  }

  next.discardPile.push(card);
  return { played: true, state: next, card };
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
  if (state.queues[type].length <= 0) {
    return false;
  }

  if (
    check.computeCurrent <= -check.computeOverdrawCap ||
    check.allotmentCurrent <= -check.allotmentOverdrawCap
  ) {
    return false;
  }

  return check.cooldowns[type] >= 0;
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
