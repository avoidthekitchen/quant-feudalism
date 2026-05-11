import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateBugFlockVelocity,
  DEFAULT_BUG_FLOCK_CONFIG,
  type BugFlockAgent,
  type BugFlockVector,
} from "./bug-movement.ts";

const player = { x: 0, y: 0 };

function bug(overrides: Partial<BugFlockAgent>): BugFlockAgent {
  return {
    id: 0,
    type: "bug",
    x: -160,
    y: 0,
    velocity: { x: 0, y: 0 },
    orbitSeed: 0,
    ...overrides,
  };
}

test("nearby Bugs on the same approach line diverge around the player", () => {
  const left = bug({ id: 0, x: -160, orbitSeed: 0 });
  const right = bug({ id: 1, x: -168, orbitSeed: 0.6 });

  const leftVelocity = calculateBugFlockVelocity(left, [left, right], player);
  const rightVelocity = calculateBugFlockVelocity(right, [left, right], player);

  assert.ok(leftVelocity.y > 0);
  assert.ok(rightVelocity.y < 0);
});

test("Bug inside player personal space backs away", () => {
  const agent = bug({ x: 42, y: 0 });
  const velocity = calculateBugFlockVelocity(agent, [agent], player);

  assert.ok(velocity.x > 0);
});

test("far Bug advances toward the player", () => {
  const agent = bug({ x: -320, y: 12 });
  const velocity = calculateBugFlockVelocity(agent, [agent], player);

  assert.ok(velocity.x > 0);
  assert.equal(Math.round(magnitude(velocity)), DEFAULT_BUG_FLOCK_CONFIG.chaseSpeed);
});

test("symmetric pack stays deterministic and finite", () => {
  const agents = [
    bug({ id: 0, x: -120, y: 0, orbitSeed: 0 }),
    bug({ id: 1, x: 120, y: 0, orbitSeed: 0.6 }),
    bug({ id: 2, x: 0, y: -120, orbitSeed: 1.2 }),
    bug({ id: 3, x: 0, y: 120, orbitSeed: 1.8 }),
  ];

  const firstPass = agents.map((agent) => calculateBugFlockVelocity(agent, agents, player));
  const secondPass = agents.map((agent) => calculateBugFlockVelocity(agent, agents, player));

  assert.deepEqual(secondPass, firstPass);
  firstPass.forEach((velocity) => {
    assert.ok(Number.isFinite(velocity.x));
    assert.ok(Number.isFinite(velocity.y));
    assert.ok(magnitude(velocity) > 0);
  });
});

function magnitude(vector: BugFlockVector): number {
  return Math.hypot(vector.x, vector.y);
}
