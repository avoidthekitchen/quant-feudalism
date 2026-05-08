import assert from "node:assert/strict";
import test from "node:test";
import { createEnemySpawnPlan } from "./enemies.ts";

const spawnPoints = [
  { x: 540, y: 240 },
  { x: 710, y: 280 },
  { x: 940, y: 250 },
  { x: 1140, y: 450 },
  { x: 980, y: 660 },
  { x: 1340, y: 370 },
  { x: 1290, y: 900 },
  { x: 780, y: 920 },
];

test("Hopper replaces the newest deterministic Bug spawn slot from round 2 onward", () => {
  assert.deepEqual(
    createEnemySpawnPlan(spawnPoints, 0).map((enemy) => enemy.type),
    ["bug", "bug", "bug", "bug", "bug"],
  );

  const round2 = createEnemySpawnPlan(spawnPoints, 1);
  assert.deepEqual(
    round2.map((enemy) => enemy.type),
    ["bug", "bug", "bug", "bug", "bug", "hopper"],
  );
  assert.deepEqual(round2.at(-1), {
    id: 5,
    type: "hopper",
    x: 1340,
    y: 370,
    orbitSeed: 3,
  });

  assert.deepEqual(
    createEnemySpawnPlan(spawnPoints, 2).map((enemy) => enemy.type),
    ["bug", "bug", "bug", "bug", "bug", "bug", "hopper"],
  );
});
