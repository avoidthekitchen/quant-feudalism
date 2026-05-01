import assert from "node:assert/strict";
import test from "node:test";
import { buildAnimationSpec, validateAnimationSpec } from "./animation-spec.ts";

test("animation specs include every actor/action/direction combination", () => {
  const specs = [...buildAnimationSpec("player"), ...buildAnimationSpec("drone")];
  const validation = validateAnimationSpec(specs);
  assert.equal(validation.ok, true);
  assert.deepEqual(validation.missing, []);
});

test("directional fallback mapping is deterministic for mirrored west facings", () => {
  const specs = buildAnimationSpec("player");
  const west = specs.find((spec) => spec.action === "idle" && spec.direction === "w");
  const northwest = specs.find((spec) => spec.action === "idle" && spec.direction === "nw");
  const southwest = specs.find((spec) => spec.action === "idle" && spec.direction === "sw");
  const east = specs.find((spec) => spec.action === "idle" && spec.direction === "e");

  assert.equal(west?.fallbackDirection, "e");
  assert.equal(northwest?.fallbackDirection, "ne");
  assert.equal(southwest?.fallbackDirection, "se");
  assert.equal(east?.fallbackDirection, undefined);
});

test("attack specs expose a hit frame index for timing hooks", () => {
  const specs = buildAnimationSpec("drone");
  const attackSpecs = specs.filter((spec) => spec.action === "attack");
  assert.equal(attackSpecs.length > 0, true);
  assert.equal(attackSpecs.every((spec) => spec.hitFrameIndex === 1), true);
});
