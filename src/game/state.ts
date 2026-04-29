export type SceneMode = "shop" | "arena";
export type ArenaOutcome = "retreated" | "cleared" | "decommissioned";

export interface ArenaReport {
  status: ArenaOutcome;
  kills: number;
  creditsEarned: number;
  allotmentSpent: number;
  note: string;
}

export interface ArenaRunStateSnapshot {
  computeCurrent: number;
  allotmentCurrent: number;
  integrityCurrent: number;
  kills: number;
  notice: string;
  arenaPrompt: string;
  computeRegenDelayRemainingMs: number;
}

export class RunState extends EventTarget {
  readonly baseComputeMax = 96;
  readonly computeOverdrawCap = 64;
  readonly allotmentMax = 2800;
  readonly allotmentOverdrawCap = 560;
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

  credits = 92;
  computeMax = this.baseComputeMax;
  computeCurrent = this.computeMax;
  allotmentCurrent = 1640;
  integrityCurrent = this.integrityMax;
  kills = 0;
  roundsFinished = 0;
  computeRateLimitUpgrades = 0;
  quantumTuners = 1;
  sceneMode: SceneMode = "shop";
  notice =
    "Procurement chamber online. Buy Compute Credits or deploy into the arena.";
  arenaPrompt = "";
  report: ArenaReport = {
    status: "retreated",
    kills: 0,
    creditsEarned: 0,
    allotmentSpent: 0,
    note: "No arena run recorded yet.",
  };
  hudTimelineVersion = 0;

  private arenaEntryAllotment = this.allotmentCurrent;
  private computeRegenDelayRemainingMs = 0;

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

  buyAllotment(amount: number, cost: number): boolean {
    if (this.sceneMode !== "shop") {
      return false;
    }

    if (this.credits < cost) {
      this.notice = "Shop credit authorization denied. Defeat more drones or buy cheaper Compute Credits.";
      this.emitChange();
      return false;
    }

    if (this.allotmentCurrent >= this.allotmentMax) {
      this.notice = "Compute Credit reserve already full. The corporations will not sell excess.";
      this.emitChange();
      return false;
    }

    this.credits -= cost;
    this.allotmentCurrent = Math.min(this.allotmentMax, this.allotmentCurrent + amount);
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.notice = `Procured ${amount} Compute Credits for ${cost} shop credits.`;
    this.emitChange();
    return true;
  }

  buyQuantumTuner(): boolean {
    if (this.sceneMode !== "shop") {
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
    return true;
  }

  repairIntegrity(): boolean {
    if (this.sceneMode !== "shop") {
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
    if (this.sceneMode !== "shop") {
      return false;
    }

    const cost = this.getComputeRateLimitUpgradeCost();
    if (this.credits < cost) {
      this.notice = `Compute Rate Limit upgrade denied. ${cost} shop credits required.`;
      this.emitChange();
      return false;
    }

    this.credits -= cost;
    this.computeRateLimitUpgrades += 1;
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
    this.sceneMode = "arena";
    this.kills = 0;
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.arenaEntryAllotment = this.allotmentCurrent;
    this.computeRegenDelayRemainingMs = 0;
    this.arenaPrompt = "Space dash, left click melee, right click ranged, Q collapse.";
    this.notice = "Deployment accepted. Exit through the northern gate before your Compute Credits collapse.";
    this.emitChange();
  }

  restoreForShop(note?: string): void {
    this.sceneMode = "shop";
    this.computeCurrent = Math.min(this.computeMax, Math.max(0, this.allotmentCurrent));
    this.computeRegenDelayRemainingMs = 0;
    this.arenaPrompt = "";
    if (note) {
      this.notice = note;
    }
    this.emitChange();
  }

  canUseAbility(): boolean {
    return (
      this.computeCurrent > -this.computeOverdrawCap &&
      this.allotmentCurrent > -this.allotmentOverdrawCap
    );
  }

  spend(amount: number): boolean {
    if (
      this.computeCurrent <= -this.computeOverdrawCap ||
      this.allotmentCurrent <= -this.allotmentOverdrawCap
    ) {
      return false;
    }

    this.computeCurrent = Math.max(-this.computeOverdrawCap, this.computeCurrent - amount);
    this.allotmentCurrent = Math.max(
      -this.allotmentOverdrawCap,
      this.allotmentCurrent - amount,
    );
    this.computeRegenDelayRemainingMs = this.computeRegenDelayMs;
    this.emitChange();
    return true;
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

  finishArena(status: ArenaOutcome, note: string): ArenaReport {
    if (status === "cleared") {
      this.roundsFinished += 1;
    }

    const creditsEarned =
      status === "cleared"
        ? this.kills * 12 + 36
        : status === "retreated"
          ? this.kills * 8
          : 0;
    const allotmentSpent = Math.max(0, this.arenaEntryAllotment - this.allotmentCurrent);

    this.credits += creditsEarned;
    this.report = {
      status,
      kills: this.kills,
      creditsEarned,
      allotmentSpent,
      note,
    };

    this.restoreForShop(note);
    return this.report;
  }

  createArenaSnapshot(): ArenaRunStateSnapshot {
    return {
      computeCurrent: this.computeCurrent,
      allotmentCurrent: this.allotmentCurrent,
      integrityCurrent: this.integrityCurrent,
      kills: this.kills,
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
    this.computeCurrent = snapshot.computeCurrent;
    this.allotmentCurrent = snapshot.allotmentCurrent;
    this.integrityCurrent = snapshot.integrityCurrent;
    this.kills = snapshot.kills;
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
    const computeDebt = Math.max(0, -this.computeCurrent) / this.computeOverdrawCap;
    const allotmentDebt = Math.max(0, -this.allotmentCurrent) / this.allotmentOverdrawCap;
    const computePressure = Math.max(0, 1 - this.computeCurrent / (this.computeMax * 0.42));
    const allotmentPressure = Math.max(0, 1 - this.allotmentCurrent / (this.allotmentMax * 0.12));
    return Math.min(
      1.6,
      Math.max(
        computePressure * 0.34,
        allotmentPressure * 0.24,
        computeDebt * 0.88,
        computeDebt * 0.48 + allotmentDebt * 0.94,
      ),
    );
  }

  getMovementMultiplier(): number {
    const throttle = this.getThrottleSeverity();
    const lowAllotmentPenalty =
      this.allotmentCurrent > 0
        ? (1 - Math.min(1, this.allotmentCurrent / this.allotmentMax)) * 0.12
        : 0.18;

    return Math.max(0.18, 1 - throttle * 0.46 - lowAllotmentPenalty);
  }

  getVisionBlurStrength(): number {
    const throttle = this.getThrottleSeverity();
    const allotmentStarved = this.allotmentCurrent <= 0 ? 0.9 : 0;
    const lowComputeHaze = Math.max(0, 1 - this.computeCurrent / (this.computeMax * 0.55)) * 0.34;
    return Math.min(1.45, throttle * 1.08 + lowComputeHaze + allotmentStarved);
  }

  getThrottleLabel(): string {
    if (this.allotmentCurrent <= 0) {
      return "Seized";
    }

    if (this.computeCurrent < 0) {
      return "Rate-Limited";
    }

    if (this.computeCurrent < this.computeMax * 0.33) {
      return "Constrained";
    }

    return "Nominal";
  }

  private clampComputeToCurrentAllotment(): void {
    this.computeCurrent = Math.min(this.computeCurrent, Math.max(0, this.allotmentCurrent));
  }
}

export const gameState = new RunState();
