import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceStatementChain,
  INPUT_BUFFER_MS,
  shouldExpireInputBuffer,
  statementChainDamage,
  STATEMENT_CHAIN_WINDOW_MS,
} from "./combat-feel.ts";

test("Statement chain advances within the combo window and caps at the finisher", () => {
  assert.equal(advanceStatementChain(0, STATEMENT_CHAIN_WINDOW_MS), 1);
  assert.equal(advanceStatementChain(1, 120), 2);
  assert.equal(advanceStatementChain(2, 120), 2);
});

test("Statement chain resets after the combo window", () => {
  assert.equal(advanceStatementChain(2, STATEMENT_CHAIN_WINDOW_MS + 1), 0);
});

test("Statement chain damage applies the configured multipliers", () => {
  assert.equal(statementChainDamage(23, 0), 23);
  assert.equal(statementChainDamage(23, 1), 25);
  assert.equal(statementChainDamage(23, 2), 29);
});

test("input buffers expire after the 150ms grace window", () => {
  assert.equal(shouldExpireInputBuffer(INPUT_BUFFER_MS), false);
  assert.equal(shouldExpireInputBuffer(INPUT_BUFFER_MS + 1), true);
});
