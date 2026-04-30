import assert from "node:assert/strict";
import test from "node:test";
import { RunState } from "./state.ts";

function makeResumeSnapshot() {
  return {
    timelineTimeMs: 2_450,
    snapshot: {
      runState: {
        computeCurrent: 44,
        allotmentCurrent: 900,
        integrityCurrent: 76,
        kills: 2,
        extractionReady: true,
        notice: "Checkpoint restored.",
        arenaPrompt: "Resume fight.",
        computeRegenDelayRemainingMs: 300,
      },
      player: {
        position: { x: 120, y: 240 },
        velocity: { x: 8, y: -3 },
        dashDirection: { x: 1, y: 0 },
        facing: "e" as const,
        angle: 0.2,
        dashTimer: 0.1,
        dashInvulnerabilityTimer: 0.2,
        rangedMovementPauseTimer: 0,
        playerAttackTimer: 0,
        cooldowns: {
          dash: 120,
          melee: 30,
          ranged: 400,
        },
        cacheDiscountBlocked: {
          dash: false,
          melee: true,
          ranged: false,
        },
      },
      arenaCleared: false,
      projectiles: [],
      enemies: [],
    },
  };
}

test("buyQuantumTuner spends compute credits and clamps current compute", () => {
  const state = new RunState();
  state.quantumTuners = 0;
  state.allotmentCurrent = 520;
  state.computeCurrent = 460;

  const purchased = state.buyQuantumTuner();

  assert.equal(purchased, true);
  assert.equal(state.quantumTuners, 1);
  assert.equal(state.allotmentCurrent, 270);
  assert.equal(state.computeCurrent, 270);
});

test("buyQuantumTuner fails when the rack is already full", () => {
  const state = new RunState();
  state.quantumTuners = state.quantumTunerCap;
  state.allotmentCurrent = 900;

  const purchased = state.buyQuantumTuner();

  assert.equal(purchased, false);
  assert.equal(state.quantumTuners, state.quantumTunerCap);
  assert.equal(state.allotmentCurrent, 900);
});

test("buyQuantumTuner fails when compute credits are below cost", () => {
  const state = new RunState();
  state.quantumTuners = 0;
  state.allotmentCurrent = state.quantumTunerCost - 1;

  const purchased = state.buyQuantumTuner();

  assert.equal(purchased, false);
  assert.equal(state.quantumTuners, 0);
  assert.equal(state.allotmentCurrent, state.quantumTunerCost - 1);
});

test("banked tuner charges persist through arena entry and exit", () => {
  const state = new RunState();
  state.quantumTuners = 0;
  state.allotmentCurrent = 1000;

  assert.equal(state.buyQuantumTuner(), true);
  assert.equal(state.buyQuantumTuner(), true);

  state.beginArena();
  state.finishArena("retreated", "Returned alive.");

  assert.equal(state.quantumTuners, 2);
});

test("player starts with one quantum tuner charge", () => {
  const state = new RunState();

  assert.equal(state.quantumTuners, 1);
});

test("arena snapshots preserve and restore regen delay timing", () => {
  const source = new RunState();
  source.beginArena();
  assert.equal(source.spend(24), true);
  source.regenerate(300);

  const snapshot = source.createArenaSnapshot();
  assert.equal(snapshot.computeRegenDelayRemainingMs, 420);

  const restored = new RunState();
  restored.beginArena();
  restored.restoreArenaSnapshot(snapshot);

  const beforeRegen = restored.computeCurrent;
  restored.regenerate(419);
  assert.equal(restored.computeCurrent, beforeRegen);

  restored.regenerate(1);
  assert.equal(restored.computeCurrent, beforeRegen);

  restored.regenerate(100);
  assert.ok(restored.computeCurrent > beforeRegen);
});

test("startNewRun resets progression to the base procurement loadout", () => {
  const state = new RunState();
  state.beginArena();
  state.registerKill();
  state.finishArena("cleared", "Round one.");
  assert.equal(state.upgradeComputeRateLimit(), true);
  assert.equal(state.consumeQuantumTuner(), true);
  state.endRun("manual");

  state.startNewRun();

  assert.equal(state.runActive, true);
  assert.equal(state.sceneMode, "shop");
  assert.equal(state.roundsFinished, 0);
  assert.equal(state.getCurrentRunKills(), 0);
  assert.equal(state.integrityCurrent, state.integrityMax);
  assert.equal(state.allotmentCurrent, state.startingAllotment);
  assert.equal(state.credits, state.startingCredits);
  assert.equal(state.computeRateLimitUpgrades, 0);
  assert.equal(state.quantumTuners, state.startingQuantumTuners);
  assert.equal(state.runHistory.length, 1);
});

test("multiple arena deployments accumulate run rounds and kills", () => {
  const state = new RunState();

  state.beginArena();
  state.registerKill();
  state.registerKill();
  state.finishArena("cleared", "Cleared.");

  state.beginArena();
  state.registerKill();
  state.finishArena("retreated", "Retreated.");

  assert.equal(state.roundsFinished, 1);
  assert.equal(state.getCurrentRunKills(), 3);
  assert.equal(state.report.kills, 1);
  assert.equal(state.sceneMode, "shop");
});

test("manual end records a summary without adding extra rewards", () => {
  const state = new RunState();
  state.credits = 140;
  state.roundsFinished = 3;
  state.runKills = 11;
  state.quantumTunersUsedThisRun = 2;
  state.computeRateLimitUpgradesThisRun = 1;

  const summary = state.endRun("manual");

  assert.equal(summary?.roundsFinished, 3);
  assert.equal(summary?.kills, 11);
  assert.equal(summary?.quantumTunersUsed, 2);
  assert.equal(summary?.computeRateLimitUpgradesGained, 1);
  assert.equal(state.credits, 140);
  assert.equal(state.runActive, false);
  assert.equal(state.runHistory.length, 1);
});

test("bankruptcy only ends a run when integrity is gone and repair is unaffordable", () => {
  const safeState = new RunState();
  safeState.integrityCurrent = 0;
  safeState.allotmentCurrent = safeState.healCost;

  assert.equal(safeState.maybeEndRunForBankruptcy(), null);
  assert.equal(safeState.runActive, true);

  const bankruptState = new RunState();
  bankruptState.integrityCurrent = 0;
  bankruptState.allotmentCurrent = bankruptState.healCost - 1;

  const summary = bankruptState.maybeEndRunForBankruptcy();

  assert.equal(summary?.endReason, "bankrupt");
  assert.equal(bankruptState.runActive, false);
});

test("quantum tuner usage and upgrades are captured in the ended run summary", () => {
  const state = new RunState();
  state.credits = 500;
  state.allotmentCurrent = 1000;

  assert.equal(state.upgradeComputeRateLimit(), true);
  assert.equal(state.consumeQuantumTuner(), true);

  const summary = state.endRun("manual");

  assert.equal(summary?.quantumTunersUsed, 1);
  assert.equal(summary?.computeRateLimitUpgradesGained, 1);
});

test("scoreboard ranking sorts by rounds then kills then recency and includes the active run", () => {
  const state = new RunState();

  state.roundsFinished = 2;
  state.runKills = 4;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 6;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 8;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 8;

  const leaderboard = state.getTopRuns(3);

  assert.deepEqual(
    leaderboard.map((entry) => ({
      runId: entry.runId,
      active: entry.active,
      roundsFinished: entry.roundsFinished,
      kills: entry.kills,
    })),
    [
      { runId: 4, active: true, roundsFinished: 4, kills: 8 },
      { runId: 3, active: false, roundsFinished: 4, kills: 8 },
      { runId: 2, active: false, roundsFinished: 4, kills: 6 },
    ],
  );
});

test("scoreboard uses lower total arena time as a tie breaker", () => {
  const state = new RunState();

  state.roundsFinished = 4;
  state.runKills = 8;
  state.totalArenaTimeMs = 18_000;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 8;
  state.totalArenaTimeMs = 12_000;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 8;
  state.totalArenaTimeMs = 15_000;

  const leaderboard = state.getTopRuns(3);

  assert.deepEqual(
    leaderboard.map((entry) => ({
      runId: entry.runId,
      active: entry.active,
      totalArenaTimeMs: entry.totalArenaTimeMs,
    })),
    [
      { runId: 2, active: false, totalArenaTimeMs: 12_000 },
      { runId: 3, active: true, totalArenaTimeMs: 15_000 },
      { runId: 1, active: false, totalArenaTimeMs: 18_000 },
    ],
  );
});

test("active run always appears in leaderboard even when outscored by archived runs", () => {
  const state = new RunState();

  state.roundsFinished = 5;
  state.runKills = 20;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 4;
  state.runKills = 12;
  state.endRun("manual");

  state.startNewRun();
  state.roundsFinished = 3;
  state.runKills = 6;

  const leaderboard = state.getTopRuns(2);

  assert.equal(leaderboard.length, 2);
  assert.equal(leaderboard[0].runId, 1);
  assert.equal(leaderboard[0].active, false);
  assert.equal(leaderboard[0].roundsFinished, 5);
  assert.equal(leaderboard[1].runId, 3);
  assert.equal(leaderboard[1].active, true);
  assert.equal(leaderboard[1].roundsFinished, 3);
});

test("serialize and hydrate round-trip shop state and run history", () => {
  const source = new RunState();
  source.roundsFinished = 3;
  source.runKills = 12;
  source.quantumTunersUsedThisRun = 1;
  source.endRun("manual");
  source.startNewRun();
  source.credits = 220;
  source.allotmentCurrent = 2048;
  source.integrityCurrent = 63;

  const restored = new RunState();
  restored.hydrate(source.serialize());

  assert.deepEqual(restored.serialize(), source.serialize());
});

test("hydrate returns interrupted arena saves to shop with resource losses preserved", () => {
  const source = new RunState();
  source.roundsFinished = 3;
  source.runKills = 11;
  source.beginArena();
  source.restoreArenaSnapshot(makeResumeSnapshot().snapshot.runState);
  source.setExtractionReady(true);
  source.saveArenaResume(makeResumeSnapshot());

  const restored = new RunState();
  restored.hydrate(source.serialize());

  assert.equal(restored.sceneMode, "shop");
  assert.equal(restored.getCurrentRunKills(), 11);
  assert.equal(restored.roundsFinished, 3);
  assert.equal(restored.allotmentCurrent, 900);
  assert.equal(restored.integrityCurrent, 76);
  assert.equal(restored.kills, 0);
  assert.equal(restored.extractionReady, false);
  assert.equal(restored.getSavedArenaResume(), null);
  assert.match(restored.notice, /interrupted during deployment/i);
});

test("hydrate ignores saved arena resume data instead of resuming mid-arena", () => {
  const source = new RunState();
  source.beginArena();
  source.saveArenaResume(makeResumeSnapshot());
  const legacyState = {
    ...source.serialize(),
    savedArenaResume: {
      ...makeResumeSnapshot(),
      snapshot: {
        ...makeResumeSnapshot().snapshot,
        runState: {
          ...makeResumeSnapshot().snapshot.runState,
        },
      },
    },
  } as ReturnType<RunState["serialize"]> & { extractionReady?: boolean };
  delete legacyState.extractionReady;
  delete (legacyState.savedArenaResume!.snapshot.runState as { extractionReady?: boolean }).extractionReady;

  const restored = new RunState();
  restored.hydrate(legacyState);

  assert.equal(restored.sceneMode, "shop");
  assert.equal(restored.extractionReady, false);
  assert.equal(restored.getSavedArenaResume(), null);
  assert.match(restored.notice, /interrupted during deployment/i);
});

test("hydrate ignores malformed arena checkpoint data and returns to shop", () => {
  const source = new RunState();
  source.beginArena();
  source.roundsFinished = 2;
  source.runKills = 9;
  source.saveArenaResume(makeResumeSnapshot());
  const corruptedState = {
    ...source.serialize(),
    savedArenaResume: {
      timelineTimeMs: 10,
      snapshot: {
        ...makeResumeSnapshot().snapshot,
        player: {
          ...makeResumeSnapshot().snapshot.player,
          position: { x: Number.NaN, y: 200 },
        },
      },
    },
  } as ReturnType<RunState["serialize"]> & {
    savedArenaResume: unknown;
  };

  const restored = new RunState();
  restored.hydrate(corruptedState);

  assert.equal(restored.sceneMode, "shop");
  assert.equal(restored.roundsFinished, 2);
  assert.equal(restored.getCurrentRunKills(), 9);
  assert.equal(restored.getSavedArenaResume(), null);
  assert.match(restored.notice, /interrupted during deployment/i);
});

test("hydrate falls back to a fresh run for missing or outdated persisted data", () => {
  const missing = new RunState();
  missing.credits = 0;
  missing.hydrate(undefined);
  assert.equal(missing.runId, 1);
  assert.equal(missing.runActive, true);
  assert.equal(missing.credits, missing.startingCredits);

  const outdated = new RunState();
  outdated.credits = 0;
  outdated.hydrate({ version: 0 });
  assert.equal(outdated.runId, 1);
  assert.equal(outdated.runActive, true);
  assert.equal(outdated.credits, outdated.startingCredits);
});
