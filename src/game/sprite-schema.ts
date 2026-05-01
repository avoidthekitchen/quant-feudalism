export const SPRITE_DIRECTIONS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;

export const SPRITE_ACTIONS = {
  idle: 2,
  run: 4,
  attack: 3,
  dash: 3,
} as const;

export type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];
export type SpriteAction = keyof typeof SPRITE_ACTIONS;
