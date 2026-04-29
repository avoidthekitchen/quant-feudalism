export const SCENES = {
  boot: "BootScene",
  shop: "ShopScene",
  arena: "ArenaScene",
} as const;

export const SHOP_BUNDLES = [
  { amount: 720, cost: 18, label: "Minor Refill" },
  { amount: 1440, cost: 34, label: "Corporate Slice" },
  { amount: 2400, cost: 52, label: "Dynasty Reserve" },
] as const;

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
