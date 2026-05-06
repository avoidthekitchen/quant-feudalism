import assert from "node:assert/strict";
import test from "node:test";
import { ABILITY_COOLDOWNS_MS } from "./combat.ts";
import { createStarterComputeCycle, startActiveWindow } from "./compute-cycle.ts";
import {
  extractHistoryRange,
  getCollapseAvailability,
  prepareCollapsedHistory,
  QUANTUM_TUNER_HISTORY_WINDOW_MS,
  recordArenaSnapshot,
  selectCollapseTarget,
  type ArenaSnapshot,
  type TimedArenaSnapshot,
} from "./quantum-tuner.ts";

function createSnapshot(seed: number, overrides: Partial<ArenaSnapshot> = {}): ArenaSnapshot {
  return {
    runState: {
      computeCurrent: 90 - seed,
      allotmentCurrent: 1600 - seed * 10,
      integrityCurrent: 100 - seed,
      kills: seed,
      notice: `note-${seed}`,
      arenaPrompt: `prompt-${seed}`,
      computeRegenDelayRemainingMs: seed * 10,
    },
    computeCycle: startActiveWindow(createStarterComputeCycle(seed + 1), 96),
    player: {
      position: { x: 100 + seed, y: 200 + seed },
      velocity: { x: seed, y: seed * 2 },
      dashDirection: { x: 1, y: 0 },
      facing: "e",
      angle: seed,
      dashTimer: 0.16,
      dashInvulnerabilityTimer: 0.24,
      rangedMovementPauseTimer: 0,
      playerAttackTimer: 0,
      cooldowns: ABILITY_COOLDOWNS_MS,
      cacheDiscountBlocked: { dash: false, melee: false, ranged: false },
    },
    arenaCleared: false,
    projectiles: [
      {
        position: { x: 300 + seed, y: 400 + seed },
        velocity: { x: 40, y: -15 },
        ttl: 1.2,
        rotation: 0.5,
      },
    ],
    enemies: [
      {
        id: 0,
        alive: true,
        hp: 44,
        position: { x: 500 + seed, y: 600 + seed },
        velocity: { x: 5, y: 6 },
        lungeDirection: { x: 1, y: 0 },
        touchCooldown: 0.2,
        attackTimer: 0.1,
        stunTimer: 0,
        lungeCooldown: 0.7,
        lungeWindupTimer: 0,
        lungeTimer: 0,
        orbitSeed: 0,
      },
      {
        id: 1,
        alive: false,
        hp: 0,
        position: { x: 700 + seed, y: 800 + seed },
        velocity: { x: 0, y: 0 },
        lungeDirection: { x: 1, y: 0 },
        touchCooldown: 0,
        attackTimer: 0,
        stunTimer: 0,
        lungeCooldown: 0,
        lungeWindupTimer: 0,
        lungeTimer: 0,
        orbitSeed: 0.6,
      },
    ],
    ...overrides,
  };
}

function timestamps(history: TimedArenaSnapshot[]): number[] {
  return history.map((entry) => entry.timelineTimeMs);
}

test("recordArenaSnapshot prunes entries older than the 15 second history window", () => {
  let history: TimedArenaSnapshot[] = [];
  history = recordArenaSnapshot(history, createSnapshot(0), 0);
  history = recordArenaSnapshot(history, createSnapshot(1), 5_000);
  history = recordArenaSnapshot(history, createSnapshot(2), QUANTUM_TUNER_HISTORY_WINDOW_MS + 1_000);

  assert.deepEqual(timestamps(history), [5_000, 16_000]);
});

test("selectCollapseTarget returns the newest snapshot at or before five seconds ago", () => {
  let history: TimedArenaSnapshot[] = [];
  history = recordArenaSnapshot(history, createSnapshot(1), 1_000);
  history = recordArenaSnapshot(history, createSnapshot(2), 6_200);
  history = recordArenaSnapshot(history, createSnapshot(3), 7_000);
  history = recordArenaSnapshot(history, createSnapshot(4), 8_000);

  assert.equal(selectCollapseTarget(history, 12_000)?.timelineTimeMs, 7_000);
  assert.equal(selectCollapseTarget(history, 11_950)?.timelineTimeMs, 6_200);
});

test("collapsed history preserves older snapshots for immediate chained rewinds", () => {
  let history: TimedArenaSnapshot[] = [];
  history = recordArenaSnapshot(history, createSnapshot(0), 0);
  history = recordArenaSnapshot(history, createSnapshot(1), 5_000);
  history = recordArenaSnapshot(history, createSnapshot(2), 10_000);

  const firstCollapse = getCollapseAvailability(history, 10_000, 2);
  assert.equal(firstCollapse.allowed, true);
  assert.equal(firstCollapse.target?.timelineTimeMs, 5_000);

  history = recordArenaSnapshot(
    prepareCollapsedHistory(history, firstCollapse.target!),
    firstCollapse.target!.snapshot,
    firstCollapse.target!.timelineTimeMs,
  );

  const secondCollapse = getCollapseAvailability(history, 5_000, 1);
  assert.equal(secondCollapse.allowed, true);
  assert.equal(secondCollapse.target?.timelineTimeMs, 0);
});

test("extractHistoryRange returns cloned snapshots within the requested window", () => {
  let history: TimedArenaSnapshot[] = [];
  history = recordArenaSnapshot(history, createSnapshot(0), 0);
  history = recordArenaSnapshot(history, createSnapshot(1), 5_000);
  history = recordArenaSnapshot(history, createSnapshot(2), 10_000);

  const extracted = extractHistoryRange(history, 2_500, 10_000);

  assert.deepEqual(timestamps(extracted), [5_000, 10_000]);
  extracted[0].snapshot.player.position.x = 999;
  assert.equal(history[1].snapshot.player.position.x, 101);
});

test("getCollapseAvailability reports insufficient history before five seconds exist", () => {
  const history = [recordArenaSnapshot([], createSnapshot(0), 4_000)][0];
  const availability = getCollapseAvailability(history, 4_000, 1);

  assert.equal(availability.allowed, false);
  assert.equal(availability.reason, "insufficient-history");
});

test("stored snapshots keep exact restore shape and do not leak newer timeline mutations", () => {
  let source = createSnapshot(5);
  let history: TimedArenaSnapshot[] = [];
  history = recordArenaSnapshot(history, source, 5_000);

  source = {
    ...source,
    arenaCleared: true,
    projectiles: [{ ...source.projectiles[0], ttl: 0 }],
    enemies: [
      { ...source.enemies[0], hp: 1 },
      { ...source.enemies[1], alive: true, hp: 44 },
    ],
  };

  const selected = selectCollapseTarget(history, 10_000);
  assert.ok(selected);
  assert.equal(selected.snapshot.arenaCleared, false);
  assert.equal(selected.snapshot.projectiles[0].ttl, 1.2);
  assert.equal(selected.snapshot.enemies[0].hp, 44);
  assert.equal(selected.snapshot.enemies[1].alive, false);
});

test("stored snapshots clone compute cycle deck state for collapse and resume", () => {
  const source = createSnapshot(2);
  source.computeCycle.discardPile.push(source.computeCycle.queues.melee[0]);
  const history = recordArenaSnapshot([], source, 3_000);

  source.computeCycle.phase = "preparing";
  source.computeCycle.queues.melee = [];
  source.computeCycle.discardPile = [];

  assert.equal(history[0].snapshot.computeCycle.phase, "active");
  assert.equal(history[0].snapshot.computeCycle.discardPile.length, 1);
  assert.equal(history[0].snapshot.computeCycle.queues.melee.length > 0, true);
});
