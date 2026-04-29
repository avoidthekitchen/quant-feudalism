import assert from "node:assert/strict";
import test from "node:test";
import { RunState } from "./state.ts";

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
