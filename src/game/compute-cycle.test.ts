import assert from "node:assert/strict";
import test from "node:test";
import {
  PREPARING_WINDOW_MS,
  advanceComputeCycle,
  createStarterComputeCycle,
  endActiveWindow,
  playAttackCard,
  shouldEndActiveWindow,
  startActiveWindow,
} from "./compute-cycle.ts";

test("an arena deployment starts active with a shuffled starter deck drawn to the queue limit", () => {
  const cycle = startActiveWindow(createStarterComputeCycle(7), 96);

  const queuedCards = cycle.queues.melee.length + cycle.queues.ranged.length;
  const remainingCards = cycle.drawPile.length + cycle.discardPile.length + queuedCards;

  assert.equal(cycle.phase, "active");
  assert.equal(cycle.computeRefill, 96);
  assert.equal(queuedCards, 7);
  assert.equal(remainingCards, 20);
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

test("cycle end discards queued cards and preparing completion draws back to the queue limit", () => {
  const started = startActiveWindow(createStarterComputeCycle(3), 96);
  const played = playAttackCard(started, started.queues.melee.length > 0 ? "melee" : "ranged").state;
  const queuedBeforeEnd = played.queues.melee.length + played.queues.ranged.length;

  const preparing = endActiveWindow(played);

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
      computeCurrent: 18,
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
