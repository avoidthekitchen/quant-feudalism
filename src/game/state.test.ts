import assert from "node:assert/strict";
import test from "node:test";
import { createStarterDeck } from "./deck.ts";
import { getScaledShopBundleCost } from "./constants.ts";
import { createStarterComputeCycle, startActiveWindow } from "./compute-cycle.ts";
import { RunState } from "./state.ts";

function makeResumeSnapshot(
  computeCycle = startActiveWindow(createStarterComputeCycle(11), 96),
) {
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
      },
      computeCycle,
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

test("refundAllotment restores only compute credits", () => {
  const state = new RunState();
  state.beginArena();
  assert.equal(state.spend(40), true);

  const computeBeforeRefund = state.computeCurrent;
  const refunded = state.refundAllotment(18);

  assert.equal(refunded, 18);
  assert.equal(state.computeCurrent, computeBeforeRefund);
  assert.equal(state.allotmentCurrent, state.startingAllotment - 22);
});

test("refundAllotment clamps to max compute credits without restoring rate limit", () => {
  const state = new RunState();
  state.beginArena();
  state.allotmentCurrent = state.allotmentMax - 5;
  state.computeCurrent = 12;

  const refunded = state.refundAllotment(18);

  assert.equal(refunded, 5);
  assert.equal(state.allotmentCurrent, state.allotmentMax);
  assert.equal(state.computeCurrent, 12);
});

test("spend refuses unaffordable card costs without creating compute debt", () => {
  const state = new RunState();
  state.computeCurrent = 17;
  state.allotmentCurrent = 100;

  assert.equal(state.canUseAbility(18), false);
  assert.equal(state.spend(18), false);
  assert.equal(state.computeCurrent, 17);
  assert.equal(state.allotmentCurrent, 100);

  state.computeCurrent = 18;
  state.allotmentCurrent = 17;

  assert.equal(state.canUseAbility(18), false);
  assert.equal(state.spend(18), false);
  assert.equal(state.computeCurrent, 18);
  assert.equal(state.allotmentCurrent, 17);

  state.allotmentCurrent = 18;

  assert.equal(state.spend(18), true);
  assert.equal(state.computeCurrent, 0);
  assert.equal(state.allotmentCurrent, 0);
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

test("Draft Deck edits persist through serialization", () => {
  const source = new RunState();
  assert.equal(source.incrementDraftCard("bolt", 3), true);
  assert.equal(source.decrementDraftCard("slash", 5), true);

  const restored = new RunState();
  restored.hydrate(source.serialize());

  assert.deepEqual(restored.getDraftDeck(), { slash: 10, bolt: 8 });
});

test("invalid Draft Decks block arena deployment with the deck validation message", () => {
  const state = new RunState();
  assert.equal(state.decrementDraftCard("slash", 1), true);

  const deployed = state.beginArena();

  assert.equal(deployed, false);
  assert.equal(state.sceneMode, "shop");
  assert.equal(state.tryGetDeployableDeck(), null);
  assert.equal(state.getDraftDeckValidation().message, "Add 1 more card to reach the 20-card minimum.");
  assert.equal(state.notice, "Add 1 more card to reach the 20-card minimum.");
});

test("resetting a new run restores the Starter Deck", () => {
  const state = new RunState();
  state.incrementDraftCard("bolt", 10);
  state.endRun("manual");

  state.startNewRun();

  assert.deepEqual(state.getDraftDeck(), createStarterDeck());
});

test("Draft Deck reset confirmation is only needed when edits would be lost", () => {
  const state = new RunState();

  assert.equal(state.hasDraftDeckEdits(), false);

  state.incrementDraftCard("trim", 1);
  assert.equal(state.hasDraftDeckEdits(), true);

  state.resetDraftDeckToStarter();
  assert.equal(state.hasDraftDeckEdits(), false);
});

test("player starts with one quantum tuner charge", () => {
  const state = new RunState();

  assert.equal(state.quantumTuners, 1);
});

test("shop Compute Credit bundle costs compound by seven and a half percent after cleared rounds", () => {
  assert.equal(getScaledShopBundleCost(60, 0), 60);
  assert.equal(getScaledShopBundleCost(60, 1), 65);
  assert.equal(getScaledShopBundleCost(60, 2), 70);
  assert.equal(getScaledShopBundleCost(60, 10), 124);
});

test("buyAllotment charges the round-scaled bundle cost", () => {
  const state = new RunState();
  state.roundsFinished = 3;
  state.credits = 75;
  state.allotmentCurrent = 1000;

  assert.equal(state.buyAllotment(360, 60), true);
  assert.equal(state.credits, 0);
  assert.equal(state.allotmentCurrent, 1360);
});

test("empty rate limit does not throttle movement or vision while compute credits remain funded", () => {
  const state = new RunState();
  state.computeCurrent = 0;
  state.allotmentCurrent = state.startingAllotment;

  assert.equal(state.getMovementMultiplier(), 1);
  assert.equal(state.getVisionBlurStrength(), 0);
  assert.equal(state.getThrottleLabel(), "Nominal");
});

test("exhausted compute credits slow movement and impair vision", () => {
  const state = new RunState();
  state.computeCurrent = state.computeMax;
  state.allotmentCurrent = 0;

  assert.ok(state.getMovementMultiplier() < 1);
  assert.ok(state.getVisionBlurStrength() > 0);
  assert.equal(state.getThrottleLabel(), "Seized");
});

test("startNewRun resets progression to the base procurement loadout", () => {
  const state = new RunState();
  state.beginArena();
  state.registerKill();
  state.finishArena("cleared", "Round one.");
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
  assert.equal(state.quantumTuners, state.startingQuantumTuners);
  assert.equal(state.runHistory.length, 1);
});

test("new runs start with the tighter compute credit allotment", () => {
  const state = new RunState();

  assert.equal(state.startingAllotment, 1360);
  assert.equal(state.allotmentCurrent, 1360);
});

test("new runs start with the reduced bug bounty credit buffer", () => {
  const state = new RunState();

  assert.equal(state.startingCredits, 30);
  assert.equal(state.credits, 30);
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

test("cleared arena notes mention Compute Credit price increases", () => {
  const state = new RunState();

  state.beginArena();
  state.finishArena("cleared", "Cleared.");

  assert.match(state.notice, /Compute Credit refill prices increased by 7.5%/);
});

test("manual end records a summary without adding extra rewards", () => {
  const state = new RunState();
  state.credits = 140;
  state.roundsFinished = 3;
  state.runKills = 11;
  state.quantumTunersUsedThisRun = 2;

  const summary = state.endRun("manual");

  assert.equal(summary?.roundsFinished, 3);
  assert.equal(summary?.kills, 11);
  assert.equal(summary?.quantumTunersUsed, 2);
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

test("quantum tuner usage is captured in the ended run summary", () => {
  const state = new RunState();
  state.credits = 500;
  state.allotmentCurrent = 1000;

  assert.equal(state.consumeQuantumTuner(), true);

  const summary = state.endRun("manual");

  assert.equal(summary?.quantumTunersUsed, 1);
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

test("hydrate returns interrupted arena saves to the pre-arena shop state", () => {
  const source = new RunState();
  source.roundsFinished = 3;
  source.runKills = 11;
  const preArenaAllotment = source.allotmentCurrent;
  const preArenaIntegrity = source.integrityCurrent;
  source.beginArena();

  const restored = new RunState();
  restored.hydrate(source.serialize());

  assert.equal(restored.sceneMode, "shop");
  assert.equal(restored.getCurrentRunKills(), 11);
  assert.equal(restored.roundsFinished, 3);
  assert.equal(restored.allotmentCurrent, preArenaAllotment);
  assert.equal(restored.integrityCurrent, preArenaIntegrity);
  assert.equal(restored.kills, 0);
  assert.equal(restored.extractionReady, false);
  assert.match(restored.notice, /interrupted during deployment/i);
});

test("hydrate returns interrupted arena saves to shop while preserving an invalid Draft Deck", () => {
  const source = new RunState();
  source.beginArena();
  const persisted = {
    ...source.serialize(),
    draftDeck: { slash: 19, retired: 2, refund: 11 },
  };

  const restored = new RunState();
  restored.hydrate(persisted);

  assert.equal(restored.sceneMode, "shop");
  assert.deepEqual(restored.getDraftDeck(), { slash: 19, retired: 2, refund: 11 });
  assert.equal(
    restored.getDraftDeckValidation().message,
    "Deck contains unavailable cards. Remove them to deploy.",
  );
});

test("hydrate ignores legacy arena checkpoint data and returns to shop", () => {
  const source = new RunState();
  source.beginArena();
  source.roundsFinished = 2;
  source.runKills = 9;
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
