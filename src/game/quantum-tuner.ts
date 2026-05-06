export const QUANTUM_TUNER_HISTORY_WINDOW_MS = 15_000;
export const QUANTUM_TUNER_REWIND_MS = 5_000;
export const QUANTUM_TUNER_SNAPSHOT_INTERVAL_MS = 50;

export type SnapshotVector = {
  x: number;
  y: number;
};

export type SnapshotCooldowns = {
  dash: number;
  melee: number;
  ranged: number;
};

export type SnapshotCacheFlags = {
  dash: boolean;
  melee: boolean;
  ranged: boolean;
};

export interface ArenaRunStateSnapshotRecord {
  computeCurrent: number;
  allotmentCurrent: number;
  integrityCurrent: number;
  kills: number;
  extractionReady?: boolean;
  notice: string;
  arenaPrompt: string;
  computeRegenDelayRemainingMs: number;
}

export interface PlayerArenaSnapshot {
  position: SnapshotVector;
  velocity: SnapshotVector;
  dashDirection: SnapshotVector;
  facing: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
  angle: number;
  dashTimer: number;
  dashInvulnerabilityTimer: number;
  rangedMovementPauseTimer: number;
  playerAttackTimer: number;
  cooldowns: SnapshotCooldowns;
  cacheDiscountBlocked: SnapshotCacheFlags;
}

export interface EnemyArenaSnapshot {
  id: number;
  alive: boolean;
  hp: number;
  position: SnapshotVector;
  velocity: SnapshotVector;
  lungeDirection: SnapshotVector;
  touchCooldown: number;
  attackTimer: number;
  stunTimer: number;
  lungeCooldown: number;
  lungeWindupTimer: number;
  lungeTimer: number;
  orbitSeed: number;
}

export interface ProjectileArenaSnapshot {
  position: SnapshotVector;
  velocity: SnapshotVector;
  ttl: number;
  rotation: number;
}

export interface ArenaSnapshot {
  runState: ArenaRunStateSnapshotRecord;
  computeCycle: ComputeCycleState;
  player: PlayerArenaSnapshot;
  arenaCleared: boolean;
  projectiles: ProjectileArenaSnapshot[];
  enemies: EnemyArenaSnapshot[];
}

export interface TimedArenaSnapshot {
  timelineTimeMs: number;
  snapshot: ArenaSnapshot;
}

export type CollapseFailureReason = "no-charge" | "insufficient-history";

export interface CollapseAvailability {
  allowed: boolean;
  reason?: CollapseFailureReason;
  target?: TimedArenaSnapshot;
}

export function extractHistoryRange(
  history: TimedArenaSnapshot[],
  startTimeMs: number,
  endTimeMs: number,
): TimedArenaSnapshot[] {
  return history
    .filter(
      (entry) =>
        entry.timelineTimeMs >= startTimeMs &&
        entry.timelineTimeMs <= endTimeMs,
    )
    .map((entry) => ({
      timelineTimeMs: entry.timelineTimeMs,
      snapshot: cloneSnapshot(entry.snapshot),
    }));
}

export function recordArenaSnapshot(
  history: TimedArenaSnapshot[],
  snapshot: ArenaSnapshot,
  timelineTimeMs: number,
  maxHistoryMs = QUANTUM_TUNER_HISTORY_WINDOW_MS,
): TimedArenaSnapshot[] {
  const minTime = timelineTimeMs - maxHistoryMs;
  const preserved = history.filter((entry) => entry.timelineTimeMs >= minTime);
  const nextEntry = {
    timelineTimeMs,
    snapshot: cloneSnapshot(snapshot),
  };

  if (preserved.length > 0 && preserved[preserved.length - 1].timelineTimeMs === timelineTimeMs) {
    preserved[preserved.length - 1] = nextEntry;
    return preserved;
  }

  return [...preserved, nextEntry];
}

export function selectCollapseTarget(
  history: TimedArenaSnapshot[],
  timelineTimeMs: number,
  rewindMs = QUANTUM_TUNER_REWIND_MS,
): TimedArenaSnapshot | null {
  const targetTime = timelineTimeMs - rewindMs;
  if (targetTime < 0) {
    return null;
  }

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const entry = history[index];
    if (entry.timelineTimeMs <= targetTime) {
      return {
        timelineTimeMs: entry.timelineTimeMs,
        snapshot: cloneSnapshot(entry.snapshot),
      };
    }
  }

  return null;
}

export function getCollapseAvailability(
  history: TimedArenaSnapshot[],
  timelineTimeMs: number,
  charges: number,
  rewindMs = QUANTUM_TUNER_REWIND_MS,
): CollapseAvailability {
  if (charges <= 0) {
    return {
      allowed: false,
      reason: "no-charge",
    };
  }

  const target = selectCollapseTarget(history, timelineTimeMs, rewindMs);
  if (!target) {
    return {
      allowed: false,
      reason: "insufficient-history",
    };
  }

  return {
    allowed: true,
    target,
  };
}

export function prepareCollapsedHistory(
  history: TimedArenaSnapshot[],
  target: TimedArenaSnapshot,
): TimedArenaSnapshot[] {
  return extractHistoryRange(history, Number.NEGATIVE_INFINITY, target.timelineTimeMs);
}

function cloneSnapshot<T>(value: T): T {
  return structuredClone(value);
}
import type { ComputeCycleState } from "./compute-cycle";
