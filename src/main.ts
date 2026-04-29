import "./style.css";
import { createGame } from "./game";
import { SHOP_BUNDLES, SCENES } from "./game/constants";
import { gameState } from "./game/state";

const game = createGame("game-root");

const sceneChip = document.querySelector<HTMLSpanElement>("#scene-chip");
const computeFill = document.querySelector<HTMLDivElement>("#compute-fill");
const allotmentFill = document.querySelector<HTMLDivElement>("#allotment-fill");
const computeLabel = document.querySelector<HTMLElement>("#compute-label");
const allotmentLabel = document.querySelector<HTMLElement>("#allotment-label");
const creditsLabel = document.querySelector<HTMLElement>("#credits-label");
const integrityLabel = document.querySelector<HTMLElement>("#integrity-label");
const throttleLabel = document.querySelector<HTMLElement>("#throttle-label");
const killsLabel = document.querySelector<HTMLElement>("#kills-label");
const roundsLabel = document.querySelector<HTMLElement>("#rounds-label");
const statusNote = document.querySelector<HTMLParagraphElement>("#status-note");
const reportNote = document.querySelector<HTMLParagraphElement>("#report-note");
const shopPanel = document.querySelector<HTMLElement>("#shop-panel");
const deployButton = document.querySelector<HTMLButtonElement>("#deploy-button");
const healButton = document.querySelector<HTMLButtonElement>("#heal-button");
const healLabel = document.querySelector<HTMLElement>("#heal-label");
const healCostLabel = document.querySelector<HTMLElement>("#heal-cost-label");
const rateLimitButton = document.querySelector<HTMLButtonElement>("#rate-limit-button");
const rateLimitLabel = document.querySelector<HTMLElement>("#rate-limit-label");
const rateLimitCostLabel = document.querySelector<HTMLElement>("#rate-limit-cost-label");
const shopButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".bundle-grid .shop-button"));
const shopOnlyPanels = Array.from(document.querySelectorAll<HTMLElement>(".shop-only"));
const arenaOnlyPanels = Array.from(document.querySelectorAll<HTMLElement>(".arena-only"));

function numberLabel(value: number): string {
  return value >= 0 ? Math.round(value).toString() : `-${Math.round(Math.abs(value))}`;
}

function renderHud(): void {
  if (!sceneChip || !computeFill || !allotmentFill || !computeLabel || !allotmentLabel) {
    return;
  }

  const computeRatio = Math.max(0, Math.min(1, gameState.computeCurrent / gameState.computeMax));
  const allotmentRatio = Math.max(0, Math.min(1, gameState.allotmentCurrent / gameState.allotmentMax));
  const throttle = gameState.getThrottleSeverity();
  const inShop = gameState.sceneMode === "shop";
  const deployDisabled = !inShop || gameState.allotmentCurrent <= 0 || gameState.integrityCurrent <= 0;

  sceneChip.textContent = inShop ? "Shop" : "Arena";
  computeFill.style.width = `${computeRatio * 100}%`;
  computeFill.style.filter = throttle > 0.55 ? "brightness(0.86) saturate(0.64)" : "";
  allotmentFill.style.width = `${allotmentRatio * 100}%`;
  allotmentFill.style.filter = gameState.allotmentCurrent <= 0 ? "grayscale(0.6)" : "";

  computeLabel.textContent = `${numberLabel(gameState.computeCurrent)} / ${gameState.computeMax}`;
  allotmentLabel.textContent = `${numberLabel(gameState.allotmentCurrent)} / ${gameState.allotmentMax}`;
  creditsLabel!.textContent = gameState.credits.toString();
  integrityLabel!.textContent = `${Math.round(gameState.integrityCurrent)} / ${gameState.integrityMax}`;
  throttleLabel!.textContent = gameState.getThrottleLabel();
  killsLabel!.textContent = gameState.kills.toString();
  roundsLabel!.textContent = gameState.roundsFinished.toString();
  statusNote!.textContent = gameState.notice;
  reportNote!.textContent =
    `${gameState.report.note} Shop Credits +${gameState.report.creditsEarned}. Compute Credits spent ${Math.round(gameState.report.allotmentSpent)}.`;

  shopOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", !inShop));
  arenaOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", inShop));

  deployButton!.disabled = deployDisabled;
  deployButton!.textContent = deployDisabled
    ? gameState.integrityCurrent <= 0
      ? "Repair Integrity Required"
      : "Compute Credits Required"
    : "Enter Arena";

  healButton!.disabled =
    !inShop ||
    gameState.integrityCurrent >= gameState.integrityMax ||
    gameState.allotmentCurrent < gameState.healCost;
  healLabel!.textContent = `+${gameState.healAmount} Integrity`;
  healCostLabel!.textContent = `${gameState.healCost} Compute Credits`;

  const upgradeCost = gameState.getComputeRateLimitUpgradeCost();
  rateLimitButton!.disabled = !inShop || gameState.credits < upgradeCost;
  rateLimitLabel!.textContent = `+${gameState.computeRateLimitUpgradeAmount} Compute Rate Limit`;
  rateLimitCostLabel!.textContent = `${upgradeCost} shop credits`;

  shopButtons.forEach((button) => {
    const amount = Number(button.dataset.amount);
    const cost = Number(button.dataset.cost);
    button.disabled =
      !inShop || gameState.credits < cost || gameState.allotmentCurrent >= gameState.allotmentMax;
    const bundle = SHOP_BUNDLES.find((item) => item.amount === amount && item.cost === cost);
    if (bundle) {
      button.setAttribute("aria-label", `${bundle.label}: buy ${amount} Compute Credits for ${cost} shop credits`);
    }
  });

  shopPanel?.setAttribute("data-scene", gameState.sceneMode);
}

shopButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.amount);
    const cost = Number(button.dataset.cost);
    gameState.buyAllotment(amount, cost);
  });
});

healButton?.addEventListener("click", () => {
  gameState.repairIntegrity();
});

rateLimitButton?.addEventListener("click", () => {
  gameState.upgradeComputeRateLimit();
});

deployButton?.addEventListener("click", () => {
  if (
    gameState.sceneMode !== "shop" ||
    gameState.allotmentCurrent <= 0 ||
    gameState.integrityCurrent <= 0
  ) {
    return;
  }

  gameState.beginArena();
  game.scene.start(SCENES.arena);
});

gameState.addEventListener("statechange", renderHud);
renderHud();

document.addEventListener("contextmenu", (event) => {
  if ((event.target as HTMLElement | null)?.closest("#game-root")) {
    event.preventDefault();
  }
});
