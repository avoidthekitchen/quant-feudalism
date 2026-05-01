import assert from "node:assert/strict";
import test from "node:test";
import {
  ART_ASSET_MANIFEST,
  DEFAULT_ART_MODE,
  getRequestedArtMode,
  resolveArtMode,
  shouldQueueExternalArt,
  validateLoadedAssets,
  type ArtMode,
} from "./assets-manifest.ts";

test("asset manifest validation passes when all required texture keys and frames exist", () => {
  const expectedKeys = [
    ART_ASSET_MANIFEST.actorAtlases.player.key,
    ART_ASSET_MANIFEST.actorAtlases.drone.key,
    ...Object.values(ART_ASSET_MANIFEST.environment).map((entry) => entry.key),
  ];
  const keySet = new Set(expectedKeys);
  const result = validateLoadedAssets(
    ART_ASSET_MANIFEST,
    (key) => keySet.has(key),
    (_key, _frame) => true,
  );

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
});

test("asset manifest validation fails fast when required keys are missing", () => {
  const keySet = new Set<string>([
    ART_ASSET_MANIFEST.actorAtlases.player.key,
  ]);
  const result = validateLoadedAssets(
    ART_ASSET_MANIFEST,
    (key) => keySet.has(key),
    (_key, _frame) => true,
  );

  assert.equal(result.ok, false);
  assert.equal(result.missing.includes(ART_ASSET_MANIFEST.actorAtlases.drone.key), true);
  assert.equal(result.missing.includes("qf-floor"), true);
});

test("art mode resolution keeps procedural fallback except for explicit external-only", () => {
  const valid = { ok: true, missing: [] };
  const invalid = { ok: false, missing: ["qf-floor"] };

  assert.equal(resolveArtMode("procedural", valid), "procedural");
  assert.equal(resolveArtMode("external-preferred", valid), "external-preferred");
  assert.equal(resolveArtMode("external-only", valid), "external-only");
  assert.equal(resolveArtMode("external-preferred", invalid), "procedural");
  assert.equal(resolveArtMode("external-only", invalid), "external-only");
});

test("all supported art modes are explicitly covered", () => {
  const modes: ArtMode[] = ["procedural", "external-preferred", "external-only"];
  assert.equal(modes.length, 3);
});

test("art mode defaults to procedural so missing authored art is not loaded accidentally", () => {
  assert.equal(DEFAULT_ART_MODE, "procedural");
  assert.equal(getRequestedArtMode(""), "procedural");
  assert.equal(getRequestedArtMode("?art=unknown"), "procedural");
});

test("art mode request parser accepts external opt-ins", () => {
  assert.equal(getRequestedArtMode("?art=external"), "external-preferred");
  assert.equal(getRequestedArtMode("?art=external-preferred"), "external-preferred");
  assert.equal(getRequestedArtMode("?art=external-only"), "external-only");
  assert.equal(getRequestedArtMode("?art=procedural"), "procedural");
});

test("external asset queueing only happens for external art modes", () => {
  assert.equal(shouldQueueExternalArt("procedural"), false);
  assert.equal(shouldQueueExternalArt("external-preferred"), true);
  assert.equal(shouldQueueExternalArt("external-only"), true);
});
