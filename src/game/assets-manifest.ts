import {
  SPRITE_ACTIONS,
  SPRITE_DIRECTIONS,
  type SpriteAction,
  type SpriteDirection,
} from "./sprite-schema.ts";

const PLAYER_SHEET_KEY = "qf-player-sheet";
const DRONE_SHEET_KEY = "qf-drone-sheet";

export type ArtMode = "procedural" | "external-preferred" | "external-only";

export type AssetManifestEntry = {
  key: string;
  textureURL: string;
  atlasURL?: string;
  normalMapURL?: string;
  required: boolean;
};

export type AssetManifest = {
  actorAtlases: {
    player: AssetManifestEntry;
    drone: AssetManifestEntry;
  };
  environment: {
    floor: AssetManifestEntry;
    shadow: AssetManifestEntry;
    pillar: AssetManifestEntry;
    gate: AssetManifestEntry;
    terminal: AssetManifestEntry;
    bolt: AssetManifestEntry;
    slash: AssetManifestEntry;
    haze: AssetManifestEntry;
  };
};

export const DEFAULT_ART_MODE: ArtMode = "procedural";

export const ART_ASSET_MANIFEST: AssetManifest = {
  actorAtlases: {
    player: {
      key: PLAYER_SHEET_KEY,
      textureURL: "assets/art/actors/player.png",
      atlasURL: "assets/art/actors/player.json",
      normalMapURL: "assets/art/actors/player_n.png",
      required: true,
    },
    drone: {
      key: DRONE_SHEET_KEY,
      textureURL: "assets/art/actors/drone.png",
      atlasURL: "assets/art/actors/drone.json",
      normalMapURL: "assets/art/actors/drone_n.png",
      required: true,
    },
  },
  environment: {
    floor: { key: "qf-floor", textureURL: "assets/art/environment/floor.png", required: true },
    shadow: { key: "qf-shadow", textureURL: "assets/art/environment/shadow.png", required: true },
    pillar: { key: "qf-pillar", textureURL: "assets/art/environment/pillar.png", normalMapURL: "assets/art/environment/pillar_n.png", required: true },
    gate: { key: "qf-gate", textureURL: "assets/art/environment/gate.png", normalMapURL: "assets/art/environment/gate_n.png", required: true },
    terminal: { key: "qf-terminal", textureURL: "assets/art/environment/terminal.png", required: true },
    bolt: { key: "qf-bolt", textureURL: "assets/art/vfx/bolt.png", required: true },
    slash: { key: "qf-slash", textureURL: "assets/art/vfx/slash.png", required: true },
    haze: { key: "qf-haze", textureURL: "assets/art/vfx/haze.png", required: true },
  },
};

export type AssetValidationResult = {
  ok: boolean;
  missing: string[];
};

export function requiredFrameNames(): string[] {
  const names: string[] = [];
  const actions = Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][];
  for (const direction of SPRITE_DIRECTIONS) {
    for (const [action, count] of actions) {
      for (let frame = 0; frame < count; frame += 1) {
        names.push(`${action}-${direction}-${frame}`);
      }
    }
  }
  return names;
}

function atlasHasFrames(
  textureExists: (key: string) => boolean,
  frameExists: (key: string, frame: string) => boolean,
  atlasKey: string,
  directions: readonly SpriteDirection[],
): boolean {
  if (!textureExists(atlasKey)) {
    return false;
  }

  const actions = Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][];
  for (const direction of directions) {
    for (const [action, count] of actions) {
      for (let frame = 0; frame < count; frame += 1) {
        if (!frameExists(atlasKey, `${action}-${direction}-${frame}`)) {
          return false;
        }
      }
    }
  }

  return true;
}

export function validateLoadedAssets(
  manifest: AssetManifest,
  textureExists: (key: string) => boolean,
  frameExists: (key: string, frame: string) => boolean,
): AssetValidationResult {
  const missing: string[] = [];

  if (!atlasHasFrames(textureExists, frameExists, manifest.actorAtlases.player.key, SPRITE_DIRECTIONS)) {
    missing.push(manifest.actorAtlases.player.key);
  }

  if (!atlasHasFrames(textureExists, frameExists, manifest.actorAtlases.drone.key, SPRITE_DIRECTIONS)) {
    missing.push(manifest.actorAtlases.drone.key);
  }

  const environmentEntries = Object.values(manifest.environment);
  for (const entry of environmentEntries) {
    if (entry.required && !textureExists(entry.key)) {
      missing.push(entry.key);
    }
  }

  return {
    ok: missing.length === 0,
    missing,
  };
}

export function resolveArtMode(
  requestedMode: ArtMode,
  validation: AssetValidationResult,
): ArtMode {
  if (requestedMode === "procedural") {
    return "procedural";
  }

  if (validation.ok) {
    return requestedMode === "external-only" ? "external-only" : "external-preferred";
  }

  return requestedMode === "external-only" ? "external-only" : "procedural";
}

export function shouldQueueExternalArt(requestedMode: ArtMode): boolean {
  return requestedMode !== "procedural";
}

export function getRequestedArtMode(search = globalThis.location?.search ?? ""): ArtMode {
  const mode = new URLSearchParams(search).get("art");

  if (mode === "external" || mode === "external-preferred") {
    return "external-preferred";
  }

  if (mode === "external-only") {
    return "external-only";
  }

  if (mode === "procedural") {
    return "procedural";
  }

  return DEFAULT_ART_MODE;
}
