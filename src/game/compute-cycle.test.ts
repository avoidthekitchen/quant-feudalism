import assert from "node:assert/strict";
import test from "node:test";
import {
  activateRefundDiscount,
  PREPARING_WINDOW_MS,
  advanceComputeCycle,
  createArenaComputeCycle,
  createComputeCycleFromDeck,
  createStarterComputeCycle,
  drawBonusAttackCard,
  endActiveWindow,
  getAttackCardDisplayName,
  getDiscountedAttackCost,
  playAttackCard,
  shouldEndActiveWindow,
  startActiveWindow,
} from "./compute-cycle.ts";
import { getAttackCardDefinition } from "./card-catalog.ts";

test("an arena deployment starts active with a shuffled starter deck drawn to the queue limit", () => {
  const cycle = startActiveWindow(createStarterComputeCycle(7), 96);

  const queuedCards = cycle.queues.melee.length + cycle.queues.ranged.length;
  const remainingCards = cycle.drawPile.length + cycle.discardPile.length + queuedCards;
  const allCards = [
    ...cycle.drawPile,
    ...cycle.discardPile,
    ...cycle.queues.melee,
    ...cycle.queues.ranged,
  ];

  assert.equal(cycle.phase, "active");
  assert.equal(cycle.computeRefill, 96);
  assert.equal(queuedCards, 7);
  assert.equal(remainingCards, 20);
  assert.equal(allCards.filter((card) => card.id === "slash" && card.name === "Slash").length, 15);
  assert.equal(allCards.filter((card) => card.id === "bolt" && card.name === "Bolt").length, 5);
  assert.equal(cycle.drawPile.length, 13);
  assert.equal(cycle.discardPile.length, 0);
  assert.equal(
    cycle.queues.melee.every((card) => card.type === "melee"),
    true,
  );
  assert.equal(
    cycle.queues.ranged.every((card) => card.type === "ranged"),
    true,
  );
});

test("an arena deployment can start from the current valid Draft Deck", () => {
  const cycle = startActiveWindow(createComputeCycleFromDeck({ slash: 12, bolt: 8 }, 11), 96);
  const allCards = [
    ...cycle.drawPile,
    ...cycle.discardPile,
    ...cycle.queues.melee,
    ...cycle.queues.ranged,
  ];

  assert.equal(allCards.length, 20);
  assert.equal(allCards.filter((card) => card.id === "slash").length, 12);
  assert.equal(allCards.filter((card) => card.id === "bolt").length, 8);
});

test("saved cycle restore uses authoritative cycle state without requiring the current Draft Deck", () => {
  const savedCycle = {
    ...startActiveWindow(createComputeCycleFromDeck({ slash: 18, trim: 1, refund: 1 }, 17), 96),
    discardPile: [
      { id: "refund", name: "Refund", type: "ranged" as const },
    ],
    queues: {
      melee: [
        { id: "trim", name: "Trim", type: "melee" as const },
      ],
      ranged: [
        { id: "bolt", name: "Bolt", type: "ranged" as const },
      ],
    },
  };

  const restored = createArenaComputeCycle({
    currentDraftDeck: { retired: 2 },
    resumeCycle: savedCycle,
    seed: 99,
    computeRefill: 72,
  });

  assert.deepEqual(restored.queues.melee.map((card) => card.id), ["trim"]);
  assert.deepEqual(restored.queues.ranged.map((card) => card.id), ["bolt"]);
  assert.deepEqual(restored.discardPile.map((card) => card.id), ["refund"]);
  assert.equal(restored.computeRefill, 72);

  restored.queues.melee[0].id = "slash";
  assert.equal(savedCycle.queues.melee[0].id, "trim");
});

test("Trim deploys into the Statement Attack Queue with its card identity", () => {
  const cycle = startActiveWindow(createComputeCycleFromDeck({ slash: 19, trim: 1 }, 1), 96);
  const allCards = [
    ...cycle.drawPile,
    ...cycle.discardPile,
    ...cycle.queues.melee,
    ...cycle.queues.ranged,
  ];
  const trim = allCards.find((card) => card.id === "trim");

  assert.equal(trim?.name, "Trim");
  assert.equal(trim?.type, "melee");
});

test("Trim bonus draw adds exactly one Attack Card even when queues are at the limit", () => {
  const started = startActiveWindow(createComputeCycleFromDeck({ slash: 19, trim: 1 }, 2), 96);
  const queued = {
    ...started,
    queueLimit: 2,
    drawPile: [
      { id: "bolt", name: "Bolt", type: "ranged" as const },
      { id: "slash", name: "Slash", type: "melee" as const },
    ],
    discardPile: [],
    queues: {
      melee: [
        { id: "trim", name: "Trim", type: "melee" as const },
        { id: "slash", name: "Slash", type: "melee" as const },
      ],
      ranged: [],
    },
  };

  const drawn = drawBonusAttackCard(queued);

  assert.equal(drawn.drew, true);
  assert.equal(drawn.shuffled, false);
  assert.equal(drawn.state.queues.melee.length + drawn.state.queues.ranged.length, 3);
  assert.deepEqual(
    drawn.state.queues.ranged.map((card) => card.id),
    ["bolt"],
  );
  assert.deepEqual(
    drawn.state.drawPile.map((card) => card.id),
    ["slash"],
  );
});

test("Trim bonus draw appends to the back of the matching queue without reordering lanes", () => {
  const queued = {
    ...startActiveWindow(createComputeCycleFromDeck({ slash: 20 }, 2), 96),
    drawPile: [
      { id: "slash", name: "Slash", type: "melee" as const },
    ],
    discardPile: [],
    queues: {
      melee: [
        { id: "trim", name: "Trim", type: "melee" as const },
        { id: "slash", name: "Slash", type: "melee" as const },
      ],
      ranged: [
        { id: "bolt", name: "Bolt", type: "ranged" as const },
        { id: "refund", name: "Refund", type: "ranged" as const },
      ],
    },
  };

  const drawn = drawBonusAttackCard(queued);

  assert.equal(drawn.drew, true);
  assert.deepEqual(
    drawn.state.queues.melee.map((card) => card.id),
    ["trim", "slash", "slash"],
  );
  assert.deepEqual(
    drawn.state.queues.ranged.map((card) => card.id),
    ["bolt", "refund"],
  );
});

test("Trim bonus draw shuffles discard when needed and draws nothing when both piles are empty", () => {
  const emptyDrawPile = {
    ...startActiveWindow(createComputeCycleFromDeck({ slash: 20 }, 3), 96),
    drawPile: [],
    discardPile: [
      { id: "bolt", name: "Bolt", type: "ranged" as const },
    ],
    queues: {
      melee: [
        { id: "trim", name: "Trim", type: "melee" as const },
      ],
      ranged: [],
    },
  };

  const shuffled = drawBonusAttackCard(emptyDrawPile);
  const empty = drawBonusAttackCard({
    ...emptyDrawPile,
    discardPile: [],
  });

  assert.equal(shuffled.drew, true);
  assert.equal(shuffled.shuffled, true);
  assert.deepEqual(
    shuffled.state.queues.ranged.map((card) => card.id),
    ["bolt"],
  );
  assert.equal(empty.drew, false);
  assert.equal(empty.shuffled, false);
  assert.deepEqual(empty.state.queues, emptyDrawPile.queues);
});

test("Trim-drawn cards are discarded if Cycle End follows its resolution", () => {
  const queued = {
    ...startActiveWindow(createComputeCycleFromDeck({ slash: 20 }, 5), 96),
    drawPile: [
      { id: "bolt", name: "Bolt", type: "ranged" as const },
    ],
    discardPile: [
      { id: "trim", name: "Trim", type: "melee" as const },
    ],
    queues: {
      melee: [],
      ranged: [],
    },
  };

  const drawn = drawBonusAttackCard(queued);
  const preparing = endActiveWindow(drawn.state);

  assert.deepEqual(
    preparing.discardPile.map((card) => card.id),
    ["trim", "bolt"],
  );
  assert.equal(preparing.queues.ranged.length, 0);
});

test("a committed attack plays one matching card into discard", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const type = started.queues.melee.length > 0 ? "melee" : "ranged";
  const beforeQueueCount = started.queues[type].length;

  const result = playAttackCard(started, type);

  assert.equal(result.played, true);
  assert.equal(result.state.queues[type].length, beforeQueueCount - 1);
  assert.equal(result.state.discardPile.length, 1);
  assert.equal(result.state.discardPile[0].type, type);
  assert.equal(started.queues[type].length, beforeQueueCount);
});

test("a committed attack plays the leftmost affordable card in its Attack Queue", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const queued = {
    ...started,
    queues: {
      melee: [],
      ranged: [
        { id: "bolt", name: "Bolt", type: "ranged" },
        { id: "refund", name: "Refund", type: "ranged" },
        { id: "bolt", name: "Bolt", type: "ranged" },
      ],
    },
  };

  const result = playAttackCard(queued, "ranged", {
    computeCurrent: 0,
    allotmentCurrent: 0,
  });

  assert.equal(result.played, true);
  assert.equal(result.card?.id, "refund");
  assert.deepEqual(
    result.state.queues.ranged.map((card) => card.id),
    ["bolt", "bolt"],
  );
  assert.deepEqual(
    result.state.discardPile.map((card) => card.id),
    ["refund"],
  );
});

test("rejected lane input consumes no card when no queued card is affordable", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const queued = {
    ...started,
    queues: {
      melee: [
        { id: "slash", name: "Slash", type: "melee" },
        { id: "trim", name: "Trim", type: "melee" },
      ],
      ranged: [],
    },
    discardPile: [],
  };

  const result = playAttackCard(queued, "melee", {
    computeCurrent: 17,
    allotmentCurrent: 100,
  });

  assert.equal(result.played, false);
  assert.equal(result.rejectionReason, "rate-limit");
  assert.deepEqual(
    result.state.queues.melee.map((card) => card.id),
    ["slash", "trim"],
  );
  assert.equal(result.state.discardPile.length, 0);
});

test("rejected lane input reports when both compute pools are short", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const queued = {
    ...started,
    queues: {
      melee: [
        { id: "slash", name: "Slash", type: "melee" },
      ],
      ranged: [],
    },
    discardPile: [],
  };

  const result = playAttackCard(queued, "melee", {
    computeCurrent: 17,
    allotmentCurrent: 17,
  });

  assert.equal(result.played, false);
  assert.equal(result.rejectionReason, "compute");
  assert.deepEqual(
    result.state.queues.melee.map((card) => card.id),
    ["slash"],
  );
  assert.equal(result.state.discardPile.length, 0);
});

test("queued starter cards expose names for the arena HUD", () => {
  const started = startActiveWindow(createStarterComputeCycle(9), 96);

  assert.equal(
    started.queues.melee.every((card) => getAttackCardDisplayName(card) === "Slash"),
    true,
  );
  assert.equal(
    started.queues.ranged.every((card) => getAttackCardDisplayName(card) === "Bolt"),
    true,
  );
});

test("cycle end discards queued cards and preparing completion draws back to the queue limit", () => {
  const started = startActiveWindow(createStarterComputeCycle(3), 96);
  const played = playAttackCard(started, started.queues.melee.length > 0 ? "melee" : "ranged").state;
  const queuedBeforeEnd = played.queues.melee.length + played.queues.ranged.length;

  const preparing = endActiveWindow(played);

  assert.equal(PREPARING_WINDOW_MS, 700);
  assert.equal(preparing.phase, "preparing");
  assert.equal(preparing.preparingRemainingMs, PREPARING_WINDOW_MS);
  assert.equal(preparing.queues.melee.length + preparing.queues.ranged.length, 0);
  assert.equal(preparing.discardPile.length, queuedBeforeEnd + 1);

  const active = advanceComputeCycle(preparing, PREPARING_WINDOW_MS, 96);

  assert.equal(active.phase, "active");
  assert.equal(active.queues.melee.length + active.queues.ranged.length, 7);
  assert.equal(active.drawPile.length + active.discardPile.length + active.queues.melee.length + active.queues.ranged.length, 20);
});

test("active window ends only when no queued card can be afforded after cooldowns clear", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const onlyMelee = {
    ...started,
    queues: {
      melee: started.queues.melee.slice(0, 1),
      ranged: [],
    },
  };
  const onlyRanged = {
    ...started,
    queues: {
      melee: [],
      ranged: started.queues.ranged.slice(0, 1),
    },
  };

  assert.equal(
    shouldEndActiveWindow(onlyMelee, {
      computeCurrent: 18,
      allotmentCurrent: 100,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 400, ranged: 0 },
      attackCommitted: false,
    }),
    false,
  );
  assert.equal(
    shouldEndActiveWindow(onlyRanged, {
      computeCurrent: 39,
      allotmentCurrent: 100,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 400 },
      attackCommitted: false,
    }),
    true,
  );
  assert.equal(
    shouldEndActiveWindow(onlyMelee, {
      computeCurrent: 18,
      allotmentCurrent: 100,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 0 },
      attackCommitted: true,
    }),
    false,
  );
});

test("active window ends when queued cards cannot be afforded", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const onlyMelee = {
    ...started,
    queues: {
      melee: started.queues.melee.slice(0, 1),
      ranged: [],
    },
  };

  assert.equal(
    shouldEndActiveWindow(onlyMelee, {
      computeCurrent: 17,
      allotmentCurrent: 100,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 0 },
      attackCommitted: false,
    }),
    true,
  );
  assert.equal(
    shouldEndActiveWindow(onlyMelee, {
      computeCurrent: 18,
      allotmentCurrent: 17,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 0 },
      attackCommitted: false,
    }),
    true,
  );
});

test("automatic Cycle End scans past unaffordable front cards and waits for lane cooldown", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const queued = {
    ...started,
    queues: {
      melee: [],
      ranged: [
        { id: "bolt", name: "Bolt", type: "ranged" },
        { id: "refund", name: "Refund", type: "ranged" },
      ],
    },
  };

  assert.equal(
    shouldEndActiveWindow(queued, {
      computeCurrent: 0,
      allotmentCurrent: 0,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 400 },
      attackCommitted: false,
    }),
    false,
  );
});

test("Refund can play from full compute pools, discard, and keep the Active Window alive during Function cooldown", () => {
  const started = startActiveWindow(createStarterComputeCycle(7), 96);
  const queued = {
    ...started,
    discardPile: [],
    queues: {
      melee: [],
      ranged: [
        { id: "refund", name: "Refund", type: "ranged" as const },
      ],
    },
  };

  const played = playAttackCard(queued, "ranged", {
    computeCurrent: 96,
    allotmentCurrent: 2_800,
  });

  assert.equal(played.played, true);
  assert.equal(played.card?.id, "refund");
  assert.deepEqual(
    played.state.discardPile.map((card) => card.id),
    ["refund"],
  );
  assert.equal(played.state.queues.ranged.length, 0);
  assert.equal(getAttackCardDefinition("refund")?.cooldownMs, 1_000);
  assert.equal(
    shouldEndActiveWindow({
      ...started,
      queues: {
        melee: [],
        ranged: [
          { id: "refund", name: "Refund", type: "ranged" as const },
        ],
      },
    }, {
      computeCurrent: 96,
      allotmentCurrent: 2_800,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 1_000 },
      attackCommitted: false,
    }),
    false,
  );
});

test("Refund arms a three-attack flat discount that favors cheap attacks", () => {
  const started = activateRefundDiscount({
    ...startActiveWindow(createStarterComputeCycle(7), 96),
    queues: {
      melee: [
        { id: "slash", name: "Slash", type: "melee" as const },
        { id: "trim", name: "Trim", type: "melee" as const },
      ],
      ranged: [
        { id: "bolt", name: "Bolt", type: "ranged" as const },
      ],
    },
  });

  assert.equal(started.refundDiscountAttacksRemaining, 3);
  assert.equal(getDiscountedAttackCost(started.queues.melee[0], started.refundDiscountAttacksRemaining), 1);
  assert.equal(getDiscountedAttackCost(started.queues.ranged[0], started.refundDiscountAttacksRemaining), 20);

  const played = playAttackCard(started, "melee", {
    computeCurrent: 1,
    allotmentCurrent: 1,
    refundDiscountAttacksRemaining: started.refundDiscountAttacksRemaining,
  });

  assert.equal(played.played, true);
  assert.equal(played.card?.id, "slash");
  assert.equal(played.state.refundDiscountAttacksRemaining, 2);
});

test("Refund discount keeps an otherwise unaffordable attack available until Cycle End", () => {
  const discounted = activateRefundDiscount({
    ...startActiveWindow(createStarterComputeCycle(7), 96),
    queues: {
      melee: [
        { id: "slash", name: "Slash", type: "melee" as const },
      ],
      ranged: [],
    },
  });

  assert.equal(
    shouldEndActiveWindow(discounted, {
      computeCurrent: 1,
      allotmentCurrent: 1,
      meleeCost: 18,
      rangedCost: 40,
      cooldowns: { melee: 0, ranged: 0 },
      attackCommitted: false,
      refundDiscountAttacksRemaining: discounted.refundDiscountAttacksRemaining,
    }),
    false,
  );

  assert.equal(endActiveWindow(discounted).refundDiscountAttacksRemaining, 0);
});
