export const SCENES = {
  boot: "BootScene",
  shop: "ShopScene",
  arena: "ArenaScene",
} as const;

export const SHOP_BUNDLES = [
  { amount: 720, cost: 20, label: "Minor Refill" },
  { amount: 1440, cost: 38, label: "Corporate Slice" },
  { amount: 2400, cost: 58, label: "Dynasty Reserve" },
] as const;

export const SHOP_BUNDLE_COST_GROWTH_PER_ROUND = 1.05;

export function getScaledShopBundleCost(baseCost: number, roundsFinished: number): number {
  const safeBaseCost = Math.max(0, Math.floor(baseCost));
  const safeRoundsFinished = Math.max(0, Math.floor(roundsFinished));
  return Math.ceil(safeBaseCost * SHOP_BUNDLE_COST_GROWTH_PER_ROUND ** safeRoundsFinished);
}

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
