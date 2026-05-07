import "./style.css";
import { createGame } from "./game";
import { SHOP_BUNDLES, SCENES } from "./game/constants";
import { gameState } from "./game/state";

gameState.hydrateFromStorage();
const game = createGame("game-root");

const appShell = document.querySelector<HTMLElement>("#app-shell");
const gameRoot = document.querySelector<HTMLElement>("#game-root");
const sceneChip = document.querySelector<HTMLSpanElement>("#scene-chip");
const scoreboardList =
  document.querySelector<HTMLDivElement>("#scoreboard-list");
const splashScreen = document.querySelector<HTMLElement>("#splash-screen");
const splashContinueButton = document.querySelector<HTMLButtonElement>(
  "#splash-continue-button",
);
const pauseMenu = document.querySelector<HTMLElement>("#pause-menu");
const pauseButton = document.querySelector<HTMLButtonElement>("#pause-button");
const resumeButton = document.querySelector<HTMLButtonElement>("#resume-button");
const splashReturnButton = document.querySelector<HTMLButtonElement>(
  "#splash-return-button",
);
const computeFill = document.querySelector<HTMLDivElement>("#compute-fill");
const allotmentFill = document.querySelector<HTMLDivElement>("#allotment-fill");
const integrityFill = document.querySelector<HTMLDivElement>("#integrity-fill");
const computeLabel = document.querySelector<HTMLElement>("#compute-label");
const allotmentLabel = document.querySelector<HTMLElement>("#allotment-label");
const creditsLabel = document.querySelector<HTMLElement>("#credits-label");
const integrityLabel = document.querySelector<HTMLElement>("#integrity-label");
const killsLabel = document.querySelector<HTMLElement>("#kills-label");
const roundsLabel = document.querySelector<HTMLElement>("#rounds-label");
const shopAllotmentLabel = document.querySelector<HTMLElement>("#shop-allotment-label");
const shopMarketAllotmentLabel = document.querySelector<HTMLElement>("#shop-market-allotment-label");
const shopMarketAllotmentFill = document.querySelector<HTMLDivElement>("#shop-market-allotment-fill");
const workshopIntegrityLabel = document.querySelector<HTMLElement>("#workshop-integrity-label");
const workshopIntegrityFill = document.querySelector<HTMLDivElement>("#workshop-integrity-fill");
const statusNote = document.querySelector<HTMLParagraphElement>("#status-note");
const previousNote =
  document.querySelector<HTMLParagraphElement>("#previous-note");
const olderNote = document.querySelector<HTMLParagraphElement>("#older-note");
const reportNote = document.querySelector<HTMLParagraphElement>("#report-note");
const arenaPromptLabel =
  document.querySelector<HTMLDivElement>("#arena-prompt");
const shopModal = document.querySelector<HTMLElement>("#shop-modal");
const workshopModal = document.querySelector<HTMLElement>("#workshop-modal");
type ShopSceneAction = "deploy" | "market" | "workshop";

const shopOpenButton =
  document.querySelector<HTMLButtonElement>("#shop-open-button");
const workshopOpenButton = document.querySelector<HTMLButtonElement>(
  "#workshop-open-button",
);
const endRunButton =
  document.querySelector<HTMLButtonElement>("#end-run-button");
const shopCloseButton =
  document.querySelector<HTMLButtonElement>("#shop-close-button");
const shopBackdrop =
  document.querySelector<HTMLButtonElement>("#shop-backdrop");
const workshopCloseButton = document.querySelector<HTMLButtonElement>(
  "#workshop-close-button",
);
const workshopBackdrop =
  document.querySelector<HTMLButtonElement>("#workshop-backdrop");
const runSummaryModal =
  document.querySelector<HTMLElement>("#run-summary-modal");
const runSummaryReason = document.querySelector<HTMLElement>(
  "#run-summary-reason",
);
const runSummaryNote = document.querySelector<HTMLElement>("#run-summary-note");
const runSummaryRounds = document.querySelector<HTMLElement>(
  "#run-summary-rounds",
);
const runSummaryKills =
  document.querySelector<HTMLElement>("#run-summary-kills");
const runSummaryTuners = document.querySelector<HTMLElement>(
  "#run-summary-tuners",
);
const runSummaryEnhancements = document.querySelector<HTMLElement>(
  "#run-summary-enhancements",
);
const startNewRunButton = document.querySelector<HTMLButtonElement>(
  "#start-new-run-button",
);
const deployButton =
  document.querySelector<HTMLButtonElement>("#deploy-button");
const deckAccessCountLabel =
  document.querySelector<HTMLElement>("#deck-access-count-label");
const deckAccessNote =
  document.querySelector<HTMLElement>("#deck-access-note");
const deckCountLabel =
  document.querySelector<HTMLElement>("#deck-count-label");
const deckValidationNote =
  document.querySelector<HTMLParagraphElement>("#deck-validation-note");
const deckBuilderList =
  document.querySelector<HTMLDivElement>("#deck-builder-list");
const deckResetButton =
  document.querySelector<HTMLButtonElement>("#deck-reset-button");
const healButton = document.querySelector<HTMLButtonElement>("#heal-button");
const healLabel = document.querySelector<HTMLElement>("#heal-label");
const healCostLabel = document.querySelector<HTMLElement>("#heal-cost-label");
const quantumTunerButton = document.querySelector<HTMLButtonElement>(
  "#quantum-tuner-button",
);
const quantumTunerLabel = document.querySelector<HTMLElement>(
  "#quantum-tuner-label",
);
const quantumTunerCostLabel = document.querySelector<HTMLElement>(
  "#quantum-tuner-cost-label",
);
const quantumTunersLabel = document.querySelector<HTMLElement>(
  "#quantum-tuners-label",
);
const quantumTunerIcons = Array.from(
  document.querySelectorAll<HTMLElement>(".quantum-tuner-icon"),
);
const shopButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>(".bundle-grid .shop-button"),
);
const shopOnlyPanels = Array.from(
  document.querySelectorAll<HTMLElement>(".shop-only"),
);
const arenaOnlyPanels = Array.from(
  document.querySelectorAll<HTMLElement>(".arena-only"),
);
let shopModalOpen = false;
let workshopModalOpen = false;
let splashVisible = true;
let pauseMenuOpen = false;
const noteHistory = [gameState.notice];
let lastHudTimelineVersion = gameState.hudTimelineVersion;
let lastNoticeScene = gameState.sceneMode;
let arenaNoticeFadeTimeout: number | undefined;

function numberLabel(value: number): string {
  return value >= 0
    ? Math.round(value).toString()
    : `-${Math.round(Math.abs(value))}`;
}

function timeLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${seconds.toString().padStart(2, "0")}s`
    : `${seconds}s`;
}

function setShopModalOpen(open: boolean): void {
  shopModalOpen = open;
  shopModal?.classList.toggle("open", open && gameState.sceneMode === "shop");
}

function setWorkshopModalOpen(open: boolean): void {
  workshopModalOpen = open;
  workshopModal?.classList.toggle(
    "open",
    open && gameState.sceneMode === "shop",
  );
}

function setSplashVisible(visible: boolean): void {
  splashVisible = visible;
  if (visible) {
    setShopModalOpen(false);
    setWorkshopModalOpen(false);
    setPauseMenuOpen(false);
  }
  splashScreen?.classList.toggle("hidden", !visible);
  gameRoot?.classList.toggle("splash-visible", visible);
}

function setPauseMenuOpen(open: boolean): void {
  pauseMenuOpen = open;
  pauseMenu?.classList.toggle("open", open);
  if (open) {
    if (gameState.sceneMode === "arena") {
      game.scene.pause(SCENES.arena);
    } else if (gameState.sceneMode === "shop") {
      game.scene.pause(SCENES.shop);
    }
  } else {
    if (gameState.sceneMode === "arena") {
      game.scene.resume(SCENES.arena);
    } else if (gameState.sceneMode === "shop") {
      game.scene.resume(SCENES.shop);
    }
  }
}

function togglePauseMenu(): void {
  if (splashVisible) {
    return;
  }

  setPauseMenuOpen(!pauseMenuOpen);
}

function showArenaNoticeBriefly(): void {
  gameRoot?.classList.add("notice-active");
  if (arenaNoticeFadeTimeout !== undefined) {
    window.clearTimeout(arenaNoticeFadeTimeout);
  }
  arenaNoticeFadeTimeout = window.setTimeout(() => {
    gameRoot?.classList.remove("notice-active");
    arenaNoticeFadeTimeout = undefined;
  }, 3_000);
}

function openMarket(): void {
  setWorkshopModalOpen(false);
  setShopModalOpen(true);
}

function openWorkshop(): void {
  setShopModalOpen(false);
  setWorkshopModalOpen(true);
}

function tryDeployToArena(): void {
  const deckValidation = gameState.getDraftDeckValidation();

  if (
    gameState.sceneMode !== "shop" ||
    !gameState.runActive ||
    gameState.allotmentCurrent <= 0 ||
    gameState.integrityCurrent <= 0 ||
    !deckValidation.valid
  ) {
    if (!deckValidation.valid) {
      gameState.setNotice(deckValidation.message);
    }
    return;
  }

  gameState.persistToStorage();
  if (!gameState.beginArena()) {
    return;
  }
  setPauseMenuOpen(false);
  setSplashVisible(false);
  setShopModalOpen(false);
  setWorkshopModalOpen(false);
  game.scene.start(SCENES.arena);
}

function handleShopSceneAction(action: ShopSceneAction): void {
  if (splashVisible || gameState.sceneMode !== "shop" || shopModalOpen || workshopModalOpen) {
    return;
  }

  if (action === "deploy") {
    tryDeployToArena();
    return;
  }

  if (action === "market") {
    openMarket();
    return;
  }

  openWorkshop();
}

function pluralize(
  value: number,
  singular: string,
  plural = `${singular}s`,
): string {
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
    runLabel.textContent = entry.active
      ? "Current Run"
      : `Archived Run ${entry.runId}`;
    main.append(rounds, runLabel);

    const side = document.createElement("div");
    side.className = "scoreboard-side";
    const kills = document.createElement("strong");
    kills.textContent = `${entry.kills} Kills`;
    const status = document.createElement("span");
    status.textContent = `Time:${timeLabel(entry.totalArenaTimeMs ?? 0)}`;
    if (entry.active) {
      status.className = "scoreboard-active";
    }
    side.append(kills, status);

    row.append(rank, main, side);
    scoreboardList.append(row);
  });
}

function renderDeckBuilder(): void {
  if (
    !deckAccessCountLabel ||
    !deckAccessNote ||
    !deckCountLabel ||
    !deckValidationNote ||
    !deckBuilderList ||
    !deckResetButton
  ) {
    return;
  }

  const validation = gameState.getDraftDeckValidation();
  const rows = gameState.getDeckBuilderRows();

  deckAccessCountLabel.textContent = `${validation.total} / 100`;
  deckAccessNote.textContent = validation.message;
  deckAccessNote.classList.toggle("invalid", !validation.valid);
  deckCountLabel.textContent = `${validation.total} / 100`;
  deckValidationNote.textContent = validation.message;
  deckValidationNote.classList.toggle("invalid", !validation.valid);
  deckBuilderList.replaceChildren();

  rows.forEach((row) => {
    const item = document.createElement("div");
    item.className = `deck-builder-row${row.available ? "" : " unavailable"}`;

    const meta = document.createElement("div");
    meta.className = "deck-card-meta";
    const title = document.createElement("div");
    title.className = "deck-card-title";
    const marker = document.createElement("span");
    marker.className = "deck-card-marker";
    marker.textContent = row.available
      ? row.definition?.cardClass === "special"
        ? "S"
        : ""
      : "X";
    marker.setAttribute("aria-hidden", "true");
    const name = document.createElement("strong");
    name.textContent = row.name;
    title.append(marker, name);

    const details = document.createElement("span");
    details.className = "deck-card-details";
    details.textContent = row.details;
    details.title = row.details;
    meta.append(title, details);

    const controls = document.createElement("div");
    controls.className = "deck-card-controls";
    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.className = "deck-count-button";
    decrement.textContent = "-";
    decrement.disabled = !row.canDecrement;
    decrement.setAttribute("aria-label", `Remove one ${row.name}`);
    decrement.addEventListener("click", () => {
      gameState.decrementDraftCard(row.id);
    });

    const count = document.createElement("span");
    count.className = "deck-card-count";
    count.textContent = row.count.toString();

    const increment = document.createElement("button");
    increment.type = "button";
    increment.className = "deck-count-button";
    increment.textContent = "+";
    increment.disabled = !row.canIncrement;
    increment.setAttribute("aria-label", `Add one ${row.name}`);
    increment.addEventListener("click", () => {
      gameState.incrementDraftCard(row.id);
    });

    controls.append(decrement, count, increment);
    item.append(meta, controls);
    deckBuilderList.append(item);
  });

  deckResetButton.disabled = !gameState.runActive || gameState.sceneMode !== "shop";
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
    !creditsLabel ||
    !killsLabel ||
    !roundsLabel ||
    !shopAllotmentLabel ||
    !shopMarketAllotmentLabel ||
    !shopMarketAllotmentFill ||
    !workshopIntegrityLabel ||
    !workshopIntegrityFill
  ) {
    return;
  }

  const computeRatio = Math.max(
    0,
    Math.min(1, gameState.computeCurrent / gameState.computeMax),
  );
  const allotmentRatio = Math.max(
    0,
    Math.min(1, gameState.allotmentCurrent / gameState.allotmentMax),
  );
  const integrityRatio = Math.max(
    0,
    Math.min(1, gameState.integrityCurrent / gameState.integrityMax),
  );
  const throttle = gameState.getThrottleSeverity();
  const inShop = gameState.sceneMode === "shop";
  const deckValidation = gameState.getDraftDeckValidation();
  const summaryOpen =
    inShop && !gameState.runActive && Boolean(gameState.latestRunSummary);
  const deployDisabled =
    !inShop ||
    !gameState.runActive ||
    gameState.allotmentCurrent <= 0 ||
    gameState.integrityCurrent <= 0 ||
    !deckValidation.valid;
  if (!inShop) {
    shopModalOpen = false;
    workshopModalOpen = false;
  }
  if (summaryOpen) {
    shopModalOpen = false;
    workshopModalOpen = false;
  }

  sceneChip.textContent = inShop ? "Shop" : "Arena";
  if (splashContinueButton) {
    splashContinueButton.textContent = gameState.runActive
      ? "Continue Run"
      : "View Run Summary";
    splashContinueButton.disabled = false;
  }
  computeFill.style.width = `${computeRatio * 100}%`;
  computeFill.style.filter =
    throttle > 0.55 ? "brightness(0.86) saturate(0.64)" : "";
  allotmentFill.style.width = `${allotmentRatio * 100}%`;
  allotmentFill.style.filter =
    gameState.allotmentCurrent <= 0 ? "grayscale(0.6)" : "";
  integrityFill.style.width = `${integrityRatio * 100}%`;
  integrityFill.style.filter =
    integrityRatio <= 0.3 ? "brightness(0.9) saturate(1.2)" : "";

  computeLabel.textContent = `${numberLabel(gameState.computeCurrent)}/${gameState.computeMax}`;
  allotmentLabel.textContent = `${numberLabel(gameState.allotmentCurrent)}/${gameState.allotmentMax}`;
  creditsLabel!.textContent = gameState.credits.toString();
  shopAllotmentLabel.textContent = `${numberLabel(gameState.allotmentCurrent)}/${gameState.allotmentMax}`;
  shopMarketAllotmentLabel.textContent = `${numberLabel(gameState.allotmentCurrent)}/${gameState.allotmentMax}`;
  shopMarketAllotmentFill.style.width = `${allotmentRatio * 100}%`;
  shopMarketAllotmentFill.style.filter =
    gameState.allotmentCurrent <= 0 ? "grayscale(0.6)" : "";
  workshopIntegrityLabel.textContent = `${numberLabel(gameState.integrityCurrent)}/${gameState.integrityMax}`;
  workshopIntegrityFill.style.width = `${integrityRatio * 100}%`;
  workshopIntegrityFill.style.filter =
    integrityRatio <= 0.3 ? "brightness(0.9) saturate(1.2)" : "";
  integrityLabel!.textContent = `${Math.round(gameState.integrityCurrent)}/${gameState.integrityMax}`;
  killsLabel!.textContent = gameState.getCurrentRunKills().toString();
  roundsLabel!.textContent = gameState.roundsFinished.toString();
  renderScoreboard();
  renderDeckBuilder();

  let noticeChanged = false;
  if (lastHudTimelineVersion !== gameState.hudTimelineVersion) {
    noteHistory.splice(0, noteHistory.length, gameState.notice);
    lastHudTimelineVersion = gameState.hudTimelineVersion;
    noticeChanged = true;
  } else if (noteHistory[0] !== gameState.notice) {
    noteHistory.unshift(gameState.notice);
    noteHistory.length = Math.min(noteHistory.length, 3);
    noticeChanged = true;
  }

  statusNote!.textContent = gameState.notice;
  previousNote!.textContent = noteHistory[1] ?? "";
  olderNote!.textContent = noteHistory[2] ?? "";
  arenaPromptLabel!.textContent = gameState.arenaPrompt;
  reportNote!.textContent = `${gameState.report.note} Bug Bounty Credits +${gameState.report.creditsEarned}. Compute Credits spent ${Math.round(gameState.report.allotmentSpent)}.`;
  gameRoot?.classList.toggle("extraction-ready", gameState.extractionReady);

  shopOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", !inShop));
  arenaOnlyPanels.forEach((panel) => panel.classList.toggle("hidden", inShop));
  arenaPromptLabel!.classList.toggle(
    "hidden",
    inShop || gameState.arenaPrompt.length <= 0,
  );

  deployButton!.disabled = deployDisabled;
  deployButton!.textContent = deployDisabled
    ? !gameState.runActive
      ? "Run Ended"
      : gameState.integrityCurrent <= 0
        ? "Repair Integrity at Workshop"
        : gameState.allotmentCurrent <= 0
          ? "Compute Credits Required"
          : deckValidation.message
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

  shopButtons.forEach((button) => {
    const amount = Number(button.dataset.amount);
    const baseCost = Number(button.dataset.cost);
    const cost = gameState.getAllotmentBundleCost(amount, baseCost);
    button.disabled =
      !inShop ||
      !gameState.runActive ||
      gameState.credits < cost ||
      gameState.allotmentCurrent >= gameState.allotmentMax;
    const bundle = SHOP_BUNDLES.find(
      (item) => item.amount === amount && item.cost === baseCost,
    );
    if (bundle) {
      const costLabel = button.querySelector("em");
      if (costLabel) {
        costLabel.textContent = `${cost} bug bounty credits`;
      }
      button.setAttribute(
        "aria-label",
        `${bundle.label}: buy ${amount} Compute Credits for ${cost} bug bounty credits`,
      );
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
      runSummaryReason.textContent =
        summary.endReason === "manual" ? "Manual Archive" : "Run Insolvent";
      runSummaryNote.textContent =
        summary.endReason === "manual"
          ? "The contract was closed by choice. A new run starts from the base procurement loadout."
          : "Integrity failed without enough Compute Credits to fund repair. The contract is over.";
      runSummaryRounds.textContent = summary.roundsFinished.toString();
      runSummaryKills.textContent = summary.kills.toString();
      runSummaryTuners.textContent = summary.quantumTunersUsed.toString();
      runSummaryEnhancements.textContent = "Starter Deck prototype";
    }
  }

  appShell?.setAttribute("data-scene", gameState.sceneMode);
  gameRoot?.setAttribute("data-scene", gameState.sceneMode);
  if (inShop) {
    if (arenaNoticeFadeTimeout !== undefined) {
      window.clearTimeout(arenaNoticeFadeTimeout);
      arenaNoticeFadeTimeout = undefined;
    }
    gameRoot?.classList.remove("notice-active");
  } else if (noticeChanged || lastNoticeScene !== gameState.sceneMode) {
    showArenaNoticeBriefly();
  }
  lastNoticeScene = gameState.sceneMode;
  setShopModalOpen(shopModalOpen);
  setWorkshopModalOpen(workshopModalOpen);
  pauseMenu?.classList.toggle("shop-paused", inShop);
  setSplashVisible(splashVisible);
}

shopButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.amount);
    const baseCost = Number(button.dataset.cost);
    gameState.buyAllotment(amount, baseCost);
  });
});

healButton?.addEventListener("click", () => {
  gameState.repairIntegrity();
});

quantumTunerButton?.addEventListener("click", () => {
  gameState.buyQuantumTuner();
});

shopOpenButton?.addEventListener("click", () => {
  openMarket();
});

workshopOpenButton?.addEventListener("click", () => {
  openWorkshop();
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

deployButton?.addEventListener("click", tryDeployToArena);

deckResetButton?.addEventListener("click", () => {
  if (
    gameState.hasDraftDeckEdits() &&
    !window.confirm("Reset Draft Deck to 15 Slash and 5 Bolt? Current edits will be discarded.")
  ) {
    return;
  }

  gameState.resetDraftDeckToStarter();
});

startNewRunButton?.addEventListener("click", () => {
  setShopModalOpen(false);
  setWorkshopModalOpen(false);
  setPauseMenuOpen(false);
  setSplashVisible(false);
  gameState.startNewRun();
  game.scene.start(SCENES.shop);
});

splashContinueButton?.addEventListener("click", () => {
  setSplashVisible(false);
});

pauseButton?.addEventListener("click", () => {
  togglePauseMenu();
});

resumeButton?.addEventListener("click", () => {
  setPauseMenuOpen(false);
});

splashReturnButton?.addEventListener("click", () => {
  if (gameState.sceneMode !== "shop") {
    return;
  }

  setSplashVisible(true);
});

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented) {
    return;
  }

  const target = event.target as HTMLElement | null;
  if (
    target?.closest("input, textarea, select, button") &&
    event.key !== "Escape"
  ) {
    return;
  }

  if (event.key === "Escape") {
    event.preventDefault();
    togglePauseMenu();
    return;
  }

  if (gameState.sceneMode === "arena" && event.key.toLowerCase() === "p") {
    event.preventDefault();
    togglePauseMenu();
  }
});

window.addEventListener("qf:shop-action", (event) => {
  const action = (event as CustomEvent<{ action?: string }>).detail?.action;
  if (action === "deploy" || action === "market" || action === "workshop") {
    handleShopSceneAction(action);
  }
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
