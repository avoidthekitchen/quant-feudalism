import {
  SPRITE_ACTIONS,
  SPRITE_DIRECTIONS,
  type SpriteAction,
  type SpriteDirection,
} from "./sprite-schema.ts";

export type AnimationSpec = {
  actor: "player" | "drone";
  action: SpriteAction;
  direction: SpriteDirection;
  frameRate: number;
  repeat: number;
  hitFrameIndex?: number;
  fallbackDirection?: SpriteDirection;
};

export function buildAnimationSpec(actor: "player" | "drone"): AnimationSpec[] {
  const specs: AnimationSpec[] = [];

  for (const direction of SPRITE_DIRECTIONS) {
    const entries = Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][];
    for (const [action] of entries) {
      const frameRate = action === "idle" ? 3 : action === "run" ? 11 : 15;
      const repeat = action === "attack" || action === "dash" ? 0 : -1;
      const hitFrameIndex = action === "attack" ? 1 : undefined;
      const fallbackDirection = direction === "w" ? "e" : direction === "nw" ? "ne" : direction === "sw" ? "se" : undefined;
      specs.push({
        actor,
        action,
        direction,
        frameRate,
        repeat,
        hitFrameIndex,
        fallbackDirection,
      });
    }
  }

  return specs;
}

export function validateAnimationSpec(specs: AnimationSpec[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const index = new Set(specs.map((spec) => `${spec.actor}:${spec.action}:${spec.direction}`));
  const actions = Object.keys(SPRITE_ACTIONS) as SpriteAction[];

  for (const actor of ["player", "drone"] as const) {
    for (const action of actions) {
      for (const direction of SPRITE_DIRECTIONS) {
        const key = `${actor}:${action}:${direction}`;
        if (!index.has(key)) {
          missing.push(key);
        }
      }
    }
  }

  return { ok: missing.length === 0, missing };
}
