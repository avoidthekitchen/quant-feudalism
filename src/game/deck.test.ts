import assert from "node:assert/strict";
import test from "node:test";
import {
  createComputeCycleFromDeck,
  startActiveWindow,
} from "./compute-cycle.ts";
import {
  createStarterDeck,
  decrementDraftCard,
  getDeckTotal,
  getDeckBuilderRows,
  incrementDraftCard,
  resetToStarterDeck,
  validateDraftDeck,
} from "./deck.ts";

test("Deck Builder rows present card rules and behavior summaries", () => {
  const rows = getDeckBuilderRows({ slash: 15, bolt: 5, trim: 2, refund: 1 });
  const trim = rows.find((row) => row.id === "trim");
  const refund = rows.find((row) => row.id === "refund");

  assert.equal(
    trim?.details,
    "Statement // Special // 18 cost // 12 dmg // 350ms cooldown // Half-damage Statement that draws one card.",
  );
  assert.equal(
    refund?.details,
    "Function // Special // 0 cost // 0 dmg // 1000ms cooldown // Restores capped Compute Rate Limit and Compute Credits.",
  );
});

test("Trim is available in the Deck Builder as a 10-copy Special Statement card", () => {
  const rows = getDeckBuilderRows(createStarterDeck());
  const trim = rows.find((row) => row.id === "trim");
  const withTrim = incrementDraftCard(createStarterDeck(), "trim", 10);
  const capped = incrementDraftCard(withTrim, "trim");

  assert.equal(trim?.available, true);
  assert.equal(trim?.count, 0);
  assert.equal(trim?.canIncrement, true);
  assert.equal(trim?.definition?.name, "Trim");
  assert.equal(trim?.definition?.type, "melee");
  assert.equal(trim?.definition?.cardClass, "special");
  assert.equal(trim?.definition?.copyLimit, 10);
  assert.equal(trim?.definition?.cost, 18);
  assert.equal(trim?.definition?.cooldownMs, 350);
  assert.equal(trim?.definition?.damage, 12);
  assert.deepEqual(withTrim, { slash: 15, bolt: 5, trim: 10 });
  assert.deepEqual(capped, withTrim);
});

test("Refund is available in the Deck Builder as a 10-copy Special Function card", () => {
  const rows = getDeckBuilderRows(createStarterDeck());
  const refund = rows.find((row) => row.id === "refund");
  const withRefund = incrementDraftCard(createStarterDeck(), "refund", 10);
  const capped = incrementDraftCard(withRefund, "refund");

  assert.equal(refund?.available, true);
  assert.equal(refund?.count, 0);
  assert.equal(refund?.canIncrement, true);
  assert.equal(refund?.definition?.name, "Refund");
  assert.equal(refund?.definition?.type, "ranged");
  assert.equal(refund?.definition?.cardClass, "special");
  assert.equal(refund?.definition?.copyLimit, 10);
  assert.equal(refund?.definition?.cost, 0);
  assert.equal(refund?.definition?.damage, 0);
  assert.equal(refund?.definition?.cooldownMs, 1_000);
  assert.deepEqual(withRefund, { slash: 15, bolt: 5, refund: 10 });
  assert.deepEqual(capped, withRefund);
  assert.equal(validateDraftDeck(withRefund).valid, true);
});

test("Refund can deploy into the Function Attack Queue with its card identity", () => {
  const cycle = startActiveWindow(createComputeCycleFromDeck({ slash: 19, refund: 1 }, 1), 96);
  const allCards = [
    ...cycle.drawPile,
    ...cycle.discardPile,
    ...cycle.queues.melee,
    ...cycle.queues.ranged,
  ];
  const refund = allCards.find((card) => card.id === "refund");

  assert.equal(refund?.name, "Refund");
  assert.equal(refund?.type, "ranged");
});

test("starter deck is a valid 20-card Basic deck", () => {
  const deck = createStarterDeck();
  const validation = validateDraftDeck(deck);

  assert.deepEqual(deck, { slash: 15, bolt: 5 });
  assert.equal(getDeckTotal(deck), 20);
  assert.equal(validation.valid, true);
  assert.equal(validation.message, "Deck ready for deployment.");
});

test("Basic card editing can temporarily reduce the Draft Deck below minimum", () => {
  const draft = createStarterDeck();

  const reduced = decrementDraftCard(draft, "bolt", 5);
  const validation = validateDraftDeck(reduced);

  assert.deepEqual(reduced, { slash: 15 });
  assert.equal(validation.valid, false);
  assert.equal(validation.message, "Add 5 more cards to reach the 20-card minimum.");
});

test("Basic cards can increase until the 100-card deck maximum", () => {
  const draft = incrementDraftCard(createStarterDeck(), "slash", 80);
  const capped = incrementDraftCard(draft, "bolt");

  assert.equal(getDeckTotal(draft), 100);
  assert.equal(getDeckTotal(capped), 100);
  assert.equal(validateDraftDeck(draft).valid, true);
});

test("missing Card IDs remain invalid entries until removed", () => {
  const draft = { ...createStarterDeck(), retired: 2 };
  const validation = validateDraftDeck(draft);
  const reduced = decrementDraftCard(draft, "retired");
  const removed = decrementDraftCard(reduced, "retired");

  assert.equal(getDeckTotal(draft), 22);
  assert.equal(validation.valid, false);
  assert.equal(validation.message, "Deck contains unavailable cards. Remove them to deploy.");
  assert.deepEqual(reduced, { slash: 15, bolt: 5, retired: 1 });
  assert.deepEqual(removed, { slash: 15, bolt: 5 });
});

test("Deck Builder rows expose unavailable entries as decrement-only rows", () => {
  const rows = getDeckBuilderRows({ slash: 15, bolt: 5, retired: 2 });
  const missing = rows.find((row) => row.id === "retired");

  assert.equal(missing?.available, false);
  assert.equal(missing?.playable, false);
  assert.equal(missing?.canIncrement, false);
  assert.equal(missing?.canDecrement, true);
  assert.equal(missing?.name, "retired");
});

test("Deck Builder rows keep saved Special counts visible even when over limit", () => {
  const rows = getDeckBuilderRows({ slash: 20, trim: 11 });
  const trim = rows.find((row) => row.id === "trim");

  assert.equal(trim?.available, true);
  assert.equal(trim?.count, 11);
  assert.equal(trim?.canIncrement, false);
  assert.equal(trim?.canDecrement, true);
});

test("Deck invalidity priority reports unavailable cards before size and copy-limit problems", () => {
  assert.equal(
    validateDraftDeck({ slash: 101, retired: 1 }).message,
    "Deck contains unavailable cards. Remove them to deploy.",
  );
  assert.equal(
    validateDraftDeck({ slash: 19 }).message,
    "Add 1 more card to reach the 20-card minimum.",
  );
  assert.equal(
    validateDraftDeck({ slash: 101 }).message,
    "Remove 1 card to stay under the 100-card maximum.",
  );
  assert.equal(
    validateDraftDeck({ slash: 20, trim: 11 }).message,
    "Special cards are limited to 10 copies each. Reduce Trim to deploy.",
  );
});

test("Special over-limit counts remain visible until reduced", () => {
  const draft = { slash: 20, trim: 11 };
  const validation = validateDraftDeck(draft);
  const reduced = decrementDraftCard(draft, "trim");

  assert.equal(validation.valid, false);
  assert.deepEqual(draft, { slash: 20, trim: 11 });
  assert.deepEqual(reduced, { slash: 20, trim: 10 });
  assert.equal(validateDraftDeck(reduced).valid, true);
});

test("reset to Starter Deck removes invalid and unavailable entries", () => {
  const reset = resetToStarterDeck({ slash: 1, trim: 11, retired: 7 });

  assert.deepEqual(reset, { slash: 15, bolt: 5 });
  assert.equal(validateDraftDeck(reset).valid, true);
});
