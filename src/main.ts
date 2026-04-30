import "./style.css";
import { createGame } from "./game";
import { SHOP_BUNDLES, SCENES } from "./game/constants";
import { gameState } from "./game/state";

gameState.hydrateFromStorage();
const game = createGame("game-root");

const appShell = document.querySelector<HTMLElement>("#app-shell");
const gameRoot = document.querySelector<HTMLElement>("#game-root");
const sceneChip = document.querySelector<HTMLSpanElement>("#scene-chip");
const scoreboardList = document.querySelector<HTMLDivElement>("#scoreboard-list");
const computeFill = document.querySelector<HTMLDivElement>("#compute-fill");
const allotmentFill = document.querySelector<HTMLDivElement>("#allotment-fill");
const integrityFill = document.querySelector<HTMLDivElement>("#integrity-fill");
const computeLabel = document.querySelector<HTMLElement>("#compute-label");
const allotmentLabel = document.querySelector<HTMLElement>("#allotment-label");
const creditsLabel = document.querySelector<HTMLElement>("#credits-label");
const integrityLabel = document.querySelector<HTMLElement>("#integrity-label");
const throttleLabel = document.querySelector<HTMLElement>("#throttle-label");
const killsLabel = document.querySelector<HTMLElement>("#kills-label");
const roundsLabel = document.querySelector<HTMLElement>("#rounds-label");
const statusNote = document.querySelector<HTMLParagraphElement>("#status-note");
const previousNote = document.querySelector<HTMLParagraphElement>("#previous-note");
const olderNote = document.querySelector<HTMLParagraphElement>("#older-note");
const reportNote = document.querySelector<HTMLParagraphElement>("#report-note");
const arenaPromptLabel = document.querySelector<HTMLDivElement>("#arena-prompt");
const shopModal = document.querySelector<HTMLElement>("#shop-modal");
const workshopModal = document.querySelector<HTMLElement>("#workshop-modal");
const shopOpenButton = document.querySelector<HTMLButtonElement>("#shop-open-button");
const workshopOpenButton = document.querySelector<HTMLButtonElement>("#workshop-open-button");
const endRunButton = document.querySelector<HTMLButtonElement>("#end-run-button");
const shopCloseButton = document.querySelector<HTMLButtonElement>("#shop-close-button");
const shopBackdrop = document.querySelector<HTMLButtonElement>("#shop-backdrop");
const workshopCloseButton = document.querySelector<HTMLButtonElement>("#workshop-close-button");
const workshopBackdrop = document.querySelector<HTMLButtonElement>("#workshop-backdrop");
const runSummaryModal = document.querySelector<HTMLElement>("#run-summary-modal");
const runSummaryReason = document.querySelector<HTMLElement>("#run-summary-reason");
const runSummaryNote = document.querySelector<HTMLElement>("#run-summary-note");
const runSummaryRounds = document.querySelector<HTMLElement>("#run-summary-rounds");
const runSummaryKills = document.querySelector<HTMLElement>("#run-summary-kills");
const runSummaryTuners = document.querySelector<HTMLElement>("#run-summary-tuners");
const runSummaryEnhancements = document.querySelector<HTMLElement>("#run-summary-enhancements");
const startNewRunButton = document.querySelector<HTMLButtonElement>("#start-new-run-button");
const deployButton = document.querySelector<HTMLButtonElement>("#deploy-button");
const healButton = document.querySelector<HTMLButtonElement>("#heal-button");
const healLabel = document.querySelector<HTMLElement>("#heal-label");
const healCostLabel = document.querySelector<HTMLElement>("#heal-cost-label");
const quantumTunerButton = document.querySelector<HTMLButtonElement>("#quantum-tuner-button");
const quantumTunerLabel = document.querySelector<HTMLElement>("#quantum-tuner-label");
const quantumTunerCostLabel = document.querySelector<HTMLElement>("#quantum-tuner-cost-label");
const rateLimitButton = document.querySelector<HTMLButtonElement>("#rate-limit-button");
const rateLimitLabel = document.querySelector<HTMLElement>("#rate-limit-label");
const rateLimitCostLabel = document.querySelector<HTMLElement>("#rate-limit-cost-label");
const quantumTunersLabel = document.querySelector<HTMLElement>("#quantum-tuners-label");
const quantumTunerIcons = Array.from(document.querySelectorAll<HTMLElement>(".quantum-tuner-icon"));
const shopButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".bundle-grid .shop-button"));
const shopOnlyPanels = Array.from(document.querySelectorAll<HTMLElement>(".shop-only"));
const arenaOnlyPanels = Array.from(document.querySelectorAll<HTMLElement>(".arena-only"));
let shopModalOpen = false;
let workshopModalOpen = false;
const noteHistory = [gameState.notice];
let lastHudTimelineVersion = gameState.hudTimelineVersion;

function numberLabel(value: number): string {
  return value >= 0 ? Math.round(value).toString() : `-${Math.round(Math.abs(value))}`;
}

function timeLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : `${seconds}s`;
}

function setShopModalOpen(open: boolean): void {
  shopModalOpen = open;
  shopModal?.classList.toggle("open", open && gameState.sceneMode === "shop");
}

function setWorkshopModalOpen(open: boolean): void {
  workshopModalOpen = open;
  workshopModal?.classList.toggle("open", open && gameState.sceneMode === "shop");
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function renderScoreboard(): void {
  if (!scoreboardList) {
    return;
  }

  const entries = gameState.getTopRuns(3);
  scoreboardList.replaceChildren();

  if (entries.length === 0) {
    const emptyState = document.createElement("p");
    emptyState.className = "scoreboard-empty";
    emptyState.textContent = "No runs archived yet.";
    scoreboardList.append(emptyState);
    return;
  }

  entries.forEach((entry, index) => {
    const row = document.createElement("div");
    row.className = `scoreboard-row${entry.active ? " active" : ""}`;

    const rank = document.createElement("span");
    rank.className = "scoreboard-rank";
    rank.textContent = `#${index + 1}`;

    const main = document.createElement("div");
    main.className = "scoreboard-main";
    const rounds = document.createElement("strong");
    rounds.textContent = `${entry.roundsFinished} Rounds Finished`;
    const runLabel = document.createElement("span");
    runLabel.textContent = entry.active ? "Current Run" : `Archived Run ${entry.runId}`;
    main.append(rounds, runLabel);

    const side = document.createElement("div");
    side.className = "scoreboard-side";
    const kills = document.createElement("strong");
    kills.textContent = `${entry.kills} Kills`;
    const status = document.createElement("span");
    status.textContent = entry.active
      ? `ACTIVE - ${timeLabel(entry.totalArenaTimeMs ?? 0)} Arena`
      : `${timeLabel(entry.totalArenaTimeMs ?? 0)} Arena`;
    if (entry.active) {
      status.className = "scoreboard-active";
    }
    side.append(kills, status);

    row.append(rank, main, side);
    scoreboardList.append(row);
  });
}

function renderHud(): void {
  if (
    !sceneChip ||
    !computeFill ||
    !allotmentFill ||
    !integrityFill ||
    !computeLabel ||
    !allotmentLabel ||
    !arenaPromptLabel ||
    !integrityLabel ||
    !throttleLabel
  ) {
    return;
  }

  const computeRatio = Math.max(0, Math.min(1, gameState.computeCurrent / gameState.computeMax));
  const allotmentRatio = Math.max(0, Math.min(1, gameState.allotmentCurrent / gameState.allotmentMax));
  const integrityRatio = Math.max(0, Math.min(1, gameState.integrityCurrent / gameState.integrityMax));
  const throttle = gameState.getThrottleSeverity();
  const inShop = gameState.sceneMode === "shop";
  const summaryOpen = inShop && !gameState.runActive && Boolean(gameState.latestRunSummary);
  const deployDisabled =
    !inShop ||
    !gameState.runActive ||
    gameState.allotmentCurrent <= 0 ||
    gameState.integrityCurrent <= 0;
  if (!inShop) {
    shopModalOpen = false;
    workshopModalOpen = false;
  }
  if (summaryOpen) {
    shopModalOpen = false;
    workshopModalOpen = false;
  }

  sceneChip.textContent = inShop ? "Shop" : "Arena";
  computeFill.style.width = `${computeRatio * 100}%`;
  computeFill.style.filter = throttle > 0.55 ? "brightness(0.86) saturate(0.64)" : "";
  allotmentFill.style.width = `${allotmentRatio * 100}%`;
  allotmentFill.style.filter = gameState.allotmentCurrent <= 0 ? "grayscale(0.6)" : "";
  integrityFill.style.width = `${integrityRatio * 100}%`;
  integrityFill.style.filter = integrityRatio <= 0.3 ? "brightness(0.9) saturate(1.2)" : "";

  computeLabel.textContent = `${numberLabel(gameState.computeCurrent)} / ${gameState.computeMax}`;
  allotmentLabel.textContent = `${numberLabel(gameState.allotmentCurrent)} / ${gameState.allotmentMax}`;
  creditsLabel!.textContent = gameState.credits.toString();
  integrityLabel!.textContent = `${Math.round(gameState.integrityCurrent)} / ${gameState.integrityMax}`;
  throttleLabel!.textContent = gameState.getThrottleLabel();
  killsLabel!.textContent = gameState.getCurrentRunKills().toString();
  roundsLabel!.textContent = gameState.roundsFinished.toString();
  renderScoreboard();

  if (lastHudTimelineVersion !== gameState.hudTimelineVersion) {
    noteHistory.splice(0, noteHistory.length, gameState.notice);
    lastHudTimelineVersion = gameState.hudTimelineVersion;
  } else if (noteHistory[0] !== gameState.notice) {
    noteHistory.unshift(gameState.notice);
    noteHistory.length = Math.min(noteHistory.length, 3);
  }

  statusNote!.textContent = gameState.notice;
  previousNote!.textContent = noteHistory[1] ?? "";
  olderNote!.textContent = noteHistory[2] ?? "";
  arenaPromptLabel!.textContent = gameState.arenaPrompt;
  reportNote!.textContent =
    `${gameState.report.note} Shop Credits +${gameState.report.creditsEarned}. Compute Credits spent ${Math.round(gameState.report.allotmentSpent)}.`;
  gameRoot?.classList.toggle("extraction-ready", gameState.extractionReady);

  shopOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", !inShop));
  arenaOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", inShop));

  deployButton!.disabled = deployDisabled;
  deployButton!.textContent = deployDisabled
    ? !gameState.runActive
      ? "Run Ended"
      : gameState.integrityCurrent <= 0
      ? "Repair Integrity at Workshop"
      : "Compute Credits Required"
    : "Enter Arena";

  healButton!.disabled =
    !inShop ||
    !gameState.runActive ||
    gameState.integrityCurrent >= gameState.integrityMax ||
    gameState.allotmentCurrent < gameState.healCost;
  healLabel!.textContent = `+${gameState.healAmount} Integrity`;
  healCostLabel!.textContent = `${gameState.healCost} Compute Credits`;

  quantumTunersLabel!.textContent = `${gameState.quantumTuners} / ${gameState.quantumTunerCap}`;
  quantumTunerIcons.forEach((icon, index) => {
    icon.classList.toggle("active", index < gameState.quantumTuners);
  });
  quantumTunerButton!.disabled =
    !inShop ||
    !gameState.runActive ||
    gameState.quantumTuners >= gameState.quantumTunerCap ||
    gameState.allotmentCurrent < gameState.quantumTunerCost;
  quantumTunerLabel!.textContent = `Banked Collapse Charge (${gameState.quantumTuners}/${gameState.quantumTunerCap})`;
  quantumTunerCostLabel!.textContent = `${gameState.quantumTunerCost} Compute Credits`;

  const upgradeCost = gameState.getComputeRateLimitUpgradeCost();
  rateLimitButton!.disabled = !inShop || !gameState.runActive || gameState.credits < upgradeCost;
  rateLimitLabel!.textContent = `+${gameState.computeRateLimitUpgradeAmount} Compute Rate Limit`;
  rateLimitCostLabel!.textContent = `${upgradeCost} shop credits`;

  shopButtons.forEach((button) => {
    const amount = Number(button.dataset.amount);
    const cost = Number(button.dataset.cost);
    button.disabled =
      !inShop ||
      !gameState.runActive ||
      gameState.credits < cost ||
      gameState.allotmentCurrent >= gameState.allotmentMax;
    const bundle = SHOP_BUNDLES.find((item) => item.amount === amount && item.cost === cost);
    if (bundle) {
      button.setAttribute("aria-label", `${bundle.label}: buy ${amount} Compute Credits for ${cost} shop credits`);
    }
  });

  endRunButton!.disabled = !inShop || !gameState.runActive;

  if (
    runSummaryModal &&
    runSummaryReason &&
    runSummaryNote &&
    runSummaryRounds &&
    runSummaryKills &&
    runSummaryTuners &&
    runSummaryEnhancements
  ) {
    const summary = summaryOpen ? gameState.latestRunSummary : null;
    runSummaryModal.classList.toggle("open", Boolean(summary));
    if (summary) {
      runSummaryReason.textContent = summary.endReason === "manual" ? "Manual Archive" : "Run Insolvent";
      runSummaryNote.textContent =
        summary.endReason === "manual"
          ? "The contract was closed by choice. A new run starts from the base procurement loadout."
          : "Integrity failed without enough Compute Credits to fund repair. The contract is over.";
      runSummaryRounds.textContent = summary.roundsFinished.toString();
      runSummaryKills.textContent = summary.kills.toString();
      runSummaryTuners.textContent = summary.quantumTunersUsed.toString();
      runSummaryEnhancements.textContent =
        summary.computeRateLimitUpgradesGained > 0
          ? `Compute Rate Limit +${
              summary.computeRateLimitUpgradesGained * gameState.computeRateLimitUpgradeAmount
            } (${pluralize(summary.computeRateLimitUpgradesGained, "upgrade")})`
          : "None";
    }
  }

  appShell?.setAttribute("data-scene", gameState.sceneMode);
  setShopModalOpen(shopModalOpen);
  setWorkshopModalOpen(workshopModalOpen);
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

quantumTunerButton?.addEventListener("click", () => {
  gameState.buyQuantumTuner();
});

rateLimitButton?.addEventListener("click", () => {
  gameState.upgradeComputeRateLimit();
});

shopOpenButton?.addEventListener("click", () => {
  setWorkshopModalOpen(false);
  setShopModalOpen(true);
});

workshopOpenButton?.addEventListener("click", () => {
  setShopModalOpen(false);
  setWorkshopModalOpen(true);
});

endRunButton?.addEventListener("click", () => {
  setShopModalOpen(false);
  setWorkshopModalOpen(false);
  gameState.endRun("manual");
});

shopCloseButton?.addEventListener("click", () => {
  setShopModalOpen(false);
});

shopBackdrop?.addEventListener("click", () => {
  setShopModalOpen(false);
});

workshopCloseButton?.addEventListener("click", () => {
  setWorkshopModalOpen(false);
});

workshopBackdrop?.addEventListener("click", () => {
  setWorkshopModalOpen(false);
});

deployButton?.addEventListener("click", () => {
  if (
    gameState.sceneMode !== "shop" ||
    !gameState.runActive ||
    gameState.allotmentCurrent <= 0 ||
    gameState.integrityCurrent <= 0
  ) {
    return;
  }

  gameState.beginArena();
  gameState.persistToStorage();
  setShopModalOpen(false);
  setWorkshopModalOpen(false);
  game.scene.start(SCENES.arena);
});

startNewRunButton?.addEventListener("click", () => {
  setShopModalOpen(false);
  setWorkshopModalOpen(false);
  gameState.startNewRun();
  game.scene.start(SCENES.shop);
});

gameState.addEventListener("statechange", () => {
  renderHud();
  if (gameState.sceneMode === "shop") {
    gameState.persistToStorage();
  }
});
renderHud();
if (gameState.sceneMode === "shop") {
  gameState.persistToStorage();
}

document.addEventListener("contextmenu", (event) => {
  if ((event.target as HTMLElement | null)?.closest("#game-root")) {
    event.preventDefault();
  }
});
