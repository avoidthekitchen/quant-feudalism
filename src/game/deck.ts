import { getAttackCardDefinition, getAttackCardDefinitions } from "./card-catalog.ts";

export type DraftDeck = Record<string, number>;

export interface DeckValidation {
  valid: boolean;
  message: string;
  total: number;
}

export interface DeckBuilderRow {
  id: string;
  name: string;
  count: number;
  details: string;
  playable: boolean;
  available: boolean;
  canIncrement: boolean;
  canDecrement: boolean;
  definition?: ReturnType<typeof getAttackCardDefinition>;
}

const MIN_DECK_SIZE = 20;
const MAX_DECK_SIZE = 100;

export function createStarterDeck(): DraftDeck {
  return { slash: 15, bolt: 5 };
}

export function resetToStarterDeck(_draft: DraftDeck): DraftDeck {
  return createStarterDeck();
}

export function getDeckTotal(deck: DraftDeck): number {
  return Object.values(deck).reduce((total, count) => total + sanitizeCount(count), 0);
}

export function normalizeDeck(deck: DraftDeck): DraftDeck {
  return Object.fromEntries(
    Object.entries(deck)
      .map(([cardId, count]) => [cardId, sanitizeCount(count)] as const)
      .filter(([, count]) => count > 0),
  );
}

export function incrementDraftCard(deck: DraftDeck, cardId: string, amount = 1): DraftDeck {
  const definition = getAttackCardDefinition(cardId);
  if (!definition) {
    return { ...deck };
  }

  const next = { ...deck };
  const currentCount = sanitizeCount(next[cardId]);
  const requestedCount = currentCount + Math.max(0, Math.floor(amount));
  const totalRoom = Math.max(0, MAX_DECK_SIZE - getDeckTotal(deck));
  const copyRoom = definition.copyLimit === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, definition.copyLimit - currentCount);
  const added = Math.min(requestedCount - currentCount, totalRoom, copyRoom);

  if (added <= 0) {
    return next;
  }

  next[cardId] = currentCount + added;
  return next;
}

export function decrementDraftCard(deck: DraftDeck, cardId: string, amount = 1): DraftDeck {
  const next = { ...deck };
  const currentCount = sanitizeCount(next[cardId]);
  const remaining = currentCount - Math.max(0, Math.floor(amount));

  if (remaining > 0) {
    next[cardId] = remaining;
  } else {
    delete next[cardId];
  }

  return next;
}

export function validateDraftDeck(deck: DraftDeck): DeckValidation {
  const total = getDeckTotal(deck);
  const unavailableId = Object.keys(deck).find((cardId) => !getAttackCardDefinition(cardId));
  if (unavailableId) {
    return {
      valid: false,
      message: "Deck contains unavailable cards. Remove them to deploy.",
      total,
    };
  }

  if (total < MIN_DECK_SIZE) {
    const missing = MIN_DECK_SIZE - total;
    return {
      valid: false,
      message: `Add ${missing} more ${missing === 1 ? "card" : "cards"} to reach the 20-card minimum.`,
      total,
    };
  }

  if (total > MAX_DECK_SIZE) {
    const excess = total - MAX_DECK_SIZE;
    return {
      valid: false,
      message: `Remove ${excess} ${excess === 1 ? "card" : "cards"} to stay under the 100-card maximum.`,
      total,
    };
  }

  const overLimitEntry = Object.entries(deck).find(([cardId, count]) => {
    const definition = getAttackCardDefinition(cardId);
    return definition?.copyLimit !== undefined && sanitizeCount(count) > definition.copyLimit;
  });

  if (overLimitEntry) {
    const definition = getAttackCardDefinition(overLimitEntry[0]);
    return {
      valid: false,
      message: `Special cards are limited to 10 copies each. Reduce ${definition?.name ?? overLimitEntry[0]} to deploy.`,
      total,
    };
  }

  return {
    valid: true,
    message: "Deck ready for deployment.",
    total,
  };
}

export function getDeckBuilderRows(deck: DraftDeck): DeckBuilderRow[] {
  const normalized = normalizeDeck(deck);
  const total = getDeckTotal(normalized);
  const catalogRows = getAttackCardDefinitions().map((definition) => {
    const count = normalized[definition.id] ?? 0;
    const copyRoom = definition.copyLimit === undefined
      ? Number.POSITIVE_INFINITY
      : definition.copyLimit - count;

    return {
      id: definition.id,
      name: definition.name,
      count,
      details: formatDeckBuilderDetails(definition),
      playable: count > 0,
      available: true,
      canIncrement: total < MAX_DECK_SIZE && copyRoom > 0,
      canDecrement: count > 0,
      definition,
    };
  });

  const unavailableRows = Object.entries(normalized)
    .filter(([cardId]) => !getAttackCardDefinition(cardId))
    .map(([cardId, count]) => ({
      id: cardId,
      name: cardId,
      count,
      details: "Unavailable card reference",
      playable: false,
      available: false,
      canIncrement: false,
      canDecrement: count > 0,
      definition: undefined,
    }));

  return [...catalogRows, ...unavailableRows];
}

function formatDeckBuilderDetails(definition: NonNullable<DeckBuilderRow["definition"]>): string {
  const type = definition.type === "melee" ? "Statement" : "Function";
  const cardClass = definition.cardClass === "basic" ? "Basic" : "Special";
  const damage = `${definition.damage} dmg`;
  return `${type} // ${cardClass} // ${definition.cost} cost // ${damage} // ${definition.cooldownMs}ms cooldown // ${definition.summary}`;
}

function sanitizeCount(count: number | undefined): number {
  return Math.max(0, Math.floor(count ?? 0));
}
