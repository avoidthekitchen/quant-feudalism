import type { ArenaSnapshot } from "./quantum-tuner";

import { getScaledShopBundleCost, SHOP_BUNDLES } from "./constants.ts";

export type SceneMode = "shop" | "arena";
export type ArenaOutcome = "retreated" | "cleared" | "decommissioned";
export type RunEndReason = "manual" | "bankrupt";

export interface ArenaReport {
  status: ArenaOutcome;
  kills: number;
  creditsEarned: number;
  allotmentSpent: number;
  arenaTimeMs: number;
  note: string;
}

export interface ArenaRunStateSnapshot {
  computeCurrent: number;
  allotmentCurrent: number;
  integrityCurrent: number;
  kills: number;
  extractionReady?: boolean;
  notice: string;
  arenaPrompt: string;
  computeRegenDelayRemainingMs: number;
}

export interface RunSummary {
  runId: number;
  endReason: RunEndReason;
  roundsFinished: number;
  kills: number;
  totalArenaTimeMs?: number;
  quantumTunersUsed: number;
  computeRateLimitUpgradesGained: number;
  endedAtRunId: number;
}

export interface RunHistoryEntry extends RunSummary {}

export interface ScoreboardEntry {
  runId: number;
  roundsFinished: number;
  kills: number;
  totalArenaTimeMs?: number;
  active: boolean;
  endReason?: RunEndReason;
}

export interface SavedArenaResume {
  timelineTimeMs: number;
  arenaElapsedTimeMs?: number;
  snapshot: ArenaSnapshot;
}

export interface PersistedGameState {
  version: number;
  runId: number;
  nextRunId: number;
  runActive: boolean;
  sceneMode: SceneMode;
  credits: number;
  computeMax: number;
  computeCurrent: number;
  allotmentCurrent: number;
  integrityCurrent: number;
  kills: number;
  runKills: number;
  roundsFinished: number;
  totalArenaTimeMs?: number;
  computeRateLimitUpgrades: number;
  quantumTuners: number;
  quantumTunersUsedThisRun: number;
  computeRateLimitUpgradesThisRun: number;
  extractionReady: boolean;
  notice: string;
  arenaPrompt: string;
  report: ArenaReport;
  hudTimelineVersion: number;
  latestRunSummary: RunSummary | null;
  runHistory: RunHistoryEntry[];
  arenaEntryAllotment: number;
  computeRegenDelayRemainingMs: number;
  savedArenaResume: SavedArenaResume | null;
}

const PERSISTENCE_VERSION = 1;
const STORAGE_KEY = "quant-feudalism-state-v1";

export class RunState extends EventTarget {
  readonly baseComputeMax = 96;
  readonly allotmentMax = 2800;
  readonly integrityMax = 100;
  readonly computeRegenPerSecond = 13;
  readonly computeRegenDelayMs = 720;
  readonly meleeCost = 18;
  readonly rangedCost = 40;
  readonly dashCost = 24;
  readonly healAmount = 25;
  readonly healCost = 180;
  readonly computeRateLimitUpgradeAmount = 16;
  readonly quantumTunerCap = 3;
  readonly quantumTunerCost = 250;
  readonly startingCredits = 30;
  readonly startingAllotment = 1360;
  readonly startingQuantumTuners = 1;
  readonly defaultNotice =
    "Procurement chamber online. Buy Compute Credits or deploy into the arena.";

  runId = 1;
  nextRunId = 2;
  runActive = true;
  sceneMode: SceneMode = "shop";
  credits = this.startingCredits;
  computeMax = this.baseComputeMax;
  computeCurrent = this.computeMax;
  allotmentCurrent = this.startingAllotment;
  integrityCurrent = this.integrityMax;
  kills = 0;
  runKills = 0;
  roundsFinished = 0;
  totalArenaTimeMs = 0;
  computeRateLimitUpgrades = 0;
  quantumTuners = this.startingQuantumTuners;
  quantumTunersUsedThisRun = 0;
  computeRateLimitUpgradesThisRun = 0;
  extractionReady = false;
  notice = this.defaultNotice;
  arenaPrompt = "";
  report: ArenaReport = {
    status: "retreated",
    kills: 0,
    creditsEarned: 0,
    allotmentSpent: 0,
    arenaTimeMs: 0,
    note: "No arena deployment recorded yet.",
  };
  hudTimelineVersion = 0;
  latestRunSummary: RunSummary | null = null;
  runHistory: RunHistoryEntry[] = [];

  private arenaEntryAllotment = this.allotmentCurrent;
  private computeRegenDelayRemainingMs = 0;
  private savedArenaResume: SavedArenaResume | null = null;

  emitChange(): void {
    this.dispatchEvent(new CustomEvent("statechange"));
  }

  setNotice(message: string): void {
    this.notice = message;
    this.emitChange();
  }

  setArenaPrompt(message: string): void {
    if (this.arenaPrompt === message) {
      return;
    }

    this.arenaPrompt = message;
    this.emitChange();
  }

  setExtractionReady(ready: boolean, options: { emitChange?: boolean } = {}): void {
    if (this.extractionReady === ready) {
      return;
    }

    this.extractionReady = ready;
    if (options.emitChange ?? true) {
      this.emitChange();
    }
  }

  startNewRun(options: { emitChange?: boolean } = {}): void {
    const { emitChange = true } = options;
    const nextRunId = this.nextRunId;
    this.nextRunId += 1;
    this.applyFreshRunDefaults(nextRunId, { bumpTimeline: true });
    if (emitChange) {
      this.emitChange();
    }
  }

  endRun(reason: RunEndReason, note?: string): RunSummary | null {
    if (!this.runActive) {
      return this.latestRunSummary;
    }

    const summary: RunSummary = {
      runId: this.runId,
      endReason: reason,
      roundsFinished: this.roundsFinished,
      kills: this.getCurrentRunKills(),
      totalArenaTimeMs: this.getCurrentRunTotalArenaTimeMs(),
      quantumTunersUsed: this.quantumTunersUsedThisRun,
      computeRateLimitUpgradesGained: this.computeRateLimitUpgradesThisRun,
      endedAtRunId: this.runId,
    };

    this.runHistory = [...this.runHistory, summary];
    this.latestRunSummary = summary;
    this.runActive = false;
    this.sceneMode = "shop";
    this.savedArenaResume = null;
    this.arenaPrompt = "";
    this.extractionReady = false;
    this.kills = 0;
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.computeRegenDelayRemainingMs = 0;
    this.notice =
      note ??
      (reason === "manual"
        ? "Run archived by operator choice. Start a new contract to re-enter the arena."
        : "Run insolvent. Integrity cannot be repaired. Start a new contract.");
    this.hudTimelineVersion += 1;
    this.emitChange();
    return summary;
  }

  maybeEndRunForBankruptcy(): RunSummary | null {
    if (!this.runActive || this.sceneMode !== "shop") {
      return null;
    }

    if (this.integrityCurrent > 0 || this.allotmentCurrent >= this.healCost) {
      return null;
    }

    return this.endRun(
      "bankrupt",
      "Integrity collapse sealed the run. No repair contract can be funded.",
    );
  }

  buyAllotment(amount: number, cost: number): boolean {
    if (!this.canUseShopActions()) {
      return false;
    }

    const scaledCost = this.getAllotmentBundleCost(amount, cost);

    if (this.credits < scaledCost) {
      this.notice = "Bug bounty credit authorization denied. Clear more bugs or buy cheaper Compute Credits.";
      this.emitChange();
      return false;
    }

    if (this.allotmentCurrent >= this.allotmentMax) {
      this.notice = "Compute Credit reserve already full. The corporations will not sell excess.";
      this.emitChange();
      return false;
    }

    this.credits -= scaledCost;
    this.allotmentCurrent = Math.min(this.allotmentMax, this.allotmentCurrent + amount);
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.notice = `Procured ${amount} Compute Credits for ${scaledCost} bug bounty credits.`;
    this.emitChange();
    return true;
  }

  getAllotmentBundleCost(amount: number, baseCost: number): number {
    const bundle = SHOP_BUNDLES.find((item) => item.amount === amount && item.cost === baseCost);
    return getScaledShopBundleCost(bundle?.cost ?? baseCost, this.roundsFinished);
  }

  buyQuantumTuner(): boolean {
    if (!this.canUseShopActions()) {
      return false;
    }

    if (this.quantumTuners >= this.quantumTunerCap) {
      this.notice = "Quantum Tuner rack already full. Collapse capacity capped at 3 charges.";
      this.emitChange();
      return false;
    }

    if (this.allotmentCurrent < this.quantumTunerCost) {
      this.notice = `Quantum Tuner denied. ${this.quantumTunerCost} Compute Credits required.`;
      this.emitChange();
      return false;
    }

    this.quantumTuners += 1;
    this.allotmentCurrent -= this.quantumTunerCost;
    this.clampComputeToCurrentAllotment();
    this.notice = `Quantum Tuner fabricated. ${this.quantumTuners}/${this.quantumTunerCap} charge(s) banked.`;
    this.emitChange();
    return true;
  }

  consumeQuantumTuner(): boolean {
    if (this.quantumTuners <= 0) {
      return false;
    }

    this.quantumTuners -= 1;
    this.quantumTunersUsedThisRun += 1;
    return true;
  }

  repairIntegrity(): boolean {
    if (!this.canUseShopActions()) {
      return false;
    }

    if (this.integrityCurrent >= this.integrityMax) {
      this.notice = "Integrity already restored. No repair contract issued.";
      this.emitChange();
      return false;
    }

    if (this.allotmentCurrent < this.healCost) {
      this.notice = `Repair denied. ${this.healCost} Compute Credits required.`;
      this.emitChange();
      return false;
    }

    this.allotmentCurrent -= this.healCost;
    this.integrityCurrent = Math.min(this.integrityMax, this.integrityCurrent + this.healAmount);
    this.clampComputeToCurrentAllotment();
    this.notice = `Integrity restored by ${this.healAmount} for ${this.healCost} Compute Credits.`;
    this.emitChange();
    return true;
  }

  getComputeRateLimitUpgradeCost(): number {
    return 42 + this.computeRateLimitUpgrades * 28;
  }

  upgradeComputeRateLimit(): boolean {
    if (!this.canUseShopActions()) {
      return false;
    }

    const cost = this.getComputeRateLimitUpgradeCost();
    if (this.credits < cost) {
      this.notice = `Compute Rate Limit upgrade denied. ${cost} bug bounty credits required.`;
      this.emitChange();
      return false;
    }

    this.credits -= cost;
    this.computeRateLimitUpgrades += 1;
    this.computeRateLimitUpgradesThisRun += 1;
    this.computeMax += this.computeRateLimitUpgradeAmount;
    this.computeCurrent = Math.min(
      this.computeMax,
      this.computeCurrent + this.computeRateLimitUpgradeAmount,
    );
    this.notice = `Compute Rate Limit increased to ${this.computeMax}.`;
    this.emitChange();
    return true;
  }

  beginArena(): void {
    if (!this.runActive || this.sceneMode !== "shop") {
      return;
    }

    this.sceneMode = "arena";
    this.savedArenaResume = null;
    this.kills = 0;
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.arenaEntryAllotment = this.allotmentCurrent;
    this.computeRegenDelayRemainingMs = 0;
    this.extractionReady = false;
    this.arenaPrompt = "";
    this.notice = "Deployment accepted. Exit through the northern gate before your Compute Credits collapse.";
    this.emitChange();
  }

  restoreForShop(note?: string): void {
    this.sceneMode = "shop";
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.computeRegenDelayRemainingMs = 0;
    this.extractionReady = false;
    this.arenaPrompt = "";
    this.kills = 0;
    this.savedArenaResume = null;
    if (note) {
      this.notice = note;
    }
    this.emitChange();
  }

  canUseAbility(amount: number): boolean {
    return this.computeCurrent >= amount && this.allotmentCurrent >= amount;
  }

  spend(amount: number): boolean {
    if (!this.canUseAbility(amount)) {
      return false;
    }

    this.computeCurrent = Math.max(0, this.computeCurrent - amount);
    this.allotmentCurrent = Math.max(0, this.allotmentCurrent - amount);
    this.computeRegenDelayRemainingMs = this.computeRegenDelayMs;
    this.emitChange();
    return true;
  }

  refundAllotment(amount: number): number {
    const safeAmount = Math.max(0, Math.floor(amount));
    if (safeAmount <= 0 || this.allotmentCurrent >= this.allotmentMax) {
      return 0;
    }

    const refunded = Math.min(safeAmount, this.allotmentMax - this.allotmentCurrent);
    this.allotmentCurrent += refunded;
    this.emitChange();
    return refunded;
  }

  regenerate(deltaMs: number): void {
    if (this.sceneMode !== "arena") {
      return;
    }

    let regenDeltaMs = deltaMs;
    if (this.computeRegenDelayRemainingMs > 0) {
      const consumedDelay = Math.min(this.computeRegenDelayRemainingMs, deltaMs);
      this.computeRegenDelayRemainingMs -= consumedDelay;
      regenDeltaMs -= consumedDelay;

      if (this.computeRegenDelayRemainingMs > 0) {
        return;
      }
    }

    if (regenDeltaMs <= 0) {
      return;
    }

    const target = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    if (this.computeCurrent >= target) {
      return;
    }

    this.computeCurrent = Math.min(
      target,
      this.computeCurrent + (this.computeRegenPerSecond * regenDeltaMs) / 1000,
    );
    this.emitChange();
  }

  applyDamage(amount: number): boolean {
    this.integrityCurrent = Math.max(0, this.integrityCurrent - amount);
    this.emitChange();
    return this.integrityCurrent <= 0;
  }

  registerKill(): void {
    this.kills += 1;
    this.emitChange();
  }

  finishArena(status: ArenaOutcome, note: string, arenaTimeMs = 0): ArenaReport {
    if (status === "cleared") {
      this.roundsFinished += 1;
    }

    const arenaKills = this.kills;
    this.runKills += arenaKills;
    const safeArenaTimeMs = Math.max(0, arenaTimeMs);
    this.totalArenaTimeMs += safeArenaTimeMs;

    const creditsEarned =
      status === "cleared"
        ? arenaKills * 12 + 36
        : status === "retreated"
          ? arenaKills * 8
          : 0;
    const allotmentSpent = Math.max(0, this.arenaEntryAllotment - this.allotmentCurrent);

    this.credits += creditsEarned;
    this.report = {
      status,
      kills: arenaKills,
      creditsEarned,
      allotmentSpent,
      arenaTimeMs: safeArenaTimeMs,
      note,
    };

    const shopNote =
      status === "cleared"
        ? `${note} Compute Credit refill prices increased by 7.5%.`
        : note;
    this.restoreForShop(shopNote);
    this.maybeEndRunForBankruptcy();
    return this.report;
  }

  createArenaSnapshot(): ArenaRunStateSnapshot {
    return {
      computeCurrent: this.computeCurrent,
      allotmentCurrent: this.allotmentCurrent,
      integrityCurrent: this.integrityCurrent,
      kills: this.kills,
      extractionReady: this.extractionReady,
      notice: this.notice,
      arenaPrompt: this.arenaPrompt,
      computeRegenDelayRemainingMs: this.computeRegenDelayRemainingMs,
    };
  }

  restoreArenaSnapshot(
    snapshot: ArenaRunStateSnapshot,
    options: {
      emitChange?: boolean;
      bumpTimelineVersion?: boolean;
    } = {},
  ): void {
    const { emitChange = true, bumpTimelineVersion = emitChange } = options;
    this.computeCurrent = Math.max(0, snapshot.computeCurrent);
    this.allotmentCurrent = Math.max(0, snapshot.allotmentCurrent);
    this.integrityCurrent = snapshot.integrityCurrent;
    this.kills = snapshot.kills;
    this.extractionReady = snapshot.extractionReady ?? false;
    this.notice = snapshot.notice;
    this.arenaPrompt = snapshot.arenaPrompt;
    this.computeRegenDelayRemainingMs = snapshot.computeRegenDelayRemainingMs;
    if (bumpTimelineVersion) {
      this.hudTimelineVersion += 1;
    }
    if (emitChange) {
      this.emitChange();
    }
  }

  getCurrentRunKills(): number {
    return this.runKills + (this.sceneMode === "arena" ? this.kills : 0);
  }

  private getCurrentRunTotalArenaTimeMs(): number {
    const activeArenaTimeMs =
      this.savedArenaResume?.arenaElapsedTimeMs ?? this.savedArenaResume?.timelineTimeMs ?? 0;
    return this.totalArenaTimeMs + (this.sceneMode === "arena" ? activeArenaTimeMs : 0);
  }

  private compareScoreboardEntries(left: ScoreboardEntry, right: ScoreboardEntry): number {
    if (right.roundsFinished !== left.roundsFinished) {
      return right.roundsFinished - left.roundsFinished;
    }
    if (right.kills !== left.kills) {
      return right.kills - left.kills;
    }
    const leftTimeMs = left.totalArenaTimeMs ?? 0;
    const rightTimeMs = right.totalArenaTimeMs ?? 0;
    if (leftTimeMs !== rightTimeMs) {
      return leftTimeMs - rightTimeMs;
    }
    return right.runId - left.runId;
  }

  getTopRuns(limit = 3): ScoreboardEntry[] {
    const archived: ScoreboardEntry[] = this.runHistory
      .map((entry) => ({
        runId: entry.runId,
        roundsFinished: entry.roundsFinished,
        kills: entry.kills,
        totalArenaTimeMs: entry.totalArenaTimeMs ?? 0,
        active: false,
        endReason: entry.endReason,
      }))
      .sort((left, right) => this.compareScoreboardEntries(left, right));

    if (!this.runActive) {
      return archived.slice(0, limit);
    }

    const activeEntry: ScoreboardEntry = {
      runId: this.runId,
      roundsFinished: this.roundsFinished,
      kills: this.getCurrentRunKills(),
      totalArenaTimeMs: this.getCurrentRunTotalArenaTimeMs(),
      active: true,
    };

    const ranked = [...archived, activeEntry].sort((left, right) =>
      this.compareScoreboardEntries(left, right),
    );
    const topEntries = ranked.slice(0, limit);
    if (topEntries.some((entry) => entry.active)) {
      return topEntries;
    }

    return [...ranked.slice(0, Math.max(0, limit - 1)), activeEntry].sort((left, right) =>
      this.compareScoreboardEntries(left, right),
    );
  }

  getSavedArenaResume(): SavedArenaResume | null {
    return this.savedArenaResume ? structuredClone(this.savedArenaResume) : null;
  }

  saveArenaResume(resume: SavedArenaResume): void {
    this.savedArenaResume = structuredClone(resume);
  }

  clearArenaResume(): void {
    this.savedArenaResume = null;
  }

  serialize(): PersistedGameState {
    return {
      version: PERSISTENCE_VERSION,
      runId: this.runId,
      nextRunId: this.nextRunId,
      runActive: this.runActive,
      sceneMode: this.sceneMode,
      credits: this.credits,
      computeMax: this.computeMax,
      computeCurrent: this.computeCurrent,
      allotmentCurrent: this.allotmentCurrent,
      integrityCurrent: this.integrityCurrent,
      kills: this.kills,
      runKills: this.runKills,
      roundsFinished: this.roundsFinished,
      totalArenaTimeMs: this.totalArenaTimeMs,
      computeRateLimitUpgrades: this.computeRateLimitUpgrades,
      quantumTuners: this.quantumTuners,
      quantumTunersUsedThisRun: this.quantumTunersUsedThisRun,
      computeRateLimitUpgradesThisRun: this.computeRateLimitUpgradesThisRun,
      extractionReady: this.extractionReady,
      notice: this.notice,
      arenaPrompt: this.arenaPrompt,
      report: structuredClone(this.report),
      hudTimelineVersion: this.hudTimelineVersion,
      latestRunSummary: this.latestRunSummary ? structuredClone(this.latestRunSummary) : null,
      runHistory: structuredClone(this.runHistory),
      arenaEntryAllotment: this.arenaEntryAllotment,
      computeRegenDelayRemainingMs: this.computeRegenDelayRemainingMs,
      savedArenaResume: this.savedArenaResume ? structuredClone(this.savedArenaResume) : null,
    };
  }

  hydrate(raw: unknown, options: { emitChange?: boolean } = {}): void {
    const { emitChange = false } = options;

    if (!isPersistedGameState(raw)) {
      this.resetToFreshProfile({ emitChange });
      return;
    }

    this.runId = raw.runId;
    this.nextRunId = raw.nextRunId;
    this.runActive = raw.runActive;
    this.sceneMode = raw.sceneMode;
    this.credits = raw.credits;
    this.computeMax = raw.computeMax;
    this.computeCurrent = Math.max(0, raw.computeCurrent);
    this.allotmentCurrent = Math.max(0, raw.allotmentCurrent);
    this.integrityCurrent = raw.integrityCurrent;
    this.kills = raw.kills;
    this.runKills = raw.runKills;
    this.roundsFinished = raw.roundsFinished;
    this.totalArenaTimeMs = raw.totalArenaTimeMs ?? 0;
    this.computeRateLimitUpgrades = raw.computeRateLimitUpgrades;
    this.quantumTuners = raw.quantumTuners;
    this.quantumTunersUsedThisRun = raw.quantumTunersUsedThisRun;
    this.computeRateLimitUpgradesThisRun = raw.computeRateLimitUpgradesThisRun;
    this.extractionReady = raw.extractionReady ?? false;
    this.notice = raw.notice;
    this.arenaPrompt = raw.arenaPrompt;
    this.report = structuredClone(raw.report);
    this.hudTimelineVersion = raw.hudTimelineVersion;
    this.latestRunSummary = raw.latestRunSummary ? structuredClone(raw.latestRunSummary) : null;
    this.runHistory = structuredClone(raw.runHistory);
    this.arenaEntryAllotment = raw.arenaEntryAllotment;
    this.computeRegenDelayRemainingMs = raw.computeRegenDelayRemainingMs;
    this.savedArenaResume = isSavedArenaResume(raw.savedArenaResume)
      ? structuredClone(raw.savedArenaResume)
      : null;

    if (this.sceneMode === "arena") {
      if (this.savedArenaResume) {
        this.restoreArenaSnapshot(this.savedArenaResume.snapshot.runState, {
          emitChange: false,
          bumpTimelineVersion: false,
        });
      } else {
        this.sceneMode = "shop";
        this.kills = 0;
        this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
        this.computeRegenDelayRemainingMs = 0;
        this.arenaPrompt = "";
        this.extractionReady = false;
        this.notice =
          "Session interrupted during deployment. Returned to procurement chamber with spent resources preserved.";
      }
    }

    if (this.sceneMode === "shop") {
      this.maybeEndRunForBankruptcy();
    }

    if (emitChange) {
      this.emitChange();
    }
  }

  hydrateFromStorage(options: { emitChange?: boolean } = {}): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    const serialized = storage.getItem(STORAGE_KEY);
    if (!serialized) {
      return;
    }

    try {
      this.hydrate(JSON.parse(serialized), options);
    } catch {
      this.resetToFreshProfile(options);
    }
  }

  persistToStorage(): void {
    const storage = getStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(this.serialize()));
    } catch {
      // Storage unavailable or full — gameplay continues without persistence.
    }
  }

  getComputeRatio(): number {
    return Math.max(0, Math.min(1, this.computeCurrent / this.computeMax));
  }

  getAllotmentRatio(): number {
    return Math.max(
      0,
      Math.min(1, this.allotmentCurrent / this.allotmentMax),
    );
  }

  getThrottleSeverity(): number {
    if (this.allotmentCurrent <= 0) {
      return 0.72;
    }

    const lowCreditRatio = Math.min(1, this.allotmentCurrent / (this.allotmentMax * 0.12));
    return Math.max(0, 1 - lowCreditRatio) * 0.5;
  }

  getMovementMultiplier(): number {
    return Math.max(0.48, 1 - this.getThrottleSeverity() * 0.44);
  }

  getVisionBlurStrength(): number {
    return Math.min(1.15, this.getThrottleSeverity() * 0.95);
  }

  getThrottleLabel(): string {
    if (this.allotmentCurrent <= 0) {
      return "Seized";
    }

    if (this.getThrottleSeverity() > 0) {
      return "Constrained";
    }

    return "Nominal";
  }

  private resetToFreshProfile(options: { emitChange?: boolean } = {}): void {
    const { emitChange = false } = options;
    this.nextRunId = 2;
    this.latestRunSummary = null;
    this.runHistory = [];
    this.applyFreshRunDefaults(1, { bumpTimeline: false });
    this.hudTimelineVersion = 0;
    if (emitChange) {
      this.emitChange();
    }
  }

  private applyFreshRunDefaults(runId: number, options: { bumpTimeline: boolean }): void {
    if (options.bumpTimeline) {
      this.hudTimelineVersion += 1;
    }

    this.runId = runId;
    this.runActive = true;
    this.sceneMode = "shop";
    this.credits = this.startingCredits;
    this.computeMax = this.baseComputeMax;
    this.computeCurrent = this.computeMax;
    this.allotmentCurrent = this.startingAllotment;
    this.integrityCurrent = this.integrityMax;
    this.kills = 0;
    this.runKills = 0;
    this.roundsFinished = 0;
    this.totalArenaTimeMs = 0;
    this.computeRateLimitUpgrades = 0;
    this.quantumTuners = this.startingQuantumTuners;
    this.quantumTunersUsedThisRun = 0;
    this.computeRateLimitUpgradesThisRun = 0;
    this.extractionReady = false;
    this.notice = this.defaultNotice;
    this.arenaPrompt = "";
    this.report = {
      status: "retreated",
      kills: 0,
      creditsEarned: 0,
      allotmentSpent: 0,
      arenaTimeMs: 0,
      note: "No arena deployment recorded yet.",
    };
    this.arenaEntryAllotment = this.allotmentCurrent;
    this.computeRegenDelayRemainingMs = 0;
    this.savedArenaResume = null;
  }

  private canUseShopActions(): boolean {
    return this.runActive && this.sceneMode === "shop";
  }

  private clampComputeToCurrentAllotment(): void {
    this.computeCurrent = Math.min(this.computeCurrent, Math.max(0, this.allotmentCurrent));
  }
}

export const gameState = new RunState();

function getStorage(): Storage | null {
  try {
    return typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isSnapshotVector(value: unknown): value is { x: number; y: number } {
  return isRecord(value) && isFiniteNumber(value.x) && isFiniteNumber(value.y);
}

function isArenaReport(value: unknown): value is ArenaReport {
  return (
    isRecord(value) &&
    (value.status === "retreated" || value.status === "cleared" || value.status === "decommissioned") &&
    isFiniteNumber(value.kills) &&
    isFiniteNumber(value.creditsEarned) &&
    isFiniteNumber(value.allotmentSpent) &&
    (value.arenaTimeMs === undefined || isFiniteNumber(value.arenaTimeMs)) &&
    typeof value.note === "string"
  );
}

function isRunSummary(value: unknown): value is RunSummary {
  return (
    isRecord(value) &&
    isFiniteNumber(value.runId) &&
    (value.endReason === "manual" || value.endReason === "bankrupt") &&
    isFiniteNumber(value.roundsFinished) &&
    isFiniteNumber(value.kills) &&
    (value.totalArenaTimeMs === undefined || isFiniteNumber(value.totalArenaTimeMs)) &&
    isFiniteNumber(value.quantumTunersUsed) &&
    isFiniteNumber(value.computeRateLimitUpgradesGained) &&
    isFiniteNumber(value.endedAtRunId)
  );
}

function isArenaRunStateSnapshot(value: unknown): value is ArenaRunStateSnapshot {
  return (
    isRecord(value) &&
    isFiniteNumber(value.computeCurrent) &&
    isFiniteNumber(value.allotmentCurrent) &&
    isFiniteNumber(value.integrityCurrent) &&
    isFiniteNumber(value.kills) &&
    (typeof value.extractionReady === "boolean" || value.extractionReady === undefined) &&
    typeof value.notice === "string" &&
    typeof value.arenaPrompt === "string" &&
    isFiniteNumber(value.computeRegenDelayRemainingMs)
  );
}

function isSnapshotCooldowns(value: unknown): value is {
  dash: number;
  melee: number;
  ranged: number;
} {
  return (
    isRecord(value) &&
    isFiniteNumber(value.dash) &&
    isFiniteNumber(value.melee) &&
    isFiniteNumber(value.ranged)
  );
}

function isSnapshotCacheFlags(value: unknown): value is {
  dash: boolean;
  melee: boolean;
  ranged: boolean;
} {
  return (
    isRecord(value) &&
    typeof value.dash === "boolean" &&
    typeof value.melee === "boolean" &&
    typeof value.ranged === "boolean"
  );
}

function isSpriteDirection(value: unknown): boolean {
  return (
    value === "n" ||
    value === "ne" ||
    value === "e" ||
    value === "se" ||
    value === "s" ||
    value === "sw" ||
    value === "w" ||
    value === "nw"
  );
}

function isPlayerArenaSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSnapshotVector(value.position) &&
    isSnapshotVector(value.velocity) &&
    isSnapshotVector(value.dashDirection) &&
    isSpriteDirection(value.facing) &&
    isFiniteNumber(value.angle) &&
    isFiniteNumber(value.dashTimer) &&
    isFiniteNumber(value.dashInvulnerabilityTimer) &&
    isFiniteNumber(value.rangedMovementPauseTimer) &&
    isFiniteNumber(value.playerAttackTimer) &&
    isSnapshotCooldowns(value.cooldowns) &&
    isSnapshotCacheFlags(value.cacheDiscountBlocked)
  );
}

function isEnemyArenaSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.id) &&
    typeof value.alive === "boolean" &&
    isFiniteNumber(value.hp) &&
    isSnapshotVector(value.position) &&
    isSnapshotVector(value.velocity) &&
    isSnapshotVector(value.lungeDirection) &&
    isFiniteNumber(value.touchCooldown) &&
    isFiniteNumber(value.attackTimer) &&
    isFiniteNumber(value.stunTimer) &&
    isFiniteNumber(value.lungeCooldown) &&
    isFiniteNumber(value.lungeWindupTimer) &&
    isFiniteNumber(value.lungeTimer) &&
    isFiniteNumber(value.orbitSeed)
  );
}

function isProjectileArenaSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSnapshotVector(value.position) &&
    isSnapshotVector(value.velocity) &&
    isFiniteNumber(value.ttl) &&
    isFiniteNumber(value.rotation)
  );
}

function isAttackCard(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    (value.type === "melee" || value.type === "ranged")
  );
}

function isAttackQueues(value: unknown): boolean {
  return (
    isRecord(value) &&
    Array.isArray(value.melee) &&
    value.melee.every(isAttackCard) &&
    Array.isArray(value.ranged) &&
    value.ranged.every(isAttackCard)
  );
}

function isComputeCycleSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.phase === "active" || value.phase === "preparing") &&
    Array.isArray(value.drawPile) &&
    value.drawPile.every(isAttackCard) &&
    Array.isArray(value.discardPile) &&
    value.discardPile.every(isAttackCard) &&
    isAttackQueues(value.queues) &&
    isFiniteNumber(value.queueLimit) &&
    isFiniteNumber(value.preparingRemainingMs) &&
    isFiniteNumber(value.computeRefill) &&
    isFiniteNumber(value.seed)
  );
}

function isArenaSnapshotRecord(value: unknown): value is ArenaSnapshot {
  return (
    isRecord(value) &&
    isArenaRunStateSnapshot(value.runState) &&
    isComputeCycleSnapshot(value.computeCycle) &&
    isPlayerArenaSnapshot(value.player) &&
    typeof value.arenaCleared === "boolean" &&
    Array.isArray(value.projectiles) &&
    value.projectiles.every(isProjectileArenaSnapshot) &&
    Array.isArray(value.enemies) &&
    value.enemies.every(isEnemyArenaSnapshot)
  );
}

function isSavedArenaResume(value: unknown): value is SavedArenaResume {
  return (
    isRecord(value) &&
    isFiniteNumber(value.timelineTimeMs) &&
    (value.arenaElapsedTimeMs === undefined || isFiniteNumber(value.arenaElapsedTimeMs)) &&
    isArenaSnapshotRecord(value.snapshot)
  );
}

function isPersistedGameState(value: unknown): value is PersistedGameState {
  return (
    isRecord(value) &&
    value.version === PERSISTENCE_VERSION &&
    isFiniteNumber(value.runId) &&
    isFiniteNumber(value.nextRunId) &&
    typeof value.runActive === "boolean" &&
    (value.sceneMode === "shop" || value.sceneMode === "arena") &&
    isFiniteNumber(value.credits) &&
    isFiniteNumber(value.computeMax) &&
    isFiniteNumber(value.computeCurrent) &&
    isFiniteNumber(value.allotmentCurrent) &&
    isFiniteNumber(value.integrityCurrent) &&
    isFiniteNumber(value.kills) &&
    isFiniteNumber(value.runKills) &&
    isFiniteNumber(value.roundsFinished) &&
    (value.totalArenaTimeMs === undefined || isFiniteNumber(value.totalArenaTimeMs)) &&
    isFiniteNumber(value.computeRateLimitUpgrades) &&
    isFiniteNumber(value.quantumTuners) &&
    isFiniteNumber(value.quantumTunersUsedThisRun) &&
    isFiniteNumber(value.computeRateLimitUpgradesThisRun) &&
    (typeof value.extractionReady === "boolean" || value.extractionReady === undefined) &&
    typeof value.notice === "string" &&
    typeof value.arenaPrompt === "string" &&
    isArenaReport(value.report) &&
    typeof value.hudTimelineVersion === "number" &&
    (value.latestRunSummary === null || isRunSummary(value.latestRunSummary)) &&
    Array.isArray(value.runHistory) &&
    value.runHistory.every(isRunSummary) &&
    isFiniteNumber(value.arenaEntryAllotment) &&
    isFiniteNumber(value.computeRegenDelayRemainingMs) &&
    (value.savedArenaResume === null || value.savedArenaResume === undefined || isRecord(value.savedArenaResume))
  );
}
