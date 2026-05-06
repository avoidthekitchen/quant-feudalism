export const SCENES = {
  boot: "BootScene",
  shop: "ShopScene",
  arena: "ArenaScene",
} as const;

export const SHOP_BUNDLES = [
  { amount: 360, cost: 60, label: "Minor Refill" },
  { amount: 540, cost: 84, label: "Corporate Slice" },
  { amount: 900, cost: 126, label: "Dynasty Reserve" },
] as const;

export const SHOP_BUNDLE_COST_GROWTH_PER_ROUND = 1.075;

export function getScaledShopBundleCost(baseCost: number, roundsFinished: number): number {
  const safeBaseCost = Math.max(0, Math.floor(baseCost));
  const safeRoundsFinished = Math.max(0, Math.floor(roundsFinished));
  return Math.ceil(safeBaseCost * SHOP_BUNDLE_COST_GROWTH_PER_ROUND ** safeRoundsFinished);
}

export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;
