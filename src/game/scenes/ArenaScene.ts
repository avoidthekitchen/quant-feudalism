import * as Phaser from "phaser";
import { SCENES } from "../constants";
import {
  ABILITY_COOLDOWNS_MS,
  calculateRangedSiphonRefund,
  getCooldownProgress,
  HOPPER_CHARGED_SHOT_DAMAGE,
  HOPPER_CHARGED_SHOT_HIT_RADIUS,
  HOPPER_CHARGED_SHOT_SPEED,
  HOPPER_HP,
  HOPPER_TOUCH_DAMAGE,
  MELEE_DAMAGE,
  RANGED_DIRECT_DAMAGE,
  RANGED_PULL_FORCE,
  RANGED_PULL_RADIUS,
  RANGED_PROJECTILE_SPEED,
  RANGED_SPLASH_DAMAGE,
  type CombatAbilityAction,
} from "../combat";
import {
  activateRefundDiscount,
  advanceComputeCycle,
  createArenaComputeCycle,
  createStarterComputeCycle,
  drawBonusAttackCard,
  endActiveWindow,
  getAttackCardDisplayName,
  getDiscountedAttackCost,
  isAttackCardAffordable,
  playAttackCard,
  REFUND_DISCOUNT_AMOUNT,
  REFUND_DISCOUNT_ATTACKS,
  shouldEndActiveWindow,
  startActiveWindow,
  type AttackCard,
  type AttackCardRejectionReason,
  type AttackCardType,
  type ComputeCycleState,
} from "../compute-cycle";
import { ArenaDiagnostics, type SubsystemLabel } from "../diagnostics";
import { createEnemySpawnPlan, type EnemyType } from "../enemies";
import { getAttackCardDefinition } from "../card-catalog";
import {
  ACTOR_DISPLAY_SCALE,
  DRONE_SHEET_KEY,
  HOPPER_SHEET_KEY,
  PLAYER_SHEET_KEY,
  SPRITE_ACTIONS,
  SPRITE_DIRECTIONS,
  type SpriteAction,
  type SpriteDirection,
  spriteAnimationKey,
  spriteFrameName,
} from "../generated-art";
import { playBackgroundMusic } from "../music";
import {
   extractHistoryRange,
   getCollapseAvailability,
   prepareCollapsedHistory,
   QUANTUM_TUNER_SNAPSHOT_INTERVAL_MS,
   QUANTUM_TUNER_REWIND_MS,
   recordArenaSnapshot,
   type ArenaSnapshot,
   type EnemyArenaSnapshot,
   type PlayerArenaSnapshot,
   type ProjectileArenaSnapshot,
   type TimedArenaSnapshot,
   type TrailPoint,
  } from "../quantum-tuner";
import { gameState, type ArenaOutcome } from "../state";

type AbilityAction = CombatAbilityAction;

type AbilityAttempt = {
  allowed: boolean;
  cost: number;
};

type CooldownIndicator = {
  container: Phaser.GameObjects.Container;
  progress: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
};

type AttackQueueHud = {
  container: Phaser.GameObjects.Container;
  meleeCards: HudCardView[];
  rangedCards: HudCardView[];
  preparePile: CardPileView;
  shufflePile: CardPileView;
  drawCount: Phaser.GameObjects.Text;
  discardCount: Phaser.GameObjects.Text;
  phaseLabel: Phaser.GameObjects.Text;
  border: Phaser.GameObjects.Rectangle;
};

type HudCardView = {
  container: Phaser.GameObjects.Container;
  frame: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  classMarker: Phaser.GameObjects.Text;
  cross: Phaser.GameObjects.Graphics;
  homeX: number;
  homeY: number;
};

type CardPileView = {
  container: Phaser.GameObjects.Container;
  cards: Phaser.GameObjects.Rectangle[];
};

type EnemySpawnPoint = {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  orbitSeed: number;
};

type EnemyUnit = {
  id: number;
  type: EnemyType;
  sprite: Phaser.Physics.Arcade.Sprite;
  shadow: Phaser.GameObjects.Image;
  playerCollider: Phaser.Physics.Arcade.Collider;
  wallCollider: Phaser.Physics.Arcade.Collider;
  lungeDirection: Phaser.Math.Vector2;
  lungeTelegraph?: Phaser.GameObjects.Rectangle;
  hopperShotTelegraph?: Phaser.GameObjects.Rectangle;
  hopperShotGlow?: Phaser.GameObjects.Arc;
  hopDirection: Phaser.Math.Vector2;
  lockedShotDirection: Phaser.Math.Vector2;
  hp: number;
  touchCooldown: number;
  attackTimer: number;
  stunTimer: number;
  lungeCooldown: number;
  lungeWindupTimer: number;
  lungeTimer: number;
  hopCooldown: number;
  hopWindupTimer: number;
  hopTimer: number;
  hopDistance: number;
  landingRecoveryTimer: number;
  shotCooldown: number;
  shotWindupTimer: number;
  orbitSeed: number;
};

type Projectile = {
  type: "function" | "hopper-shot";
  sprite: Phaser.Physics.Arcade.Image;
  velocity: Phaser.Math.Vector2;
  ttl: number;
  damage: number;
  hitRadius: number;
};

type CollapsePlayback = {
  timeline: TimedArenaSnapshot[];
  target: TimedArenaSnapshot;
  elapsedMs: number;
  durationMs: number;
  lastAppliedIndex: number;
};

type GhostReplay = {
  timeline: TimedArenaSnapshot[];
  elapsedMs: number;
  durationMs: number;
};

type RefundAuraVisual = {
  container: Phaser.GameObjects.Container;
  glow: Phaser.GameObjects.Arc;
  rings: Phaser.GameObjects.Arc[];
  flames: Phaser.GameObjects.Arc[];
  previousCharges: number;
};

export class ArenaScene extends Phaser.Scene {
  private static readonly collapseVisualDurationMs = 1_000;
  private static readonly deathVisualDurationMs = 1_350;
  private static readonly combatSpeedMultiplier = 1.5;
  private static readonly playerBaseSpeed = 150;
  private static readonly playerBaseAcceleration = 760;
  private static readonly playerBaseDeceleration = 980;
  private static readonly playerBaseDashSpeed = 520;
  private static readonly meleeRange = 166;
  private static readonly meleeStunDuration = 0.28;
  private static readonly playerDashDuration = 0.145;
  private static readonly playerDashInvulnerabilityDuration = 0.24;
  private static readonly meleeAttackLockDuration = 0.13;
  private static readonly rangedMovementPauseDuration = 0.32;
  private static readonly rangedAttackAnimationDuration = 0.28;
  private static readonly cardPileBottomOffset = 120;
  private static readonly droneChaseSpeed = 132;
  private static readonly droneCloseSpeed = 68;
  private static readonly droneLungeMinRange = 72;
  private static readonly droneLungeMaxRange = 230;
  private static readonly droneLungeWindupDuration = 0.34;
  private static readonly droneLungeDuration = 0.18;
  private static readonly droneLungeCooldown = 1.35;
  private static readonly droneLungeSpeed = 470;
  private static readonly hopperPreferredMinRange = 250;
  private static readonly hopperPreferredMaxRange = 350;
  private static readonly hopperApproachRange = 400;
  private static readonly hopperHopWindupDuration = 0.2;
  private static readonly hopperHopDuration = 0.18;
  private static readonly hopperLandingRecoveryDuration = 0.45;
  private static readonly hopperHopCooldown = 0.8;
  private static readonly hopperMinHopDistance = 150;
  private static readonly hopperMaxHopDistance = 200;
  private static readonly hopperWallMargin = 60;
  private static readonly hopperShotWindupDuration = 0.55;
  private static readonly hopperShotCooldown = 2.2;
  private static readonly hopperTouchCooldown = 0.9;
  private static readonly enemySpawnPositions = [
    [540, 240],
    [710, 280],
    [940, 250],
    [1140, 450],
    [980, 660],
    [1340, 370],
    [1290, 900],
    [780, 920],
    [430, 610],
    [1120, 1010],
    [1480, 720],
    [620, 1060],
    [1240, 250],
    [260, 260],
    [1510, 260],
    [260, 900],
    [1490, 1010],
    [900, 500],
    [1450, 560],
    [520, 900],
  ] as const;

  private readonly arenaWidth = 1640;
  private readonly arenaHeight = 1180;
  private readonly extractionPoint = new Phaser.Math.Vector2(1440, 160);
  private readonly entryPoint = new Phaser.Math.Vector2(200, 980);

  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private drones: EnemyUnit[] = [];
  private projectiles: Projectile[] = [];
  private enemySpawnPoints: EnemySpawnPoint[] = [];
  private cursors!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private blurFilter?: Phaser.Filters.Blur;
  private extractionRing?: Phaser.GameObjects.Arc;
  private arenaCleared = false;
  private enemyCountLabel?: Phaser.GameObjects.Text;
  private dashTimer = 0;
  private dashInvulnerabilityTimer = 0;
  private dashDirection = new Phaser.Math.Vector2(1, 0);
  private rangedMovementPauseTimer = 0;
  private playerAttackTimer = 0;
  private playerFacing: SpriteDirection = "s";
  private currentPlayerAnim = "";
  private velocity = new Phaser.Math.Vector2();
  private cooldownRemainingMs: Record<AbilityAction, number> = {
    dash: 0,
    melee: 0,
    ranged: 0,
  };
  private cooldownDurationMs: Record<AbilityAction, number> = {
    dash: ABILITY_COOLDOWNS_MS.dash,
    melee: ABILITY_COOLDOWNS_MS.melee,
    ranged: ABILITY_COOLDOWNS_MS.ranged,
  };
  private cooldownIndicators: Partial<Record<AbilityAction, CooldownIndicator>> = {};
  private computeCycle: ComputeCycleState = startActiveWindow(createStarterComputeCycle(1), gameState.computeMax);
  private attackQueueHud?: AttackQueueHud;
  private transientVisuals = new Set<Phaser.GameObjects.GameObject>();
  private timelineTimeMs = 0;
  private arenaElapsedTimeMs = 0;
  private snapshotAccumulatorMs = 0;
  private snapshotHistory: TimedArenaSnapshot[] = [];
  private collapsePlayback?: CollapsePlayback;
  private deathSequenceActive = false;
  private ghostReplay?: GhostReplay;
  private quantumTrailGraphics?: Phaser.GameObjects.Graphics;
  private quantumTargetMarker?: Phaser.GameObjects.Arc;
  private collapseOverlay?: Phaser.GameObjects.Rectangle;
  private refundAura?: RefundAuraVisual;
  private preparingBorderBars: Phaser.GameObjects.Rectangle[] = [];
  private ghostShadow?: Phaser.GameObjects.Image;
  private ghostSprite?: Phaser.GameObjects.Sprite;
  private currentGhostAnim = "";
  private readonly diagnostics = new ArenaDiagnostics();

  constructor() {
    super(SCENES.arena);
  }

  create(): void {
    playBackgroundMusic(this, "arena");

    this.drones = [];
    this.projectiles = [];
    this.enemySpawnPoints = [];
    this.velocity.set(0, 0);
    this.arenaCleared = false;
    this.dashTimer = 0;
    this.dashInvulnerabilityTimer = 0;
    this.rangedMovementPauseTimer = 0;
    this.playerAttackTimer = 0;
    this.playerFacing = "s";
    this.currentPlayerAnim = "";
    this.cooldownRemainingMs = {
      dash: 0,
      melee: 0,
      ranged: 0,
    };
    this.cooldownDurationMs = {
      dash: ABILITY_COOLDOWNS_MS.dash,
      melee: ABILITY_COOLDOWNS_MS.melee,
      ranged: ABILITY_COOLDOWNS_MS.ranged,
    };
    const currentDraftDeck = gameState.tryGetDeployableDeck();
    if (!currentDraftDeck) {
      gameState.restoreForShop(gameState.getDraftDeckValidation().message);
      this.scene.start(SCENES.shop);
      return;
    }

    this.computeCycle = createArenaComputeCycle({
      currentDraftDeck,
      seed: this.timelineTimeMs + gameState.runId,
      computeRefill: gameState.computeMax,
    });
    gameState.computeCurrent = Math.min(gameState.computeMax, Math.max(0, gameState.allotmentCurrent));
    gameState.emitChange();
    this.transientVisuals.clear();
    this.timelineTimeMs = 0;
    this.arenaElapsedTimeMs = 0;
    this.snapshotAccumulatorMs = 0;
    this.snapshotHistory = [];
    this.collapsePlayback = undefined;
    this.ghostReplay = undefined;
    this.currentGhostAnim = "";
    this.destroyCooldownIndicators();

    this.cameras.main.setBackgroundColor(0x070b12);
    this.physics.world.setBounds(0, 0, this.arenaWidth, this.arenaHeight);
    this.cameras.main.setBounds(0, 0, this.arenaWidth, this.arenaHeight);

    this.drawArenaFloor();
    this.createWalls();
    this.createExtractionGate();
    this.createAtmosphere();
    this.registerActorAnimations();

    this.playerShadow = this.add.image(this.entryPoint.x, this.entryPoint.y + 18, "qf-shadow");
    this.playerShadow.setAlpha(0.46);
    this.playerShadow.setScale(0.92, 0.76);

    this.quantumTrailGraphics = this.add.graphics();
    this.quantumTrailGraphics.setDepth(40);
    this.quantumTargetMarker = this.add.circle(this.entryPoint.x, this.entryPoint.y, 12, 0xffcf66, 0.08);
    this.quantumTargetMarker.setStrokeStyle(2, 0xffcf66, 0.48);
    this.quantumTargetMarker.setDepth(42);
    this.quantumTargetMarker.setVisible(false);

    this.player = this.physics.add.sprite(
      this.entryPoint.x,
      this.entryPoint.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    this.player.setDepth(this.entryPoint.y);
    this.player.setScale(ACTOR_DISPLAY_SCALE);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(44, 40);
    this.player.setOffset(50, 108);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setMaxVelocity(840, 840);

    this.physics.add.collider(this.player, this.walls);

    this.spawnEnemies();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.setZoom(1);
    this.blurFilter = this.cameras.main.filters!.external.addBlur(
      0,
      1,
      1,
      0.001,
      0xeaffff,
      2,
    );
    this.collapseOverlay = this.add.rectangle(
      this.scale.width / 2,
      this.scale.height / 2,
      this.scale.width,
      this.scale.height,
      0xff4fa4,
      0,
    );
    this.collapseOverlay.setScrollFactor(0);
    this.collapseOverlay.setDepth(9_998);
    this.collapseOverlay.setBlendMode(Phaser.BlendModes.SCREEN);

    this.createPreparingBorder();

    this.ghostShadow = this.add.image(this.entryPoint.x, this.entryPoint.y + 18, "qf-shadow");
    this.ghostShadow.setScale(0.88, 0.64);
    this.ghostShadow.setAlpha(0);
    this.ghostShadow.setTint(0x60ffd3);
    this.ghostShadow.setDepth(44);
    this.ghostShadow.setVisible(false);

    this.ghostSprite = this.add.sprite(
      this.entryPoint.x,
      this.entryPoint.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    this.ghostSprite.setScale(ACTOR_DISPLAY_SCALE);
    this.ghostSprite.setAlpha(0);
    this.ghostSprite.setTint(0x9cf9ff);
    this.ghostSprite.setBlendMode(Phaser.BlendModes.SCREEN);
    this.ghostSprite.setDepth(45);
    this.ghostSprite.setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", this.handlePointerDown, this);

    this.cursors = this.input.keyboard!.addKeys("W,A,S,D,F,Q,E,SPACE") as ArenaScene["cursors"];

    const diagKey = this.input.keyboard!.addKey("BACKTICK");
    diagKey.on("down", () => {
      const json = this.diagnostics.exportJson();
      console.log("[quant-feudalism diagnostics]", json);
      navigator.clipboard?.writeText(json).catch(() => {});
      gameState.setNotice("Diagnostics exported to console and clipboard.");
    });

    this.enemyCountLabel = this.add.text(24, 24, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "16px",
      color: "#dcf7e3",
    });
    this.enemyCountLabel.setScrollFactor(0);
    this.enemyCountLabel.setDepth(9999);
    this.createCooldownIndicators();
    this.createAttackQueueHud();

    this.updateVisuals();
    this.updateExtractionPrompt();
    this.updateCooldownIndicators();
    this.updateAttackQueueHud();
    this.animateDeal();
    this.snapshotHistory = recordArenaSnapshot([], this.captureArenaSnapshot(), this.timelineTimeMs);
    gameState.setExtractionReady(this.arenaCleared);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.clearTransientVisuals();
      this.destroyRefundAura();
      this.destroyCooldownIndicators();
      this.destroyAttackQueueHud();
      this.destroyAllProjectiles();
      this.destroyAllDrones();
    });
  }

  update(_time: number, delta: number): void {
    this.diagnostics.beginFrame();

    if (this.deathSequenceActive) {
      this.diagnostics.endFrame(delta, this.diagnosticsContext());
      return;
    }

    if (this.collapsePlayback) {
      this.timeSubsystem("collapsePlayback", () => this.updateCollapsePlayback(delta));
      this.timeSubsystem("quantumTrail", () => this.updateQuantumTrail());
      this.diagnostics.endFrame(delta, this.diagnosticsContext());
      return;
    }

    const dt = delta / 1000;
    this.timelineTimeMs += delta;
    this.arenaElapsedTimeMs += delta;
    this.snapshotAccumulatorMs += delta;
    this.advanceAbilityCooldowns(delta);
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);
    this.dashInvulnerabilityTimer = Math.max(0, this.dashInvulnerabilityTimer - dt);
    this.timeSubsystem("computeCycle", () => this.advanceComputeCycleState(delta));

    const pointer = this.input.activePointer;
    pointer.updateWorldPoint(this.cameras.main);

    if (Phaser.Input.Keyboard.JustDown(this.cursors.Q) && this.tryCollapse()) {
      this.diagnostics.endFrame(delta, this.diagnosticsContext());
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.cursors.E)) {
      this.tryRequestCycleEnd();
    }

    this.updatePlayerMovement(dt, pointer);
    this.updatePlayerOrientation(pointer);

    if (this.timeSubsystem("updateDrones", () => this.updateDrones(dt))) {
      this.diagnostics.endFrame(delta, this.diagnosticsContext());
      return;
    }

    this.timeSubsystem("updateProjectiles", () => this.updateProjectiles(dt));
    this.updateVisuals();
    this.updateExtractionPrompt();
    this.updateCooldownIndicators();
    this.updateAttackQueueHud();
    this.checkAutomaticCycleEnd();

    if (Phaser.Input.Keyboard.JustDown(this.cursors.F) && this.canExtract()) {
      const note = this.arenaCleared
        ? "Arena pacified. Procurement rights renewed."
        : "Emergency extraction granted. The corporations keep the unused fear.";
      gameState.finishArena(this.arenaCleared ? "cleared" : "retreated", note, this.arenaElapsedTimeMs);
      this.scene.start(SCENES.shop);
      this.diagnostics.endFrame(delta, this.diagnosticsContext());
      return;
    }

    if (!this.arenaCleared && this.drones.length === 0) {
      this.arenaCleared = true;
      gameState.setExtractionReady(true);
      gameState.setNotice(
        "All enemies decommissioned. Northern extraction gate now serves as your audit exit.",
      );
      this.tweens.add({
        targets: this.extractionRing,
        alpha: { from: 0.2, to: 0.75 },
        scale: { from: 1, to: 1.08 },
        duration: 460,
        yoyo: true,
        repeat: 2,
      });
    }

    this.timeSubsystem("recordSnapshot", () => this.recordSnapshotIfDue());
    this.timeSubsystem("quantumTrail", () => this.updateQuantumTrail());
    this.updateGhostReplay(delta);
    this.diagnostics.endFrame(delta, this.diagnosticsContext());
  }

  private drawArenaFloor(): void {
    this.add.rectangle(
      this.arenaWidth / 2,
      this.arenaHeight / 2,
      this.arenaWidth + 40,
      this.arenaHeight + 40,
      0x22313c,
    );

    const startX = 80;
    const startY = 44;
    for (let row = 0; row < 26; row += 1) {
      for (let col = 0; col < 17; col += 1) {
        const x = startX + col * 96 + (row % 2) * 48;
        const y = startY + row * 46;
        const tile = this.add.image(x, y, "qf-floor");
        tile.setAlpha((row + col) % 5 === 0 ? 0.9 : 0.68);
        tile.setDepth(-260 + row);
      }
    }

    for (let i = 0; i < 9; i += 1) {
      const line = this.add.rectangle(820, 120 + i * 118, 1480, 1, 0xc9fff0, 0.1);
      line.setAngle(-18);
      line.setDepth(-30);
    }

    const faultLines = [
      [220, 420, 360, 350, 492, 398],
      [920, 310, 1080, 390, 1220, 348],
      [620, 840, 780, 760, 946, 812],
    ];

    faultLines.forEach(([x1, y1, x2, y2, x3, y3]) => {
      const crack = this.add.graphics();
      crack.lineStyle(3, 0xff4fa4, 0.44);
      crack.lineBetween(x1, y1, x2, y2);
      crack.lineStyle(1, 0xffcf66, 0.62);
      crack.lineBetween(x2, y2, x3, y3);
      crack.setDepth(y3 - 12);
    });
  }

  private createAtmosphere(): void {
    const hazePoints = [
      { x: 360, y: 260, scale: 2.8, alpha: 0.22 },
      { x: 1180, y: 300, scale: 2.4, alpha: 0.2 },
      { x: 840, y: 780, scale: 3.2, alpha: 0.17 },
      { x: 1430, y: 850, scale: 2.1, alpha: 0.16 },
    ];

    hazePoints.forEach(({ x, y, scale, alpha }) => {
      const haze = this.add.image(x, y, "qf-haze");
      haze.setScale(scale, scale * 0.72);
      haze.setAlpha(alpha);
      haze.setDepth(y - 180);
    });

    for (let i = 0; i < 18; i += 1) {
      const x = 120 + ((i * 197) % 1420);
      const y = 100 + ((i * 113) % 940);
      const ember = this.add.rectangle(x, y, 3 + (i % 3), 10 + (i % 5), 0xffcf66, 0.2);
      ember.setDepth(y + 70);
      this.tweens.add({
        targets: ember,
        alpha: { from: 0.05, to: 0.38 },
        y: y - 18,
        duration: 1500 + i * 90,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  private createWalls(): void {
    this.walls = this.physics.add.staticGroup();

    const boundaries = [
      this.add.rectangle(this.arenaWidth / 2, 18, this.arenaWidth, 36, 0x223035, 0),
      this.add.rectangle(this.arenaWidth / 2, this.arenaHeight - 18, this.arenaWidth, 36, 0x223035, 0),
      this.add.rectangle(18, this.arenaHeight / 2, 36, this.arenaHeight, 0x223035, 0),
      this.add.rectangle(this.arenaWidth - 18, this.arenaHeight / 2, 36, this.arenaHeight, 0x223035, 0),
    ];

    boundaries.forEach((wall) => {
      this.physics.add.existing(wall, true);
      this.walls.add(wall);
    });

    const monoliths = [
      { x: 500, y: 420 },
      { x: 760, y: 660 },
      { x: 1060, y: 360 },
      { x: 1190, y: 820 },
      { x: 1320, y: 540 },
      { x: 360, y: 780 },
    ];

    monoliths.forEach(({ x, y }) => {
      const shadow = this.add.image(x, y + 44, "qf-shadow").setScale(1.85, 0.92).setAlpha(0.42);
      shadow.setDepth(y - 10);
      const pillar = this.walls.create(x, y, "qf-pillar") as Phaser.Physics.Arcade.Sprite;
      pillar.setDepth(y + 10);
      pillar.setScale(1.18);
      pillar.refreshBody();
    });
  }

  private createExtractionGate(): void {
    this.extractionRing = this.add.circle(
      this.extractionPoint.x,
      this.extractionPoint.y + 24,
      66,
      0x60ffd3,
      0.12,
    );
    this.extractionRing.setStrokeStyle(4, 0xffcf66, 0.64);
    this.extractionRing.setDepth(18);

    const gateDais = this.add.polygon(
      this.extractionPoint.x,
      this.extractionPoint.y + 78,
      [0, -34, 92, 0, 0, 34, -92, 0],
      0x10202a,
      0.86,
    );
    gateDais.setStrokeStyle(2, 0x60ffd3, 0.56);
    gateDais.setDepth(this.extractionPoint.y - 4);

    this.add
      .image(this.extractionPoint.x, this.extractionPoint.y - 24, "qf-gate")
      .setScale(1.08)
      .setDepth(this.extractionPoint.y);

    this.add
      .text(this.extractionPoint.x, this.extractionPoint.y - 104, "EXTRACTION", {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "15px",
        color: "#dff6e5",
      })
      .setOrigin(0.5)
      .setDepth(this.extractionPoint.y + 1);
  }

  private spawnEnemies(): void {
    this.enemySpawnPoints = createEnemySpawnPlan(
      ArenaScene.enemySpawnPositions.map(([x, y]) => ({ x, y })),
      gameState.roundsFinished,
    );

    this.enemySpawnPoints.forEach((spawnPoint) => {
      this.drones.push(this.createDrone(this.initialEnemySnapshot(spawnPoint)));
    });
  }

  private registerActorAnimations(): void {
    this.registerAnimationSet("player", PLAYER_SHEET_KEY);
    this.registerAnimationSet("drone", DRONE_SHEET_KEY);
    this.registerAnimationSet("hopper", HOPPER_SHEET_KEY);
  }

  private registerAnimationSet(actor: "player" | "drone" | "hopper", sheetKey: string): void {
    SPRITE_DIRECTIONS.forEach((direction) => {
      (Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][]).forEach(([action, count]) => {
        const key = spriteAnimationKey(actor, action, direction);
        if (this.anims.exists(key)) {
          return;
        }

        this.anims.create({
          key,
          frames: Array.from({ length: count }, (_, frame) => ({
            key: sheetKey,
            frame: spriteFrameName(action, direction, frame),
          })),
          frameRate: action === "idle" ? 3 : action === "run" ? 11 : 15,
          repeat: action === "attack" || action === "dash" ? 0 : -1,
        });
      });
    });
  }

  private updatePlayerMovement(dt: number, pointer: Phaser.Input.Pointer): void {
    const input = new Phaser.Math.Vector2(
      (this.cursors.D.isDown ? 1 : 0) - (this.cursors.A.isDown ? 1 : 0),
      (this.cursors.S.isDown ? 1 : 0) - (this.cursors.W.isDown ? 1 : 0),
    );

    if (Phaser.Input.Keyboard.JustDown(this.cursors.SPACE)) {
      this.tryDash(input, pointer);
    }

    if (this.dashTimer > 0) {
      this.dashTimer = Math.max(0, this.dashTimer - dt);
      const dashSpeed =
        ArenaScene.playerBaseDashSpeed *
        ArenaScene.combatSpeedMultiplier *
        gameState.getMovementMultiplier();
      this.velocity.copy(this.dashDirection).scale(dashSpeed);
      this.player.setVelocity(this.velocity.x, this.velocity.y);
      this.updatePlayerSprite(input, pointer, "dash");
      this.updatePlayerShadow();
      return;
    }

    if (this.playerAttackTimer > 0 || this.rangedMovementPauseTimer > 0) {
      this.rangedMovementPauseTimer = Math.max(0, this.rangedMovementPauseTimer - dt);
      const brake =
        ArenaScene.playerBaseDeceleration *
        ArenaScene.combatSpeedMultiplier *
        2.4 *
        dt;
      this.velocity.x = this.moveTowards(this.velocity.x, 0, brake);
      this.velocity.y = this.moveTowards(this.velocity.y, 0, brake);
      this.player.setVelocity(this.velocity.x, this.velocity.y);
      this.updatePlayerSprite(input, pointer, "attack");
      this.updatePlayerShadow();
      return;
    }

    const preparingMultiplier = this.computeCycle.phase === "preparing" ? 0.6 : 1;
    const movementMultiplier = gameState.getMovementMultiplier() * preparingMultiplier;
    const maxSpeed =
      ArenaScene.playerBaseSpeed *
      ArenaScene.combatSpeedMultiplier *
      movementMultiplier;
    const accelerate =
      ArenaScene.playerBaseAcceleration *
      ArenaScene.combatSpeedMultiplier *
      movementMultiplier;
    const decelerate =
      ArenaScene.playerBaseDeceleration *
      ArenaScene.combatSpeedMultiplier *
      (0.8 + movementMultiplier * 0.25);

    if (input.lengthSq() > 0) {
      input.normalize();
      const targetVelocity = input.scale(maxSpeed);
      this.velocity.x = this.moveTowards(
        this.velocity.x,
        targetVelocity.x,
        accelerate * dt,
      );
      this.velocity.y = this.moveTowards(
        this.velocity.y,
        targetVelocity.y,
        accelerate * dt,
      );
    } else {
      this.velocity.x = this.moveTowards(this.velocity.x, 0, decelerate * dt);
      this.velocity.y = this.moveTowards(this.velocity.y, 0, decelerate * dt);
    }

    this.player.setVelocity(this.velocity.x, this.velocity.y);

    this.updatePlayerSprite(input, pointer);
    this.updatePlayerShadow();
  }

  private updatePlayerShadow(): void {
    this.playerShadow.setPosition(this.player.x, this.player.y + 18);
    this.playerShadow.setDepth(this.player.y - 12);
    this.player.setDepth(this.player.y + 6);
    if (this.refundAura) {
      this.refundAura.container.setDepth(this.player.y + 5);
    }
  }

  private updatePlayerSprite(
    input: Phaser.Math.Vector2,
    pointer: Phaser.Input.Pointer,
    forcedAction?: SpriteAction,
  ): void {
    const speed = this.velocity.length();
    const facingVector = new Phaser.Math.Vector2(pointer.worldX - this.player.x, pointer.worldY - this.player.y);
    const direction = this.directionFromVector(facingVector, this.playerFacing);
    const action = forcedAction ?? (this.playerAttackTimer > 0 ? "attack" : input.lengthSq() > 0.01 || speed > 16 ? "run" : "idle");
    this.playerFacing = direction;

    if (action === "dash") {
      this.playPlayerAnimation("dash", direction);
      this.player.setAngle(this.dashDirection.x * 7);
      this.playerShadow.setScale(1.14, 0.64);
      return;
    }

    this.player.setAngle(speed > 18 ? Phaser.Math.Clamp(this.velocity.x / 24, -6, 6) : 0);
    this.playerShadow.setScale(0.92 + Math.min(speed / 900, 0.12), 0.76);
    this.playPlayerAnimation(action, direction);
  }

  private updatePlayerOrientation(pointer: Phaser.Input.Pointer): void {
    if (this.velocity.lengthSq() < 196 && this.dashTimer <= 0) {
      this.playerFacing = this.directionFromVector(
        new Phaser.Math.Vector2(pointer.worldX - this.player.x, pointer.worldY - this.player.y),
        this.playerFacing,
      );
    }
  }

  private playPlayerAnimation(action: SpriteAction, direction: SpriteDirection): void {
    const animationDirection = this.animationDirectionForFacing(direction);
    this.player.setFlipX(this.shouldMirrorFacing(direction));
    const key = spriteAnimationKey("player", action, animationDirection);
    if (this.currentPlayerAnim === key && this.player.anims.isPlaying) {
      return;
    }

    this.currentPlayerAnim = key;
    this.player.play(key, true);
  }

  private animationDirectionForFacing(direction: SpriteDirection): SpriteDirection {
    if (direction === "w") return "e";
    if (direction === "nw") return "ne";
    if (direction === "sw") return "se";
    return direction;
  }

  private shouldMirrorFacing(direction: SpriteDirection): boolean {
    return direction === "w" || direction === "nw" || direction === "sw";
  }

  private directionFromVector(vector: Phaser.Math.Vector2, fallback: SpriteDirection): SpriteDirection {
    if (vector.lengthSq() < 0.001) {
      return fallback;
    }

    const angle = Phaser.Math.RadToDeg(Math.atan2(vector.y, vector.x));
    if (angle >= -22.5 && angle < 22.5) return "e";
    if (angle >= 22.5 && angle < 67.5) return "se";
    if (angle >= 67.5 && angle < 112.5) return "s";
    if (angle >= 112.5 && angle < 157.5) return "sw";
    if (angle >= 157.5 || angle < -157.5) return "w";
    if (angle >= -157.5 && angle < -112.5) return "nw";
    if (angle >= -112.5 && angle < -67.5) return "n";
    return "ne";
  }

  private tryDash(input: Phaser.Math.Vector2, pointer: Phaser.Input.Pointer): void {
    if (this.playerAttackTimer > 0 || this.rangedMovementPauseTimer > 0 || this.dashTimer > 0) {
      return;
    }

    const attempt = this.resolveAbilityAttempt("dash", 0);
    if (!attempt.allowed) {
      return;
    }

    const direction = input.lengthSq() > 0
      ? input.clone()
      : new Phaser.Math.Vector2(pointer.worldX - this.player.x, pointer.worldY - this.player.y);

    if (direction.lengthSq() === 0) {
      direction.set(1, 0);
    }

    direction.normalize();

    this.completeAbilityAttempt("dash", attempt);
    this.dashTimer = ArenaScene.playerDashDuration;
    this.dashInvulnerabilityTimer = ArenaScene.playerDashInvulnerabilityDuration;
    this.dashDirection.copy(direction);
    this.playerFacing = this.directionFromVector(direction, this.playerFacing);
    this.cameras.main.shake(90, 0.0022);
    this.createDashAfterimage();
  }

  private createDashAfterimage(): void {
    const afterimage = this.trackTransientVisual(this.add.image(
      this.player.x,
      this.player.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("dash", this.animationDirectionForFacing(this.playerFacing), 1),
    ));
    afterimage.setScale(ACTOR_DISPLAY_SCALE);
    afterimage.setFlipX(this.shouldMirrorFacing(this.playerFacing));
    afterimage.setAngle(this.player.angle);
    afterimage.setAlpha(0.52);
    afterimage.setTint(0x60ffd3);
    afterimage.setDepth(this.player.depth - 1);

    this.tweens.add({
      targets: afterimage,
      alpha: 0,
      x: afterimage.x - this.dashDirection.x * 42,
      y: afterimage.y - this.dashDirection.y * 22,
      duration: 180,
      onComplete: () => afterimage.destroy(),
    });
  }

  private resolveAbilityAttempt(action: AbilityAction, baseCost: number): AbilityAttempt {
    const remainingMs = this.cooldownRemainingMs[action];

    if (remainingMs > 0) {
      return {
        allowed: false,
        cost: baseCost,
      };
    }

    return {
      allowed: true,
      cost: baseCost,
    };
  }

  private completeAbilityAttempt(action: AbilityAction, _attempt: AbilityAttempt, cooldownMs = this.cooldownForAction(action)): void {
    this.cooldownDurationMs[action] = cooldownMs;
    this.cooldownRemainingMs[action] = cooldownMs;
  }

  private createCooldownIndicators(): void {
    this.destroyCooldownIndicators();

    (["dash", "melee", "ranged"] as AbilityAction[]).forEach((action) => {
      const container = this.add.container(0, 0);
      const backdrop = this.add.circle(0, 0, 17, 0x051017, 0.56);
      backdrop.setStrokeStyle(2, 0x33515d, 0.9);

      const progress = this.add.graphics();
      const label = this.add.text(0, 0, this.abilityShortLabel(action), {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "10px",
        color: "#dffcf3",
      });
      label.setOrigin(0.5);

      container.add([backdrop, progress, label]);
      this.cooldownIndicators[action] = {
        container,
        progress,
        label,
      };
    });
  }

  private updateCooldownIndicators(): void {
    (["dash", "melee", "ranged"] as AbilityAction[]).forEach((action) => {
      const indicator = this.cooldownIndicators[action];
      if (!indicator) {
        return;
      }

      const offset = this.cooldownIndicatorOffset(action);
      indicator.container.setPosition(this.player.x + offset.x, this.player.y + offset.y);
      indicator.container.setDepth(this.player.y + 40);

      const cooldownMs = this.cooldownDurationMs[action];
      const remainingMs = this.cooldownRemainingMs[action];
      const progress = getCooldownProgress(cooldownMs, remainingMs);
      const ready = remainingMs <= 0;
      indicator.container.setVisible(!ready);
      if (ready) {
        indicator.progress.clear();
        return;
      }
      this.drawCooldownArc(
        indicator.progress,
        0,
        ready ? 1 : progress,
        0x60ffd3,
        0.88,
        3,
      );

      indicator.label.setColor("#dffcf3");
      indicator.label.setAlpha(0.86);
      indicator.label.setScale(1);
      indicator.container.setScale(1);
    });
  }

  private destroyCooldownIndicators(): void {
    Object.values(this.cooldownIndicators).forEach((indicator) => {
      indicator.container.destroy();
    });
    this.cooldownIndicators = {};
  }

  private drawCooldownArc(
    graphics: Phaser.GameObjects.Graphics,
    fromProgress: number,
    toProgress: number,
    color: number,
    alpha: number,
    thickness: number,
  ): void {
    graphics.clear();

    if (toProgress <= fromProgress) {
      return;
    }

    const radius = 17;
    const startAngle = -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(fromProgress, 0, 1);
    const endAngle = -Math.PI / 2 + Math.PI * 2 * Phaser.Math.Clamp(toProgress, 0, 1);
    graphics.lineStyle(thickness, color, alpha);
    graphics.beginPath();
    graphics.arc(0, 0, radius, startAngle, endAngle, false);
    graphics.strokePath();
  }

  private createAttackQueueHud(): void {
    this.destroyAttackQueueHud();

    const container = this.add.container(this.scale.width / 2, this.scale.height - 62);
    container.setScrollFactor(0);
    container.setDepth(10_000);

    const border = this.add.rectangle(0, 0, 560, 90, 0x061016, 0.66);
    border.setStrokeStyle(2, 0x60ffd3, 0.72);

    const meleeLabel = this.add.text(-244, -36, "STATEMENT", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "10px",
      color: "#dffcf3",
    });
    meleeLabel.setOrigin(0.5);
    const rangedLabel = this.add.text(200, -36, "FUNCTION", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "10px",
      color: "#dffcf3",
    });
    rangedLabel.setOrigin(0.5);
    const phaseLabel = this.add.text(0, 30, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "13px",
      color: "#fff1b6",
    });
    phaseLabel.setOrigin(0.5);

    const drawCount = this.add.text(-42, -34, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "12px",
      color: "#9cf9ff",
    });
    drawCount.setOrigin(0.5);
    const discardCount = this.add.text(42, -34, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "12px",
      color: "#ffcf66",
    });
    discardCount.setOrigin(0.5);

    const meleeCards = Array.from({ length: 7 }, (_, index) => this.createHudCard(-244 + index * 28, -7));
    const rangedCards = Array.from({ length: 7 }, (_, index) => this.createHudCard(104 + index * 28, -7));
    const preparePile = this.createCardPile(54, this.scale.height - ArenaScene.cardPileBottomOffset);
    const shufflePile = this.createCardPile(this.scale.width - 54, this.scale.height - ArenaScene.cardPileBottomOffset);
    container.add([
      border,
      meleeLabel,
      rangedLabel,
      drawCount,
      discardCount,
      phaseLabel,
      ...meleeCards.map((card) => card.container),
      ...rangedCards.map((card) => card.container),
    ]);

    preparePile.container.setVisible(false);
    shufflePile.container.setVisible(false);
    this.attackQueueHud = {
      container,
      meleeCards,
      rangedCards,
      preparePile,
      shufflePile,
      drawCount,
      discardCount,
      phaseLabel,
      border,
    };
  }

  private createCardPile(x: number, y: number): CardPileView {
    const container = this.add.container(x, y);
    container.setScrollFactor(0);
    container.setDepth(10_001);

    const cards = Array.from({ length: 6 }, (_, index) => {
      const card = this.add.rectangle(index * 2, -index * 2, 28, 34, index % 2 === 0 ? 0xdffcf3 : 0xffcf66, 0.96);
      card.setStrokeStyle(2, 0x071015, 0.72);
      return card;
    });

    container.add(cards);
    return { container, cards };
  }

  private createHudCard(x: number, y: number): HudCardView {
    const container = this.add.container(x, y);
    const frame = this.add.rectangle(0, 0, 24, 27, 0xdffcf3, 1);
    frame.setStrokeStyle(2, 0x071015, 0.5);

    const label = this.add.text(0, 0, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "6px",
      color: "#071015",
    });
    label.setOrigin(0.5);

    const classMarker = this.add.text(8, -9, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "7px",
      color: "#ff4fa4",
    });
    classMarker.setOrigin(0.5);

    const cross = this.add.graphics();
    cross.lineStyle(3, 0xff3d5a, 0.92);
    cross.beginPath();
    cross.moveTo(-8, -9);
    cross.lineTo(8, 9);
    cross.moveTo(8, -9);
    cross.lineTo(-8, 9);
    cross.strokePath();
    cross.setVisible(false);

    container.add([frame, label, classMarker, cross]);
    container.setVisible(false);

    return {
      container,
      frame,
      label,
      classMarker,
      cross,
      homeX: x,
      homeY: y,
    };
  }

  private updateAttackQueueHud(): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    hud.container.setPosition(this.scale.width / 2, this.scale.height - 62);
    hud.preparePile.container.setPosition(54, this.scale.height - ArenaScene.cardPileBottomOffset);
    hud.shufflePile.container.setPosition(this.scale.width - 54, this.scale.height - ArenaScene.cardPileBottomOffset);
    const preparing = this.computeCycle.phase === "preparing";
    hud.border.setStrokeStyle(2, preparing ? 0xffcf66 : 0x60ffd3, preparing ? 0.84 : 0.72);
    hud.border.setFillStyle(preparing ? 0x1d1710 : 0x061016, 0.66);
    hud.phaseLabel.setText(
      preparing
        ? `PREPARING ${(this.computeCycle.preparingRemainingMs / 1000).toFixed(1)}s`
        : "",
    );
    hud.drawCount.setText(`DRAW ${this.computeCycle.drawPile.length}`);
    hud.discardCount.setText(`DISCARD ${this.computeCycle.discardPile.length}`);
    this.syncHudCards(hud.meleeCards, this.computeCycle.queues.melee, "melee", preparing);
    this.syncHudCards(hud.rangedCards, this.computeCycle.queues.ranged, "ranged", preparing);
    this.syncPreparePile(preparing);
  }

  private syncHudCards(
    views: HudCardView[],
    cards: AttackCard[],
    fallbackType: AttackCardType,
    preparing: boolean,
  ): void {
    views.forEach((view, index) => {
      const visible = index < cards.length;
      view.container.setVisible(visible);
      if (!visible) {
        this.tweens.killTweensOf(view.container);
        view.container.setPosition(view.homeX, view.homeY);
        view.container.setAngle(0);
        return;
      }

      const card = cards[index];
      const type = card?.type ?? fallbackType;
      const definition = card ? getAttackCardDefinition(card.id) : undefined;
      const special = definition?.cardClass === "special";
      const blocked = preparing || !this.canAffordAttackCard(card);
      const fill = type === "melee" ? 0xdffcf3 : 0xffcf66;
      view.label.setText(card ? getAttackCardDisplayName(card) : "");
      view.label.setColor(blocked ? "#7c8890" : "#071015");
      view.classMarker.setText(special ? "S" : "");
      view.classMarker.setColor(blocked ? "#b85a78" : "#ff4fa4");
      view.frame.setFillStyle(blocked ? 0x22313a : fill, blocked ? 0.72 : 1);
      view.frame.setStrokeStyle(2, blocked ? 0xff3d5a : special ? 0xff4fa4 : 0x071015, blocked || special ? 0.86 : 0.5);
      view.cross.setVisible(blocked);
    });
  }

  private destroyAttackQueueHud(): void {
    this.killAttackQueueHudTweens();
    this.attackQueueHud?.preparePile.container.destroy();
    this.attackQueueHud?.shufflePile.container.destroy();
    this.attackQueueHud?.container.destroy();
    this.attackQueueHud = undefined;
  }

  private killAttackQueueHudTweens(): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    this.tweens.killTweensOf([
      ...hud.meleeCards.map((card) => card.container),
      ...hud.rangedCards.map((card) => card.container),
      ...hud.preparePile.cards,
      ...hud.shufflePile.cards,
    ]);
  }

  private canAffordAttackCard(card?: AttackCard): boolean {
    if (!card) {
      return false;
    }

    return isAttackCardAffordable(card, {
      computeCurrent: gameState.computeCurrent,
      allotmentCurrent: gameState.allotmentCurrent,
      refundDiscountAttacksRemaining: this.computeCycle.refundDiscountAttacksRemaining,
    });
  }

  private setAttackCardRejectionNotice(label: "Statement" | "Function", reason?: AttackCardRejectionReason): void {
    if (reason === "rate-limit") {
      gameState.setNotice(`${label} denied. Insufficient Compute Rate Limit.`);
      return;
    }

    if (reason === "credits") {
      gameState.setNotice(`${label} denied. Insufficient Compute Credits.`);
      return;
    }

    gameState.setNotice(`${label} denied. Insufficient Compute Rate Limit and Compute Credits.`);
  }

  private syncPreparePile(preparing: boolean): void {
    const pile = this.attackQueueHud?.preparePile;
    if (!pile) {
      return;
    }

    if (!preparing) {
      if (pile.container.visible) {
        this.tweens.killTweensOf(pile.cards);
      }
      pile.container.setVisible(false);
      this.resetCardPile(pile);
      return;
    }

    if (pile.container.visible) {
      return;
    }

    pile.container.setVisible(true);
    this.resetCardPile(pile);
    pile.cards.forEach((card, index) => {
      this.tweens.add({
        targets: card,
        x: (index - 2.5) * 8,
        y: -Math.abs(index - 2.5) * 3,
        angle: (index - 2.5) * 9,
        duration: 420,
        delay: index * 36,
        ease: "Sine.easeInOut",
        yoyo: true,
        repeat: -1,
        repeatDelay: 120,
      });
    });
  }

  private resetCardPile(pile: CardPileView): void {
    pile.cards.forEach((card, index) => {
      card.setPosition(index * 2, -index * 2);
      card.setAngle(0);
      card.setAlpha(0.96);
    });
  }

  private animateDeal(): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    const cards = [...hud.meleeCards, ...hud.rangedCards]
      .filter((card) => card.container.visible)
      .sort((left, right) => left.homeX - right.homeX);
    const startX = -this.scale.width / 2 - 46;

    cards.forEach((card, index) => {
      this.tweens.killTweensOf(card.container);
      card.container.setPosition(startX - index * 10, card.homeY);
      card.container.setAngle(-9);
      this.tweens.add({
        targets: card.container,
        x: card.homeX,
        angle: 0,
        duration: 260,
        delay: index * 42,
        ease: "Cubic.easeOut",
      });
    });
  }

  private animateDealtAttackCard(type: AttackCardType, queueIndex: number): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    const card = (type === "melee" ? hud.meleeCards : hud.rangedCards)[queueIndex];
    if (!card || !card.container.visible) {
      return;
    }

    const startX = -this.scale.width / 2 - 46;
    this.tweens.killTweensOf(card.container);
    card.container.setPosition(startX, card.homeY);
    card.container.setAngle(-9);
    this.tweens.add({
      targets: card.container,
      x: card.homeX,
      angle: 0,
      duration: 260,
      ease: "Cubic.easeOut",
    });
  }

  private animateShufflePile(): void {
    const pile = this.attackQueueHud?.shufflePile;
    if (!pile) {
      return;
    }

    this.tweens.killTweensOf(pile.cards);
    pile.container.setVisible(true);
    this.resetCardPile(pile);
    pile.cards.forEach((card, index) => {
      this.tweens.add({
        targets: card,
        x: index % 2 === 0 ? -18 : 18,
        y: -index * 2,
        angle: index % 2 === 0 ? -16 : 16,
        alpha: 1,
        duration: 120,
        delay: index * 42,
        ease: "Sine.easeOut",
        yoyo: true,
        repeat: 3,
        onComplete: () => {
          if (index === pile.cards.length - 1) {
            pile.container.setVisible(false);
            this.resetCardPile(pile);
          }
        },
      });
    });
  }

  private animateCycleEndDiscard(): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    [...hud.meleeCards, ...hud.rangedCards].forEach((card, index) => {
      if (card.container.visible) {
        this.animateDiscardedCard(card, index * 24);
      }
    });
  }

  private animatePlayedCard(type: AttackCardType): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    const card = (type === "melee" ? hud.meleeCards : hud.rangedCards).find((view) => view.container.visible);
    if (card) {
      this.tweens.killTweensOf(card.container);
      this.animateDiscardedCard(card, 0);
    }
  }

  private animateDiscardedCard(card: HudCardView, delay: number): void {
    const hud = this.attackQueueHud;
    if (!hud) {
      return;
    }

    const flying = this.createFlyingHudCard(
      card.label.text,
      hud.container.x + card.container.x,
      hud.container.y + card.container.y,
      card.frame.fillColor,
      card.cross.visible,
    );
    const targetY = flying.y + Phaser.Math.Between(-12, 12);
    this.tweens.add({
      targets: flying,
      x: this.scale.width + 62,
      y: targetY,
      angle: 18,
      alpha: 0,
      duration: 280,
      delay,
      ease: "Cubic.easeIn",
      onComplete: () => flying.destroy(),
    });
  }

  private createFlyingHudCard(
    labelText: string,
    x: number,
    y: number,
    fillColor: number,
    crossed: boolean,
  ): Phaser.GameObjects.Container {
    const container = this.trackTransientVisual(this.add.container(x, y));
    container.setScrollFactor(0);
    container.setDepth(10_001);

    const frame = this.add.rectangle(0, 0, 24, 27, fillColor, crossed ? 0.72 : 1);
    frame.setStrokeStyle(2, crossed ? 0xff3d5a : 0x071015, crossed ? 0.86 : 0.5);
    const label = this.add.text(0, 0, labelText, {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "15px",
      color: crossed ? "#7c8890" : "#071015",
    });
    label.setOrigin(0.5);
    const cross = this.add.graphics();
    cross.lineStyle(3, 0xff3d5a, 0.92);
    cross.beginPath();
    cross.moveTo(-8, -9);
    cross.lineTo(8, 9);
    cross.moveTo(8, -9);
    cross.lineTo(-8, 9);
    cross.strokePath();
    cross.setVisible(crossed);

    container.add([frame, label, cross]);
    return container;
  }

  private cooldownForAction(action: AbilityAction): number {
    return ABILITY_COOLDOWNS_MS[action];
  }

  private cooldownIndicatorOffset(action: AbilityAction): Phaser.Math.Vector2 {
    if (action === "dash") return new Phaser.Math.Vector2(-44, -46);
    if (action === "melee") return new Phaser.Math.Vector2(0, -62);
    return new Phaser.Math.Vector2(44, -46);
  }

  private abilityShortLabel(action: AbilityAction): string {
    if (action === "dash") return "D";
    if (action === "melee") return "S";
    return "F";
  }

  private abilityLabel(action: AbilityAction): string {
    if (action === "dash") return "Dash";
    if (action === "melee") return "Statement";
    return "Function";
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    pointer.updateWorldPoint(this.cameras.main);

    if (pointer.rightButtonDown()) {
      this.tryRanged(pointer.worldX, pointer.worldY);
      return;
    }

    this.tryMelee(pointer.worldX, pointer.worldY);
  }

  private tryMelee(targetX: number, targetY: number): void {
    if (this.playerAttackTimer > 0 || this.rangedMovementPauseTimer > 0 || this.dashTimer > 0) {
      return;
    }

    if (this.computeCycle.phase !== "active") {
      gameState.setNotice("Statement unavailable. Cycle is preparing.");
      return;
    }

    if (this.computeCycle.queues.melee.length <= 0) {
      gameState.setNotice("Statement queue empty. End the Cycle or wait for the next draw.");
      return;
    }

    const attempt = this.resolveAbilityAttempt("melee", gameState.meleeCost);
    if (!attempt.allowed) {
      return;
    }

    const played = playAttackCard(this.computeCycle, "melee", {
      computeCurrent: gameState.computeCurrent,
      allotmentCurrent: gameState.allotmentCurrent,
      refundDiscountAttacksRemaining: this.computeCycle.refundDiscountAttacksRemaining,
    });
    if (!played.played || !played.card) {
      this.setAttackCardRejectionNotice("Statement", played.rejectionReason);
      return;
    }

    const cardDefinition = getAttackCardDefinition(played.card.id);
    const cardCost = getDiscountedAttackCost(played.card, this.computeCycle.refundDiscountAttacksRemaining);
    if (!gameState.canUseAbility(cardCost)) {
      this.setAttackCardRejectionNotice("Statement", played.rejectionReason);
      return;
    }

    if (!gameState.spend(cardCost)) {
      gameState.setNotice("Statement impulse denied. Not enough Compute remains.");
      return;
    }

    this.animatePlayedCard("melee");
    this.computeCycle = played.state;
    this.completeAbilityAttempt("melee", attempt, cardDefinition?.cooldownMs);
    const aimVector = new Phaser.Math.Vector2(targetX - this.player.x, targetY - this.player.y);
    this.playerFacing = this.directionFromVector(
      aimVector,
      this.playerFacing,
    );
    const swingAngle = this.angleForDirection(this.playerFacing);
    this.playerAttackTimer = ArenaScene.meleeAttackLockDuration;
    this.playPlayerAnimation("attack", this.playerFacing);
    const slash = this.trackTransientVisual(this.add.image(
      this.player.x + Math.cos(swingAngle) * 54,
      this.player.y + Math.sin(swingAngle) * 36,
      "qf-slash",
    ));
    slash.setRotation(swingAngle);
    slash.setDepth(this.player.y + 30);
    slash.setAlpha(0.72);
    slash.setScale(1.32);

    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: { from: 1.32, to: 1.58 },
      duration: 110,
      onComplete: () => slash.destroy(),
    });

    this.drones.forEach((drone) => {
      const offset = new Phaser.Math.Vector2(drone.sprite.x - this.player.x, drone.sprite.y - this.player.y);
      const distance = offset.length();
      const droneAngle = Phaser.Math.Angle.Between(
        this.player.x,
        this.player.y,
        drone.sprite.x,
        drone.sprite.y,
      );
      const delta = Math.abs(Phaser.Math.Angle.Wrap(droneAngle - swingAngle));
      const forwardReach = offset.dot(new Phaser.Math.Vector2(Math.cos(swingAngle), Math.sin(swingAngle)));

      if (distance <= ArenaScene.meleeRange && forwardReach > -18 && delta <= 1.08) {
        this.hitDrone(drone, cardDefinition?.damage ?? MELEE_DAMAGE, swingAngle, 250, ArenaScene.meleeStunDuration);
      }
    });

    if (played.card.id === "trim") {
      const drawn = drawBonusAttackCard(this.computeCycle);
      this.computeCycle = drawn.state;
      const drawnQueueIndex = drawn.card
        ? this.computeCycle.queues[drawn.card.type].length - 1
        : -1;
      this.updateAttackQueueHud();
      if (drawn.shuffled) {
        this.animateShufflePile();
      }
      if (drawn.drew && drawn.card) {
        this.animateDealtAttackCard(drawn.card.type, drawnQueueIndex);
      }
    }
  }

  private angleForDirection(direction: SpriteDirection): number {
    const angles: Record<SpriteDirection, number> = {
      e: 0,
      se: Math.PI / 4,
      s: Math.PI / 2,
      sw: (Math.PI * 3) / 4,
      w: Math.PI,
      nw: (-Math.PI * 3) / 4,
      n: -Math.PI / 2,
      ne: -Math.PI / 4,
    };

    return angles[direction];
  }

  private tryRanged(targetX: number, targetY: number): void {
    if (this.playerAttackTimer > 0 || this.dashTimer > 0 || this.rangedMovementPauseTimer > 0) {
      return;
    }

    if (this.computeCycle.phase !== "active") {
      gameState.setNotice("Function unavailable. Cycle is preparing.");
      return;
    }

    if (this.computeCycle.queues.ranged.length <= 0) {
      gameState.setNotice("Function queue empty. End the Cycle or wait for the next draw.");
      return;
    }

    const attempt = this.resolveAbilityAttempt("ranged", gameState.rangedCost);
    if (!attempt.allowed) {
      return;
    }

    const played = playAttackCard(this.computeCycle, "ranged", {
      computeCurrent: gameState.computeCurrent,
      allotmentCurrent: gameState.allotmentCurrent,
      refundDiscountAttacksRemaining: this.computeCycle.refundDiscountAttacksRemaining,
    });
    if (!played.played || !played.card) {
      this.setAttackCardRejectionNotice("Function", played.rejectionReason);
      return;
    }

    const cardDefinition = getAttackCardDefinition(played.card.id);
    const cardCost = getDiscountedAttackCost(played.card, this.computeCycle.refundDiscountAttacksRemaining);
    if (!gameState.canUseAbility(cardCost)) {
      this.setAttackCardRejectionNotice("Function", played.rejectionReason);
      return;
    }

    if (!gameState.spend(cardCost)) {
      gameState.setNotice("Function cast rejected. Not enough Compute remains.");
      return;
    }

    this.animatePlayedCard("ranged");
    this.computeCycle = played.state;
    this.completeAbilityAttempt("ranged", attempt, cardDefinition?.cooldownMs);
    if (played.card.id === "refund") {
      this.computeCycle = activateRefundDiscount(this.computeCycle);
      this.createRefundVisual();
      gameState.setNotice(
        `Refund armed. Next ${REFUND_DISCOUNT_ATTACKS} attacks this Active Window cost -${REFUND_DISCOUNT_AMOUNT} Compute.`,
      );
      this.updateAttackQueueHud();
      return;
    }

    this.rangedMovementPauseTimer = ArenaScene.rangedMovementPauseDuration;
    this.velocity.set(0, 0);
    this.player.setVelocity(0, 0);

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
    this.playerFacing = this.directionFromVector(
      new Phaser.Math.Vector2(targetX - this.player.x, targetY - this.player.y),
      this.playerFacing,
    );
    this.playerAttackTimer = ArenaScene.rangedAttackAnimationDuration;
    this.playPlayerAnimation("attack", this.playerFacing);
    const sprite = this.physics.add.image(
      this.player.x + Math.cos(angle) * 28,
      this.player.y + Math.sin(angle) * 28,
      "qf-bolt",
    );
    sprite.setRotation(angle);
    sprite.setDepth(this.player.y + 20);

    const velocity = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle)).scale(RANGED_PROJECTILE_SPEED);
    sprite.setVelocity(velocity.x, velocity.y);

    this.projectiles.push({
      type: "function",
      sprite,
      velocity,
      ttl: 1.2,
      damage: RANGED_DIRECT_DAMAGE,
      hitRadius: 24,
    });

  }

  private createRefundVisual(): void {
    const pulse = this.trackTransientVisual(this.add.circle(this.player.x, this.player.y - 16, 34, 0x60ffd3, 0.08));
    pulse.setStrokeStyle(2, 0x60ffd3, 0.7);
    pulse.setDepth(this.player.y + 34);

    const label = this.trackTransientVisual(this.add.text(
      this.player.x,
      this.player.y - 62,
      `-${REFUND_DISCOUNT_AMOUNT} x${REFUND_DISCOUNT_ATTACKS}`,
      {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "12px",
        color: "#c9fff0",
        stroke: "#071015",
        strokeThickness: 4,
      },
    ));
    label.setOrigin(0.5);
    label.setDepth(this.player.y + 36);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 1, to: 1.35 },
      duration: 320,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 20,
      duration: 560,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private hitDrone(
    drone: EnemyUnit,
    damage: number,
    angle: number,
    force: number,
    stunDuration = 0,
  ): void {
    drone.hp -= damage;
    drone.sprite.setVelocity(
      Math.cos(angle) * force,
      Math.sin(angle) * force,
    );

    const shouldApplyStun = stunDuration > 0 && !(drone.type === "hopper" && drone.hopTimer > 0);

    if (shouldApplyStun) {
      drone.stunTimer = Math.max(drone.stunTimer, stunDuration);
      drone.attackTimer = Math.max(drone.attackTimer, stunDuration);
      drone.lungeWindupTimer = 0;
      drone.lungeTimer = 0;
      drone.lungeCooldown = Math.max(drone.lungeCooldown, 0.45);
      drone.hopWindupTimer = 0;
      drone.shotWindupTimer = 0;
      drone.shotCooldown = Math.max(drone.shotCooldown, 0.45);
      this.clearDroneLungeTelegraph(drone);
      this.clearHopperShotTelegraph(drone);
    }

    this.tweens.add({
      targets: drone.sprite,
      alpha: { from: 0.62, to: 1 },
      duration: 120,
      yoyo: true,
    });

    if (drone.hp <= 0) {
      this.destroyDroneRuntime(drone);
      this.drones = this.drones.filter((candidate) => candidate !== drone);
      gameState.registerKill();
    }
  }

  private applyRangedSiphonImpact(impactX: number, impactY: number, impacted: EnemyUnit): void {
    const affected = this.drones.filter((drone) => {
      const distance = Phaser.Math.Distance.Between(impactX, impactY, drone.sprite.x, drone.sprite.y);
      return distance <= RANGED_PULL_RADIUS;
    });

    affected.forEach((drone) => {
      if (drone !== impacted) {
        const splashAngle = Phaser.Math.Angle.Between(impactX, impactY, drone.sprite.x, drone.sprite.y);
        this.pullDroneTowardPoint(drone, impactX, impactY, RANGED_PULL_FORCE);
        this.hitDrone(drone, RANGED_SPLASH_DAMAGE, splashAngle, 0);
      }
    });

    const refunded = gameState.refundAllotment(calculateRangedSiphonRefund(affected.length));
    this.createRangedSiphonVisual(impactX, impactY, refunded);
    if (refunded > 0) {
      gameState.setNotice(`Function siphon +${refunded} Compute Credits.`);
    }
  }

  private pullDroneTowardPoint(drone: EnemyUnit, targetX: number, targetY: number, force: number): void {
    const body = drone.sprite.body as Phaser.Physics.Arcade.Body;
    if (!body) {
      return;
    }

    const toImpact = new Phaser.Math.Vector2(targetX - drone.sprite.x, targetY - drone.sprite.y);
    const distance = toImpact.length();
    if (distance <= 0.001) {
      return;
    }

    const pull = toImpact.scale(1 / distance).scale(force);
    body.velocity.x += pull.x;
    body.velocity.y += pull.y;
  }

  private createRangedSiphonVisual(impactX: number, impactY: number, refunded: number): void {
    const pulse = this.trackTransientVisual(this.add.circle(impactX, impactY, RANGED_PULL_RADIUS, 0x60ffd3, 0.05));
    pulse.setStrokeStyle(2, 0x60ffd3, 0.65);
    pulse.setDepth(impactY + 18);

    const inner = this.trackTransientVisual(this.add.circle(impactX, impactY, 8, 0xe7fff8, 0.12));
    inner.setStrokeStyle(1, 0xe7fff8, 0.42);
    inner.setDepth(impactY + 19);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 0.72, to: 1 },
      duration: 220,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
    this.tweens.add({
      targets: inner,
      alpha: 0,
      scale: { from: 1.1, to: 0.55 },
      duration: 220,
      ease: "Sine.easeOut",
      onComplete: () => inner.destroy(),
    });

    if (refunded <= 0) {
      return;
    }

    const label = this.trackTransientVisual(this.add.text(impactX, impactY - 24, `+${refunded} CC`, {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "10px",
      color: "#cffff6",
      backgroundColor: "rgba(7, 16, 23, 0.72)",
      padding: { left: 5, right: 5, top: 2, bottom: 2 },
    }));
    label.setOrigin(0.5);
    label.setDepth(impactY + 20);

    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 18,
      duration: 420,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private advanceComputeCycleState(deltaMs: number): void {
    if (this.computeCycle.phase !== "preparing") {
      return;
    }

    const drawCountBefore = this.computeCycle.drawPile.length;
    const discardCountBefore = this.computeCycle.discardPile.length;
    const queuedBefore = this.computeCycle.queues.melee.length + this.computeCycle.queues.ranged.length;
    this.computeCycle = advanceComputeCycle(this.computeCycle, deltaMs, gameState.computeMax);
    if (this.computeCycle.phase === "active") {
      gameState.computeCurrent = Math.min(gameState.computeMax, Math.max(0, gameState.allotmentCurrent));
      gameState.setNotice("Cycle active. Attack queues authorized.");
      this.updateAttackQueueHud();
      if (discardCountBefore > 0 && drawCountBefore < this.computeCycle.queueLimit - queuedBefore) {
        this.animateShufflePile();
      }
      this.animateDeal();
    }
  }

  private tryRequestCycleEnd(): void {
    if (this.computeCycle.phase !== "active" || this.hasCommittedAction()) {
      return;
    }

    this.endCurrentActiveWindow("Cycle ended by operator request.");
  }

  private checkAutomaticCycleEnd(): void {
    if (!shouldEndActiveWindow(this.computeCycle, {
      computeCurrent: gameState.computeCurrent,
      allotmentCurrent: gameState.allotmentCurrent,
      refundDiscountAttacksRemaining: this.computeCycle.refundDiscountAttacksRemaining,
      meleeCost: gameState.meleeCost,
      rangedCost: gameState.rangedCost,
      cooldowns: {
        melee: this.cooldownRemainingMs.melee,
        ranged: this.cooldownRemainingMs.ranged,
      },
      attackCommitted: this.hasCommittedAttack(),
    })) {
      return;
    }

    this.endCurrentActiveWindow("Cycle preparing. Attack queues discarded.");
  }

  private endCurrentActiveWindow(message: string): void {
    if (this.computeCycle.phase !== "active") {
      return;
    }

    this.animateCycleEndDiscard();
    this.computeCycle = endActiveWindow(this.computeCycle);
    gameState.setNotice(message);
    this.updateAttackQueueHud();
  }

  private hasCommittedAttack(): boolean {
    return this.playerAttackTimer > 0 || this.rangedMovementPauseTimer > 0;
  }

  private hasCommittedAction(): boolean {
    return this.hasCommittedAttack() || this.dashTimer > 0 || Boolean(this.collapsePlayback);
  }

  private updateDrones(dt: number): boolean {
    for (const drone of this.drones) {
      drone.playerCollider.active = !this.isPlayerInvulnerable();

      if (drone.type === "hopper") {
        if (this.updateHopper(drone, dt)) {
          return true;
        }
        continue;
      }

      const toPlayer = new Phaser.Math.Vector2(this.player.x - drone.sprite.x, this.player.y - drone.sprite.y);
      const distance = toPlayer.length();
      const direction = distance > 0.001
        ? toPlayer.clone().scale(1 / distance)
        : drone.lungeDirection.clone();
      const orbit = new Phaser.Math.Vector2(-direction.y, direction.x).scale(
        Math.sin(this.timelineTimeMs * 0.0018 + drone.orbitSeed) * 46,
      );
      const body = drone.sprite.body as Phaser.Physics.Arcade.Body;

      if (drone.stunTimer > 0) {
        drone.stunTimer = Math.max(0, drone.stunTimer - dt);
        drone.lungeWindupTimer = 0;
        drone.lungeTimer = 0;
        this.clearDroneLungeTelegraph(drone);
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.24);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.24);
        drone.sprite.setTint(0x60ffd3);
      } else {
        drone.lungeCooldown = Math.max(0, drone.lungeCooldown - dt);
        if (drone.lungeWindupTimer > 0) {
          drone.lungeWindupTimer = Math.max(0, drone.lungeWindupTimer - dt);
          body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.18);
          body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.18);
          drone.sprite.setTint(0xffcf66);
          this.updateDroneLungeTelegraph(drone);

          if (drone.lungeWindupTimer <= 0) {
            this.clearDroneLungeTelegraph(drone);
            drone.lungeTimer = ArenaScene.droneLungeDuration;
            drone.lungeCooldown = ArenaScene.droneLungeCooldown;
            drone.attackTimer = 0.24;
          }
        } else if (drone.lungeTimer > 0) {
          drone.lungeTimer = Math.max(0, drone.lungeTimer - dt);
          const lungeVelocity = drone.lungeDirection
            .clone()
            .scale(ArenaScene.droneLungeSpeed * ArenaScene.combatSpeedMultiplier);
          body.velocity.x = lungeVelocity.x;
          body.velocity.y = lungeVelocity.y;
          drone.sprite.setTint(0xff4fa4);
        } else if (
          drone.lungeCooldown <= 0 &&
          distance >= ArenaScene.droneLungeMinRange &&
          distance <= ArenaScene.droneLungeMaxRange
        ) {
          drone.lungeDirection.copy(direction);
          drone.lungeWindupTimer = ArenaScene.droneLungeWindupDuration;
          drone.attackTimer = ArenaScene.droneLungeWindupDuration;
          this.createDroneLungeTelegraph(drone);
          body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.18);
          body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.18);
        } else {
          const desired = direction
            .clone()
            .scale(
              (distance > 58 ? ArenaScene.droneChaseSpeed : ArenaScene.droneCloseSpeed) *
                ArenaScene.combatSpeedMultiplier,
            )
            .add(orbit);

          body.velocity.x = Phaser.Math.Linear(
            body.velocity.x,
            desired.x,
            0.06,
          );
          body.velocity.y = Phaser.Math.Linear(
            body.velocity.y,
            desired.y,
            0.06,
          );
          drone.sprite.clearTint();
        }
      }

      if (drone.touchCooldown > 0) {
        drone.touchCooldown = Math.max(0, drone.touchCooldown - dt);
      }
      drone.attackTimer = Math.max(0, drone.attackTimer - dt);

      if (
        distance < 46 &&
        drone.touchCooldown <= 0 &&
        drone.stunTimer <= 0 &&
        !this.isPlayerInvulnerable()
      ) {
        drone.touchCooldown = 0.9;
        drone.attackTimer = 0.26;
        const died = gameState.applyDamage(drone.lungeTimer > 0 ? 18 : 14);
        this.cameras.main.shake(130, 0.0035);

        if (died) {
          if (this.tryCollapse()) {
            return true;
          }

          this.beginDeathSequence(
            "decommissioned",
            "Integrity collapse. The corporations reclaimed your body from the arena floor.",
          );
          return true;
        }
      }

      drone.shadow.setPosition(drone.sprite.x, drone.sprite.y + 16);
      drone.shadow.setDepth(drone.sprite.y - 12);
      drone.sprite.setDepth(drone.sprite.y + 5);
      drone.sprite.setAngle(Math.sin(this.timelineTimeMs * 0.004 + drone.orbitSeed) * 5);
      const droneDirection = this.directionFromVector(body.velocity, "s");
      const droneAction: SpriteAction = drone.attackTimer > 0 ? "attack" : body.velocity.lengthSq() > 400 ? "run" : "idle";
      drone.sprite.play(spriteAnimationKey("drone", droneAction, droneDirection), true);
    }

    return false;
  }

  private updateHopper(hopper: EnemyUnit, dt: number): boolean {
    const body = hopper.sprite.body as Phaser.Physics.Arcade.Body;
    const toPlayer = new Phaser.Math.Vector2(this.player.x - hopper.sprite.x, this.player.y - hopper.sprite.y);
    const distance = toPlayer.length();
    const directionToPlayer = distance > 0.001
      ? toPlayer.clone().scale(1 / distance)
      : new Phaser.Math.Vector2(1, 0);

    if (hopper.stunTimer > 0) {
      hopper.stunTimer = Math.max(0, hopper.stunTimer - dt);
      hopper.hopWindupTimer = 0;
      hopper.hopTimer = 0;
      hopper.shotWindupTimer = 0;
      this.clearHopperShotTelegraph(hopper);
      body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.24);
      body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.24);
      hopper.sprite.setTint(0x60ffd3);
    } else {
      hopper.hopCooldown = Math.max(0, hopper.hopCooldown - dt);
      hopper.shotCooldown = Math.max(0, hopper.shotCooldown - dt);
      hopper.landingRecoveryTimer = Math.max(0, hopper.landingRecoveryTimer - dt);

      if (hopper.shotWindupTimer > 0) {
        hopper.shotWindupTimer = Math.max(0, hopper.shotWindupTimer - dt);
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.2);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.2);
        hopper.sprite.setTint(0xff6b35);
        this.updateHopperShotTelegraph(hopper);

        if (hopper.shotWindupTimer <= 0) {
          this.fireHopperShot(hopper);
          this.clearHopperShotTelegraph(hopper);
          hopper.shotCooldown = ArenaScene.hopperShotCooldown;
          hopper.attackTimer = 0.2;
        }
      } else if (hopper.hopWindupTimer > 0) {
        hopper.hopWindupTimer = Math.max(0, hopper.hopWindupTimer - dt);
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.2);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.2);
        hopper.sprite.setTint(0xffcf66);
        hopper.sprite.setScale(ACTOR_DISPLAY_SCALE * 1.04, ACTOR_DISPLAY_SCALE * 0.84);

        if (hopper.hopWindupTimer <= 0) {
          hopper.hopTimer = ArenaScene.hopperHopDuration;
          hopper.hopCooldown = ArenaScene.hopperHopCooldown;
          hopper.attackTimer = 0.18;
        }
      } else if (hopper.hopTimer > 0) {
        hopper.hopTimer = Math.max(0, hopper.hopTimer - dt * ArenaScene.combatSpeedMultiplier);
        const hopVelocity = hopper.hopDirection
          .clone()
          .scale(hopper.hopDistance ?? ArenaScene.hopperMaxHopDistance)
          .scale(ArenaScene.combatSpeedMultiplier / ArenaScene.hopperHopDuration);
        body.velocity.x = hopVelocity.x;
        body.velocity.y = hopVelocity.y;
        hopper.sprite.setTint(0xffd166);
        hopper.sprite.setScale(ACTOR_DISPLAY_SCALE * 0.9, ACTOR_DISPLAY_SCALE * 1.12);

        if (hopper.hopTimer <= 0) {
          hopper.landingRecoveryTimer = ArenaScene.hopperLandingRecoveryDuration;
        }
      } else if (hopper.landingRecoveryTimer > 0) {
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.16);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.16);
        hopper.sprite.setTint(0xffffff);
        hopper.sprite.setScale(ACTOR_DISPLAY_SCALE * 0.88);
      } else if (distance < ArenaScene.hopperPreferredMinRange && hopper.hopCooldown <= 0) {
        this.beginHopperHop(hopper, directionToPlayer.clone().negate());
      } else if (
        distance >= ArenaScene.hopperPreferredMinRange &&
        distance <= ArenaScene.hopperPreferredMaxRange &&
        hopper.shotCooldown <= 0
      ) {
        hopper.lockedShotDirection.copy(directionToPlayer);
        hopper.shotWindupTimer = ArenaScene.hopperShotWindupDuration;
        hopper.attackTimer = ArenaScene.hopperShotWindupDuration;
        this.createHopperShotTelegraph(hopper);
      } else if (hopper.hopCooldown <= 0) {
        const baseDirection = distance > ArenaScene.hopperApproachRange
          ? directionToPlayer
          : new Phaser.Math.Vector2(-directionToPlayer.y, directionToPlayer.x).scale(
              Math.sin(this.timelineTimeMs * 0.002 + hopper.orbitSeed) >= 0 ? 1 : -1,
            );
        this.beginHopperHop(hopper, baseDirection);
      } else {
        body.velocity.x = Phaser.Math.Linear(body.velocity.x, 0, 0.08);
        body.velocity.y = Phaser.Math.Linear(body.velocity.y, 0, 0.08);
        hopper.sprite.setTint(0xffc857);
        hopper.sprite.setScale(ACTOR_DISPLAY_SCALE * 0.88);
      }
    }

    if (hopper.touchCooldown > 0) {
      hopper.touchCooldown = Math.max(0, hopper.touchCooldown - dt);
    }
    hopper.attackTimer = Math.max(0, hopper.attackTimer - dt);

    if (
      distance < 42 &&
      hopper.touchCooldown <= 0 &&
      hopper.stunTimer <= 0 &&
      !this.isPlayerInvulnerable()
    ) {
      hopper.touchCooldown = ArenaScene.hopperTouchCooldown;
      hopper.attackTimer = 0.2;
      const died = gameState.applyDamage(HOPPER_TOUCH_DAMAGE);
      this.cameras.main.shake(110, 0.0028);

      if (died) {
        if (this.tryCollapse()) {
          return true;
        }

        this.beginDeathSequence(
          "decommissioned",
          "Integrity collapse. The corporations reclaimed your body from the arena floor.",
        );
        return true;
      }
    }

    hopper.shadow.setPosition(hopper.sprite.x, hopper.sprite.y + 16);
    hopper.shadow.setDepth(hopper.sprite.y - 12);
    hopper.sprite.setDepth(hopper.sprite.y + 5);
    hopper.sprite.setAngle(Math.sin(this.timelineTimeMs * 0.006 + hopper.orbitSeed) * 7);
    const hopperDirection = this.directionFromVector(body.velocity, "s");
    const hopperAction: SpriteAction = hopper.attackTimer > 0 ? "attack" : body.velocity.lengthSq() > 400 ? "run" : "idle";
    hopper.sprite.play(spriteAnimationKey("hopper", hopperAction, hopperDirection), true);

    return false;
  }

  private beginHopperHop(hopper: EnemyUnit, baseDirection: Phaser.Math.Vector2): void {
    const direction = baseDirection.lengthSq() > 0.001
      ? baseDirection.clone().normalize()
      : new Phaser.Math.Vector2(1, 0);
    const offset = Phaser.Math.FloatBetween(-0.34, 0.34);
    direction.rotate(offset);
    const distance = Phaser.Math.Between(ArenaScene.hopperMinHopDistance, ArenaScene.hopperMaxHopDistance);
    const landingX = hopper.sprite.x + direction.x * distance;
    const landingY = hopper.sprite.y + direction.y * distance;

    if (
      landingX < ArenaScene.hopperWallMargin ||
      landingY < ArenaScene.hopperWallMargin ||
      landingX > this.arenaWidth - ArenaScene.hopperWallMargin ||
      landingY > this.arenaHeight - ArenaScene.hopperWallMargin
    ) {
      const escape = this.chooseHopperEscapeDirection(hopper, direction);
      direction.copy(escape);
    }

    hopper.hopDirection.copy(direction.normalize());
    hopper.hopDistance = distance;
    hopper.hopWindupTimer = ArenaScene.hopperHopWindupDuration;
    hopper.attackTimer = ArenaScene.hopperHopWindupDuration;
  }

  private chooseHopperEscapeDirection(hopper: EnemyUnit, fallback: Phaser.Math.Vector2): Phaser.Math.Vector2 {
    const awayFromWall = new Phaser.Math.Vector2(0, 0);
    if (hopper.sprite.x < ArenaScene.hopperWallMargin * 2) awayFromWall.x += 1;
    if (hopper.sprite.x > this.arenaWidth - ArenaScene.hopperWallMargin * 2) awayFromWall.x -= 1;
    if (hopper.sprite.y < ArenaScene.hopperWallMargin * 2) awayFromWall.y += 1;
    if (hopper.sprite.y > this.arenaHeight - ArenaScene.hopperWallMargin * 2) awayFromWall.y -= 1;

    const toPlayer = new Phaser.Math.Vector2(this.player.x - hopper.sprite.x, this.player.y - hopper.sprite.y);
    const acrossPlayer = toPlayer.lengthSq() > 0.001
      ? toPlayer.normalize()
      : fallback.clone();
    const candidate = awayFromWall.lengthSq() > 0.001
      ? awayFromWall.normalize().add(acrossPlayer.scale(0.65))
      : acrossPlayer;

    if (candidate.lengthSq() <= 0.001) {
      return fallback.clone().normalize();
    }

    return candidate.normalize();
  }

  private fireHopperShot(hopper: EnemyUnit): void {
    const direction = hopper.lockedShotDirection.lengthSq() > 0.001
      ? hopper.lockedShotDirection.clone().normalize()
      : new Phaser.Math.Vector2(1, 0);
    const angle = Math.atan2(direction.y, direction.x);
    const sprite = this.physics.add.image(
      hopper.sprite.x + direction.x * 30,
      hopper.sprite.y + direction.y * 24,
      "qf-bolt",
    );
    sprite.setTint(0xff6b35);
    sprite.setRotation(angle);
    sprite.setDepth(hopper.sprite.y + 20);

    const velocity = direction.scale(HOPPER_CHARGED_SHOT_SPEED);
    sprite.setVelocity(velocity.x, velocity.y);

    this.projectiles.push({
      type: "hopper-shot",
      sprite,
      velocity,
      ttl: 2.2,
      damage: HOPPER_CHARGED_SHOT_DAMAGE,
      hitRadius: HOPPER_CHARGED_SHOT_HIT_RADIUS,
    });
  }

  private createHopperShotTelegraph(hopper: EnemyUnit): void {
    this.clearHopperShotTelegraph(hopper);
    hopper.hopperShotTelegraph = this.add.rectangle(
      hopper.sprite.x,
      hopper.sprite.y,
      260,
      4,
      0xff6b35,
      0.34,
    );
    hopper.hopperShotTelegraph.setOrigin(0, 0.5);
    hopper.hopperShotTelegraph.setDepth(hopper.sprite.depth - 2);
    hopper.hopperShotGlow = this.add.circle(hopper.sprite.x, hopper.sprite.y, 30, 0xff3d1f, 0.08);
    hopper.hopperShotGlow.setStrokeStyle(2, 0xff6b35, 0.58);
    hopper.hopperShotGlow.setDepth(hopper.sprite.depth - 1);
    this.updateHopperShotTelegraph(hopper);
  }

  private updateHopperShotTelegraph(hopper: EnemyUnit): void {
    if (!hopper.hopperShotTelegraph || !hopper.hopperShotGlow) {
      return;
    }

    const direction = hopper.lockedShotDirection;
    const progress = 1 - hopper.shotWindupTimer / ArenaScene.hopperShotWindupDuration;
    hopper.hopperShotTelegraph.setPosition(
      hopper.sprite.x + direction.x * 26,
      hopper.sprite.y + direction.y * 26,
    );
    hopper.hopperShotTelegraph.setRotation(Math.atan2(direction.y, direction.x));
    hopper.hopperShotTelegraph.setAlpha(0.28 + progress * 0.48);
    hopper.hopperShotTelegraph.setDisplaySize(220 + progress * 80, 4 + progress * 5);
    hopper.hopperShotTelegraph.setDepth(hopper.sprite.depth - 2);
    hopper.hopperShotGlow.setPosition(hopper.sprite.x, hopper.sprite.y);
    hopper.hopperShotGlow.setScale(1 + progress * 0.45);
    hopper.hopperShotGlow.setAlpha(0.08 + progress * 0.2);
    hopper.hopperShotGlow.setDepth(hopper.sprite.depth - 1);
  }

  private clearHopperShotTelegraph(hopper: EnemyUnit): void {
    hopper.hopperShotTelegraph?.destroy();
    hopper.hopperShotTelegraph = undefined;
    hopper.hopperShotGlow?.destroy();
    hopper.hopperShotGlow = undefined;
  }

  private createDroneLungeTelegraph(drone: EnemyUnit): void {
    this.clearDroneLungeTelegraph(drone);
    drone.lungeTelegraph = this.add.rectangle(
      drone.sprite.x,
      drone.sprite.y,
      178,
      5,
      0xff4fa4,
      0.42,
    );
    drone.lungeTelegraph.setOrigin(0, 0.5);
    drone.lungeTelegraph.setDepth(drone.sprite.depth - 2);
    this.updateDroneLungeTelegraph(drone);
  }

  private updateDroneLungeTelegraph(drone: EnemyUnit): void {
    if (!drone.lungeTelegraph) {
      return;
    }

    const direction = drone.lungeDirection;
    const progress = 1 - drone.lungeWindupTimer / ArenaScene.droneLungeWindupDuration;
    drone.lungeTelegraph.setPosition(
      drone.sprite.x + direction.x * 30,
      drone.sprite.y + direction.y * 30,
    );
    drone.lungeTelegraph.setRotation(Math.atan2(direction.y, direction.x));
    drone.lungeTelegraph.setAlpha(0.26 + progress * 0.42);
    drone.lungeTelegraph.setDisplaySize(160 + progress * 36, 4 + progress * 4);
    drone.lungeTelegraph.setDepth(drone.sprite.depth - 2);
  }

  private clearDroneLungeTelegraph(drone: EnemyUnit): void {
    drone.lungeTelegraph?.destroy();
    drone.lungeTelegraph = undefined;
  }

  private isPlayerInvulnerable(): boolean {
    return this.dashInvulnerabilityTimer > 0;
  }

  private moveTowards(current: number, target: number, maxDelta: number): number {
    if (Math.abs(target - current) <= maxDelta) {
      return target;
    }

    return current + Math.sign(target - current) * maxDelta;
  }

  private updateProjectiles(dt: number): void {
    const survivors: Projectile[] = [];

    this.projectiles.forEach((projectile) => {
      projectile.ttl -= dt;

      if (projectile.ttl <= 0) {
        projectile.sprite.destroy();
        return;
      }

      if (
        projectile.sprite.x < 0 ||
        projectile.sprite.y < 0 ||
        projectile.sprite.x > this.arenaWidth ||
        projectile.sprite.y > this.arenaHeight
      ) {
        projectile.sprite.destroy();
        return;
      }

      if (projectile.type === "hopper-shot") {
        const playerDistance = Phaser.Math.Distance.Between(
          projectile.sprite.x,
          projectile.sprite.y,
          this.player.x,
          this.player.y,
        );

        if (playerDistance <= projectile.hitRadius + 18) {
          const wasInvulnerable = this.isPlayerInvulnerable();
          const impactX = projectile.sprite.x;
          const impactY = projectile.sprite.y;
          projectile.sprite.destroy();

          if (wasInvulnerable) {
            this.createHopperShotDissipateVisual(impactX, impactY);
            return;
          }

          const died = gameState.applyDamage(projectile.damage);
          this.cameras.main.shake(130, 0.0032);
          if (died) {
            if (this.tryCollapse()) {
              return;
            }

            this.beginDeathSequence(
              "decommissioned",
              "Integrity collapse. The corporations reclaimed your body from the arena floor.",
            );
          }
          return;
        }

        survivors.push(projectile);
        return;
      }

      const impacted = this.drones.find((drone) => {
        const distance = Phaser.Math.Distance.Between(
          projectile.sprite.x,
          projectile.sprite.y,
          drone.sprite.x,
          drone.sprite.y,
        );
        return distance < 24;
      });

      if (impacted) {
        const angle = Math.atan2(projectile.velocity.y, projectile.velocity.x);
        const impactX = projectile.sprite.x;
        const impactY = projectile.sprite.y;
        this.applyRangedSiphonImpact(impactX, impactY, impacted);
        this.hitDrone(impacted, projectile.damage, angle, 180);
        projectile.sprite.destroy();
        return;
      }

      survivors.push(projectile);
    });

    this.projectiles = survivors;
  }

  private createHopperShotDissipateVisual(x: number, y: number): void {
    const pulse = this.trackTransientVisual(this.add.circle(x, y, 12, 0xffcf66, 0.12));
    pulse.setStrokeStyle(2, 0xff6b35, 0.72);
    pulse.setDepth(y + 22);
    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 1, to: 1.8 },
      duration: 180,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private updateVisuals(): void {
    const severity = gameState.getVisionBlurStrength();
    this.updatePreparingBorder();
    this.updateRefundAura();
    if (this.blurFilter) {
      if (severity <= 0) {
        this.blurFilter.strength = 0;
        this.blurFilter.x = 0;
        this.blurFilter.y = 0;
        this.blurFilter.steps = 1;
      } else {
        this.blurFilter.strength = severity * 0.95;
        this.blurFilter.x = 0.8 + severity * 2.4;
        this.blurFilter.y = 0.8 + severity * 2.4;
        this.blurFilter.steps = severity > 0.7 ? 4 : 2;
      }
    }

    this.enemyCountLabel?.setText(
      `Round ${(gameState.roundsFinished + 1).toString().padStart(2, "0")} // Enemies ${this.drones.length.toString().padStart(2, "0")} // Gate ${
        this.arenaCleared ? "Open" : "Conditional"
      }`,
    );
  }

  private updateRefundAura(): void {
    const charges = Phaser.Math.Clamp(this.computeCycle.refundDiscountAttacksRemaining, 0, REFUND_DISCOUNT_ATTACKS);
    const aura = this.refundAura ?? this.createRefundAura();
    this.refundAura = aura;

    if (charges < aura.previousCharges) {
      this.createRefundAuraFadePulse(aura.previousCharges);
    } else if (charges > aura.previousCharges) {
      this.createRefundAuraIgnitionPulse();
    }

    aura.previousCharges = charges;
    aura.container.setVisible(charges > 0);
    if (charges <= 0) {
      return;
    }

    const time = this.timelineTimeMs / 1000;
    const intensity = charges / REFUND_DISCOUNT_ATTACKS;
    aura.container.setPosition(this.player.x, this.player.y - 7);
    aura.container.setDepth(this.player.y + 5);
    aura.container.setAlpha(0.72 + intensity * 0.28);
    aura.glow.setRadius(28 + intensity * 14 + Math.sin(time * 6.5) * 2);
    aura.glow.setAlpha(0.22 + intensity * 0.24);

    aura.rings.forEach((ring, index) => {
      const ringLive = index < charges;
      ring.setVisible(ringLive);
      if (!ringLive) {
        return;
      }

      const wobble = Math.sin(time * 5.2 + index * 1.7);
      ring.setRadius(24 + index * 7 + wobble * 2.4);
      ring.setAlpha(0.34 + intensity * 0.28);
    });

    aura.flames.forEach((flame, index) => {
      const flameLive = index < charges;
      flame.setVisible(flameLive);
      if (!flameLive) {
        return;
      }

      const angle = time * 2.4 + index * ((Math.PI * 2) / REFUND_DISCOUNT_ATTACKS);
      const bob = Math.sin(time * 7 + index);
      flame.setPosition(Math.cos(angle) * 28, -12 + Math.sin(angle) * 10 + bob * 4);
      flame.setScale(1.08 + intensity * 0.58 + bob * 0.12);
      flame.setAlpha(0.7 + intensity * 0.3);
    });
  }

  private createRefundAura(): RefundAuraVisual {
    const container = this.add.container(this.player.x, this.player.y - 7);
    container.setDepth(this.player.y + 5);
    container.setVisible(false);

    const glow = this.add.circle(0, -3, 34, 0xff6a2a, 0.32);
    glow.setBlendMode(Phaser.BlendModes.ADD);

    const rings = Array.from({ length: REFUND_DISCOUNT_ATTACKS }, (_, index) => {
      const ring = this.add.circle(0, -3, 24 + index * 7, 0xff6a2a, 0);
      ring.setStrokeStyle(3, index === 0 ? 0xfff1a1 : 0xff7b2f, 0.62);
      ring.setBlendMode(Phaser.BlendModes.ADD);
      return ring;
    });

    const flames = Array.from({ length: REFUND_DISCOUNT_ATTACKS }, (_, index) => {
      const flame = this.add.circle(0, 0, 8 + index * 2, index === 0 ? 0xfff1a1 : 0xff6a2a, 0.92);
      flame.setBlendMode(Phaser.BlendModes.ADD);
      return flame;
    });

    container.add([glow, ...rings, ...flames]);
    return {
      container,
      glow,
      rings,
      flames,
      previousCharges: 0,
    };
  }

  private createRefundAuraIgnitionPulse(): void {
    const pulse = this.trackTransientVisual(this.add.circle(this.player.x, this.player.y - 7, 28, 0xff6a2a, 0.24));
    pulse.setStrokeStyle(4, 0xfff1a1, 0.9);
    pulse.setDepth(this.player.y + 8);
    pulse.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 0.9, to: 2.05 },
      duration: 440,
      ease: "Sine.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private createRefundAuraFadePulse(previousCharges: number): void {
    const pulse = this.trackTransientVisual(this.add.circle(this.player.x, this.player.y - 7, 22 + previousCharges * 8, 0xff6a2a, 0.12));
    pulse.setStrokeStyle(4, 0xff7b2f, 0.78);
    pulse.setDepth(this.player.y + 8);
    pulse.setBlendMode(Phaser.BlendModes.ADD);

    this.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 1, to: 1.72 },
      duration: 340,
      ease: "Cubic.easeOut",
      onComplete: () => pulse.destroy(),
    });
  }

  private destroyRefundAura(): void {
    this.refundAura?.container.destroy();
    this.refundAura = undefined;
  }

  private updateExtractionPrompt(): void {
    const gateDistance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.extractionPoint.x,
      this.extractionPoint.y,
    );

    if (gateDistance < 92) {
      gameState.setArenaPrompt(
        this.arenaCleared
          ? "Press F to extract and collect the corporate bounty."
          : "Press F to emergency-extract. Surviving bugs will void the bonus.",
      );
      return;
    }

    if (gameState.allotmentCurrent <= 0) {
      gameState.setArenaPrompt(
        "Compute Credits exhausted. Movement and sight are degraded until you reach the shop.",
      );
      return;
    }

    if (gameState.computeCurrent <= 0) {
      gameState.setArenaPrompt(
        "Compute Rate Limit empty. End the Cycle or reposition.",
      );
      return;
    }

    gameState.setArenaPrompt("");
  }

  private canExtract(): boolean {
    const gateDistance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.extractionPoint.x,
      this.extractionPoint.y,
    );
    return gateDistance < 92;
  }

  private advanceAbilityCooldowns(deltaMs: number): void {
    (Object.keys(this.cooldownRemainingMs) as AbilityAction[]).forEach((action) => {
      this.cooldownRemainingMs[action] = Math.max(0, this.cooldownRemainingMs[action] - deltaMs);
    });
  }

  private tryCollapse(): boolean {
    const availability = getCollapseAvailability(
      this.snapshotHistory,
      this.timelineTimeMs,
      gameState.quantumTuners,
    );

    if (!availability.allowed || !availability.target) {
      if (availability.reason === "no-charge") {
        gameState.setNotice("Collapse denied. No Quantum Tuner charges are banked.");
      } else {
        gameState.setNotice("Collapse denied. No temporal history is available yet.");
      }
      return false;
    }

    if (!gameState.consumeQuantumTuner()) {
      gameState.setNotice("Collapse denied. No Quantum Tuner charges are banked.");
      return false;
    }

    const target = availability.target;
    const discardedTimeline = extractHistoryRange(
      this.snapshotHistory,
      target.timelineTimeMs,
      this.timelineTimeMs,
    );
    this.beginCollapsePlayback(target, discardedTimeline);
    return true;
  }

  private beginCollapsePlayback(
    target: TimedArenaSnapshot,
    discardedTimeline: TimedArenaSnapshot[],
  ): void {
    this.collapsePlayback = {
      timeline: discardedTimeline.length > 0 ? discardedTimeline : [target],
      target,
      elapsedMs: 0,
      durationMs: ArenaScene.collapseVisualDurationMs,
      lastAppliedIndex: -1,
    };
    this.ghostReplay = undefined;
    this.hideGhostReplay();
    this.clearTransientVisuals();
    this.cameras.main.shake(140, 0.0022);
    gameState.setNotice("Quantum Tuner engaged. Collapsing the discarded branch.");
  }

  private beginDeathSequence(status: ArenaOutcome, note: string): void {
    if (this.deathSequenceActive) {
      return;
    }

    this.deathSequenceActive = true;
    gameState.finishArena(status, note, this.arenaElapsedTimeMs);
    this.clearTransientVisuals();
    this.destroyCooldownIndicators();

    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.stop();
    playerBody.enable = false;
    this.player.stop();
    this.player.setTint(0xff4fa4);
    this.playerShadow.setAlpha(0.25);

    const collapseRing = this.add.circle(this.player.x, this.player.y, 18, 0xff4fa4, 0);
    collapseRing.setStrokeStyle(4, 0xff4fa4, 0.95);
    collapseRing.setDepth(this.player.depth + 3);
    this.cameras.main.stopFollow();
    this.cameras.main.shake(260, 0.006);
    this.cameras.main.zoomTo(1.08, 420, "Sine.easeOut");

    const deathOverlay =
      this.collapseOverlay ??
      this.add
        .rectangle(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 0x09070d, 0)
        .setScrollFactor(0)
        .setDepth(9_998);
    deathOverlay.setFillStyle(0x09070d, 0.62);
    deathOverlay.setBlendMode(Phaser.BlendModes.NORMAL);
    deathOverlay.setAlpha(0);

    this.tweens.add({
      targets: collapseRing,
      radius: 132,
      alpha: 0,
      duration: 720,
      ease: "Cubic.easeOut",
      onComplete: () => {
        collapseRing.destroy();
      },
    });

    this.tweens.add({
      targets: [this.player, this.playerShadow],
      alpha: 0,
      scale: 0.58,
      angle: "+=20",
      duration: 860,
      ease: "Cubic.easeIn",
    });

    this.tweens.add({
      targets: deathOverlay,
      alpha: { from: 0, to: 0.86 },
      duration: ArenaScene.deathVisualDurationMs,
      ease: "Sine.easeIn",
      onComplete: () => {
        this.scene.start(SCENES.shop);
      },
    });
  }

  private updateCollapsePlayback(deltaMs: number): void {
    if (!this.collapsePlayback) {
      return;
    }

    const playback = this.collapsePlayback;
    playback.elapsedMs = Math.min(playback.durationMs, playback.elapsedMs + deltaMs);
    const progress = playback.durationMs <= 0 ? 1 : playback.elapsedMs / playback.durationMs;
    const reversedProgress = 1 - progress;
    const desiredIndex = Math.max(
      0,
      Math.floor(reversedProgress * (playback.timeline.length - 1)),
    );

    if (desiredIndex !== playback.lastAppliedIndex) {
      playback.lastAppliedIndex = desiredIndex;
      this.restoreArenaSnapshot(playback.timeline[desiredIndex].snapshot, {
        emitRunState: false,
        bumpHudTimeline: false,
      });
    }

    this.applyCollapseVisualState(progress);

    if (progress >= 1) {
      this.finishCollapsePlayback(playback);
    }
  }

  private updatePreparingBorder(): void {
    if (this.preparingBorderBars.length <= 0) {
      return;
    }

    const preparing = this.computeCycle.phase === "preparing";
    this.preparingBorderBars.forEach((bar) => bar.setVisible(preparing));
    if (!preparing) {
      return;
    }

    const pulse = 0.7 + Math.sin(this.timelineTimeMs * 0.012) * 0.18;
    this.preparingBorderBars.forEach((bar) => bar.setAlpha(pulse));
  }

  private createPreparingBorder(): void {
    const thickness = 6;
    const inset = thickness / 2;
    const color = 0xff4058;
    this.preparingBorderBars = [
      this.add.rectangle(this.scale.width / 2, inset, this.scale.width, thickness, color, 0.9),
      this.add.rectangle(this.scale.width / 2, this.scale.height - inset, this.scale.width, thickness, color, 0.9),
      this.add.rectangle(inset, this.scale.height / 2, thickness, this.scale.height, color, 0.9),
      this.add.rectangle(this.scale.width - inset, this.scale.height / 2, thickness, this.scale.height, color, 0.9),
    ];

    this.preparingBorderBars.forEach((bar) => {
      bar.setScrollFactor(0);
      bar.setDepth(9_997);
      bar.setVisible(false);
    });
  }

  private finishCollapsePlayback(playback: CollapsePlayback): void {
    this.timelineTimeMs = playback.target.timelineTimeMs;
    this.snapshotAccumulatorMs = 0;
    this.restoreArenaSnapshot(playback.target.snapshot);
    this.snapshotHistory = recordArenaSnapshot(
      prepareCollapsedHistory(this.snapshotHistory, playback.target),
      playback.target.snapshot,
      playback.target.timelineTimeMs,
    );
    this.collapsePlayback = undefined;
    this.applyCollapseVisualState(0);
    this.startGhostReplay(playback.timeline);
  }

  private startGhostReplay(timeline: TimedArenaSnapshot[]): void {
    if (timeline.length < 2) {
      this.hideGhostReplay();
      this.ghostReplay = undefined;
      return;
    }

    this.ghostReplay = {
      timeline,
      elapsedMs: 0,
      durationMs: Math.max(
        1,
        timeline[timeline.length - 1].timelineTimeMs - timeline[0].timelineTimeMs,
      ),
    };
    this.applyGhostSample(timeline[0].snapshot.player);
  }

  private updateGhostReplay(deltaMs: number): void {
    if (!this.ghostReplay) {
      return;
    }

    this.ghostReplay.elapsedMs += deltaMs;
    if (this.ghostReplay.elapsedMs >= this.ghostReplay.durationMs) {
      this.hideGhostReplay();
      this.ghostReplay = undefined;
      return;
    }

    const sample = this.samplePlayerTimeline(this.ghostReplay.timeline, this.ghostReplay.elapsedMs);
    this.applyGhostSample(sample);
  }

  private samplePlayerTimeline(
    timeline: TimedArenaSnapshot[],
    elapsedMs: number,
  ): PlayerArenaSnapshot {
    const firstTime = timeline[0].timelineTimeMs;
    const targetTime = firstTime + elapsedMs;

    for (let index = 1; index < timeline.length; index += 1) {
      const next = timeline[index];
      if (targetTime <= next.timelineTimeMs) {
        const previous = timeline[index - 1];
        const span = Math.max(1, next.timelineTimeMs - previous.timelineTimeMs);
        const t = Phaser.Math.Clamp((targetTime - previous.timelineTimeMs) / span, 0, 1);
        const previousPlayer = previous.snapshot.player;
        const nextPlayer = next.snapshot.player;
        const chosenPose = t < 0.5 ? previousPlayer : nextPlayer;

        return {
          position: {
            x: Phaser.Math.Linear(previousPlayer.position.x, nextPlayer.position.x, t),
            y: Phaser.Math.Linear(previousPlayer.position.y, nextPlayer.position.y, t),
          },
          velocity: {
            x: Phaser.Math.Linear(previousPlayer.velocity.x, nextPlayer.velocity.x, t),
            y: Phaser.Math.Linear(previousPlayer.velocity.y, nextPlayer.velocity.y, t),
          },
          dashDirection: {
            x: Phaser.Math.Linear(previousPlayer.dashDirection.x, nextPlayer.dashDirection.x, t),
            y: Phaser.Math.Linear(previousPlayer.dashDirection.y, nextPlayer.dashDirection.y, t),
          },
          angle: Phaser.Math.Linear(previousPlayer.angle, nextPlayer.angle, t),
          facing: chosenPose.facing,
          dashTimer: Phaser.Math.Linear(previousPlayer.dashTimer, nextPlayer.dashTimer, t),
          dashInvulnerabilityTimer: Phaser.Math.Linear(
            previousPlayer.dashInvulnerabilityTimer,
            nextPlayer.dashInvulnerabilityTimer,
            t,
          ),
          rangedMovementPauseTimer: Phaser.Math.Linear(
            previousPlayer.rangedMovementPauseTimer,
            nextPlayer.rangedMovementPauseTimer,
            t,
          ),
          playerAttackTimer: Phaser.Math.Linear(
            previousPlayer.playerAttackTimer,
            nextPlayer.playerAttackTimer,
            t,
          ),
          cooldowns: chosenPose.cooldowns,
        };
      }
    }

    return timeline[timeline.length - 1].snapshot.player;
  }

  private applyGhostSample(playerSnapshot: PlayerArenaSnapshot): void {
    if (!this.ghostSprite || !this.ghostShadow) {
      return;
    }

    const speed = Math.hypot(playerSnapshot.velocity.x, playerSnapshot.velocity.y);
    const action: SpriteAction =
      playerSnapshot.dashTimer > 0
        ? "dash"
        : playerSnapshot.playerAttackTimer > 0
          ? "attack"
          : speed > 16
            ? "run"
            : "idle";

    this.ghostShadow.setVisible(true);
    this.ghostShadow.setAlpha(0.17);
    this.ghostShadow.setPosition(playerSnapshot.position.x, playerSnapshot.position.y + 18);
    this.ghostShadow.setDepth(playerSnapshot.position.y - 14);
    this.ghostShadow.setScale(action === "dash" ? 1.04 : 0.9 + Math.min(speed / 900, 0.08), action === "dash" ? 0.58 : 0.68);

    this.ghostSprite.setVisible(true);
    this.ghostSprite.setAlpha(0.34);
    this.ghostSprite.setPosition(playerSnapshot.position.x, playerSnapshot.position.y);
    this.ghostSprite.setDepth(playerSnapshot.position.y + 4);
    this.ghostSprite.setAngle(action === "dash" ? playerSnapshot.dashDirection.x * 7 : playerSnapshot.angle);
    this.ghostSprite.setFlipX(this.shouldMirrorFacing(playerSnapshot.facing));

    const animationDirection = this.animationDirectionForFacing(playerSnapshot.facing);
    const animationKey = spriteAnimationKey("player", action, animationDirection);
    if (this.currentGhostAnim !== animationKey) {
      this.currentGhostAnim = animationKey;
      this.ghostSprite.play(animationKey, true);
    }
  }

  private hideGhostReplay(): void {
    this.currentGhostAnim = "";
    this.ghostSprite?.setVisible(false);
    this.ghostSprite?.setAlpha(0);
    this.ghostShadow?.setVisible(false);
    this.ghostShadow?.setAlpha(0);
  }

  private applyCollapseVisualState(progress: number): void {
    const pulse = Math.sin(progress * Math.PI);
    const overlayAlpha = 0.08 + pulse * 0.2;
    this.collapseOverlay?.setAlpha(progress <= 0 ? 0 : overlayAlpha);
    this.cameras.main.setZoom(1 + pulse * 0.045);

    if (this.blurFilter) {
      const baseStrength = gameState.getVisionBlurStrength() * 0.95;
      this.blurFilter.strength = baseStrength + pulse * 0.9;
      this.blurFilter.x = 0.8 + gameState.getVisionBlurStrength() * 2.4 + pulse * 1.4;
      this.blurFilter.y = 0.8 + gameState.getVisionBlurStrength() * 2.4 + pulse * 1.4;
      this.blurFilter.steps = pulse > 0.2 ? 4 : 2;
    }
  }

  private updateQuantumTrail(): void {
    if (!this.quantumTrailGraphics || !this.quantumTargetMarker) {
      return;
    }

    if (this.collapsePlayback) {
      this.quantumTrailGraphics.clear();
      this.quantumTargetMarker.setVisible(false);
      return;
    }

    const trailPoints = this.getRecentTrailPoints();
    this.quantumTrailGraphics.clear();

    if (trailPoints.length < 2) {
      this.quantumTargetMarker.setVisible(false);
      return;
    }

    const hasCharge = gameState.quantumTuners > 0;
    this.quantumTrailGraphics.lineStyle(2, 0x60ffd3, hasCharge ? 0.18 : 0.08);
    this.quantumTrailGraphics.beginPath();
    this.quantumTrailGraphics.moveTo(trailPoints[0].x, trailPoints[0].y);
    for (let index = 1; index < trailPoints.length; index += 1) {
      this.quantumTrailGraphics.lineTo(trailPoints[index].x, trailPoints[index].y);
    }
    this.quantumTrailGraphics.strokePath();

    for (let index = 0; index < trailPoints.length; index += 4) {
      this.quantumTrailGraphics.fillStyle(0xffcf66, hasCharge ? 0.12 : 0.06);
      this.quantumTrailGraphics.fillCircle(trailPoints[index].x, trailPoints[index].y, 2.1);
    }

    const target = trailPoints[0];
    this.quantumTargetMarker.setVisible(true);
    this.quantumTargetMarker.setPosition(target.x, target.y);
    this.quantumTargetMarker.setAlpha(hasCharge ? 0.72 : 0.28);
    this.quantumTargetMarker.setScale(hasCharge ? 1.08 : 0.84);
    this.quantumTargetMarker.setDepth(target.y + 2);
  }

  private getRecentTrailPoints(): TrailPoint[] {
    const startTimeMs = Math.max(0, this.timelineTimeMs - QUANTUM_TUNER_REWIND_MS);
    const points: TrailPoint[] = [];

    for (let index = 0; index < this.snapshotHistory.length; index += 1) {
      const entry = this.snapshotHistory[index];
      if (entry.timelineTimeMs >= startTimeMs) {
        points.push({
          x: entry.snapshot.player.position.x,
          y: entry.snapshot.player.position.y,
          timeMs: entry.timelineTimeMs,
        });
      }
    }

    points.push({
      x: this.player.x,
      y: this.player.y,
      timeMs: this.timelineTimeMs,
    });

    return points;
  }

  private recordSnapshotIfDue(): void {
    if (this.snapshotAccumulatorMs < QUANTUM_TUNER_SNAPSHOT_INTERVAL_MS) {
      return;
    }

    this.snapshotAccumulatorMs = 0;
    this.snapshotHistory = recordArenaSnapshot(
      this.snapshotHistory,
      this.captureArenaSnapshot(),
      this.timelineTimeMs,
    );
  }

  private captureArenaSnapshot(): ArenaSnapshot {
    const liveEnemyById = new Map(this.drones.map((drone) => [drone.id, drone]));

    return {
      runState: gameState.createArenaSnapshot(),
      computeCycle: this.computeCycle,
      player: {
        position: { x: this.player.x, y: this.player.y },
        velocity: { x: this.velocity.x, y: this.velocity.y },
        dashDirection: { x: this.dashDirection.x, y: this.dashDirection.y },
        facing: this.playerFacing,
        angle: this.player.angle,
        dashTimer: this.dashTimer,
        dashInvulnerabilityTimer: this.dashInvulnerabilityTimer,
        rangedMovementPauseTimer: this.rangedMovementPauseTimer,
        playerAttackTimer: this.playerAttackTimer,
        cooldowns: {
          dash: this.cooldownRemainingMs.dash,
          melee: this.cooldownRemainingMs.melee,
          ranged: this.cooldownRemainingMs.ranged,
        },
      },
      arenaCleared: this.arenaCleared,
      projectiles: this.projectiles.map((projectile): ProjectileArenaSnapshot => ({
        type: projectile.type,
        position: { x: projectile.sprite.x, y: projectile.sprite.y },
        velocity: { x: projectile.velocity.x, y: projectile.velocity.y },
        ttl: projectile.ttl,
        rotation: projectile.sprite.rotation,
        damage: projectile.damage,
        hitRadius: projectile.hitRadius,
      })),
      enemies: this.enemySpawnPoints.map((spawnPoint) => {
        const liveDrone = liveEnemyById.get(spawnPoint.id);
        if (!liveDrone) {
          return {
            id: spawnPoint.id,
            type: spawnPoint.type,
            alive: false,
            hp: 0,
            position: { x: spawnPoint.x, y: spawnPoint.y },
            velocity: { x: 0, y: 0 },
            lungeDirection: { x: 1, y: 0 },
            touchCooldown: 0,
            attackTimer: 0,
            stunTimer: 0,
            lungeCooldown: 0,
            lungeWindupTimer: 0,
            lungeTimer: 0,
            orbitSeed: spawnPoint.orbitSeed,
            hopDirection: { x: 1, y: 0 },
            hopCooldown: 0,
            hopWindupTimer: 0,
            hopTimer: 0,
            landingRecoveryTimer: 0,
            shotCooldown: 0,
            shotWindupTimer: 0,
            lockedShotDirection: { x: 1, y: 0 },
          };
        }

        return {
          id: liveDrone.id,
          type: liveDrone.type,
          alive: true,
          hp: liveDrone.hp,
          position: { x: liveDrone.sprite.x, y: liveDrone.sprite.y },
          velocity: {
            x: (liveDrone.sprite.body as Phaser.Physics.Arcade.Body).velocity.x,
            y: (liveDrone.sprite.body as Phaser.Physics.Arcade.Body).velocity.y,
          },
          lungeDirection: { x: liveDrone.lungeDirection.x, y: liveDrone.lungeDirection.y },
          touchCooldown: liveDrone.touchCooldown,
          attackTimer: liveDrone.attackTimer,
          stunTimer: liveDrone.stunTimer,
          lungeCooldown: liveDrone.lungeCooldown,
          lungeWindupTimer: liveDrone.lungeWindupTimer,
          lungeTimer: liveDrone.lungeTimer,
          orbitSeed: liveDrone.orbitSeed,
          hopDirection: { x: liveDrone.hopDirection.x, y: liveDrone.hopDirection.y },
          hopCooldown: liveDrone.hopCooldown,
          hopWindupTimer: liveDrone.hopWindupTimer,
          hopTimer: liveDrone.hopTimer,
          hopDistance: liveDrone.hopDistance,
          landingRecoveryTimer: liveDrone.landingRecoveryTimer,
          shotCooldown: liveDrone.shotCooldown,
          shotWindupTimer: liveDrone.shotWindupTimer,
          lockedShotDirection: { x: liveDrone.lockedShotDirection.x, y: liveDrone.lockedShotDirection.y },
        };
      }),
    };
  }

  private restoreArenaSnapshot(
    snapshot: ArenaSnapshot,
    options: {
      emitRunState?: boolean;
      bumpHudTimeline?: boolean;
    } = {},
  ): void {
    const { emitRunState = true, bumpHudTimeline = emitRunState } = options;
    this.clearTransientVisuals();
    this.destroyAllProjectiles();
    this.destroyAllDrones();

    this.arenaCleared = snapshot.arenaCleared;
    this.computeCycle = createArenaComputeCycle({
      currentDraftDeck: {},
      resumeCycle: snapshot.computeCycle,
      seed: this.timelineTimeMs + gameState.runId,
      computeRefill: gameState.computeMax,
    });
    this.velocity.set(snapshot.player.velocity.x, snapshot.player.velocity.y);
    this.dashDirection.set(snapshot.player.dashDirection.x, snapshot.player.dashDirection.y);
    this.playerFacing = snapshot.player.facing;
    this.dashTimer = snapshot.player.dashTimer;
    this.dashInvulnerabilityTimer = snapshot.player.dashInvulnerabilityTimer;
    this.rangedMovementPauseTimer = snapshot.player.rangedMovementPauseTimer;
    this.playerAttackTimer = snapshot.player.playerAttackTimer;
    this.cooldownRemainingMs = {
      dash: snapshot.player.cooldowns.dash,
      melee: snapshot.player.cooldowns.melee,
      ranged: snapshot.player.cooldowns.ranged,
    };

    const playerX = this.clampArenaX(snapshot.player.position.x);
    const playerY = this.clampArenaY(snapshot.player.position.y);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.reset(playerX, playerY);
    this.player.setPosition(playerX, playerY);
    this.player.setVelocity(this.velocity.x, this.velocity.y);
    this.player.setAngle(snapshot.player.angle);
    this.cameras.main.centerOn(playerX, playerY);
    this.currentPlayerAnim = "";
    this.updatePlayerShadow();
    this.syncPlayerPresentation();

    gameState.restoreArenaSnapshot(snapshot.runState, {
      emitChange: emitRunState,
      bumpTimelineVersion: bumpHudTimeline,
    });
    gameState.setExtractionReady(this.arenaCleared, { emitChange: emitRunState });

    this.projectiles = snapshot.projectiles.map((projectileSnapshot) =>
      this.createProjectileFromSnapshot(projectileSnapshot),
    );
    this.enemySpawnPoints = snapshot.enemies.map((enemySnapshot) => ({
      id: enemySnapshot.id,
      type: enemySnapshot.type ?? "bug",
      x: enemySnapshot.position.x,
      y: enemySnapshot.position.y,
      orbitSeed: enemySnapshot.orbitSeed,
    }));
    this.drones = snapshot.enemies
      .filter((enemySnapshot) => enemySnapshot.alive)
      .map((enemySnapshot) => this.createDrone(enemySnapshot));

    this.updateVisuals();
    this.updateExtractionPrompt();
    this.updateCooldownIndicators();
  }

  private syncPlayerPresentation(): void {
    const action: SpriteAction =
      this.dashTimer > 0
        ? "dash"
        : this.playerAttackTimer > 0
          ? "attack"
          : this.velocity.lengthSq() > 256
            ? "run"
            : "idle";

    this.playPlayerAnimation(action, this.playerFacing);
    if (action === "dash") {
      this.playerShadow.setScale(1.14, 0.64);
      this.player.setAngle(this.dashDirection.x * 7);
      return;
    }

    const speed = this.velocity.length();
    this.playerShadow.setScale(0.92 + Math.min(speed / 900, 0.12), 0.76);
  }

  private createProjectileFromSnapshot(projectileSnapshot: ProjectileArenaSnapshot): Projectile {
    const type = projectileSnapshot.type ?? "function";
    const sprite = this.physics.add.image(
      this.clampArenaX(projectileSnapshot.position.x),
      this.clampArenaY(projectileSnapshot.position.y),
      "qf-bolt",
    );
    if (type === "hopper-shot") {
      sprite.setTint(0xff6b35);
    }
    sprite.setRotation(projectileSnapshot.rotation);
    sprite.setDepth(projectileSnapshot.position.y + 20);
    sprite.setVelocity(projectileSnapshot.velocity.x, projectileSnapshot.velocity.y);

    return {
      type,
      sprite,
      velocity: new Phaser.Math.Vector2(
        projectileSnapshot.velocity.x,
        projectileSnapshot.velocity.y,
      ),
      ttl: projectileSnapshot.ttl,
      damage: projectileSnapshot.damage ?? (type === "hopper-shot" ? HOPPER_CHARGED_SHOT_DAMAGE : RANGED_DIRECT_DAMAGE),
      hitRadius: projectileSnapshot.hitRadius ?? (type === "hopper-shot" ? HOPPER_CHARGED_SHOT_HIT_RADIUS : 24),
    };
  }

  private createDrone(snapshot: EnemyArenaSnapshot): EnemyUnit {
    const type = snapshot.type ?? "bug";
    const x = this.clampArenaX(snapshot.position.x);
    const y = this.clampArenaY(snapshot.position.y);
    const shadow = this.add.image(x, y + 18, "qf-shadow");
    shadow.setScale(type === "hopper" ? 0.48 : 0.58, type === "hopper" ? 0.44 : 0.52);
    shadow.setAlpha(0.42);
    shadow.setDepth(snapshot.position.y - 6);

    const sprite = this.physics.add.sprite(
      x,
      y,
      type === "hopper" ? HOPPER_SHEET_KEY : DRONE_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    sprite.setScale(type === "hopper" ? ACTOR_DISPLAY_SCALE * 0.88 : ACTOR_DISPLAY_SCALE);
    sprite.setCircle(28);
    sprite.setOffset(68, 88);
    sprite.setDepth(snapshot.position.y + 2);
    sprite.setBounce(0.1);
    sprite.setCollideWorldBounds(true);
    sprite.setVelocity(snapshot.velocity.x, snapshot.velocity.y);
    const wallCollider = this.physics.add.collider(sprite, this.walls);
    const playerCollider = this.physics.add.collider(
      sprite,
      this.player,
      undefined,
      () => !this.isPlayerInvulnerable(),
      this,
    );

    const drone: EnemyUnit = {
      id: snapshot.id,
      type,
      sprite,
      shadow,
      playerCollider,
      wallCollider,
      lungeDirection: new Phaser.Math.Vector2(
        snapshot.lungeDirection?.x ?? 1,
        snapshot.lungeDirection?.y ?? 0,
      ),
      hopDirection: new Phaser.Math.Vector2(
        snapshot.hopDirection?.x ?? 1,
        snapshot.hopDirection?.y ?? 0,
      ),
      lockedShotDirection: new Phaser.Math.Vector2(
        snapshot.lockedShotDirection?.x ?? 1,
        snapshot.lockedShotDirection?.y ?? 0,
      ),
      hp: snapshot.hp,
      touchCooldown: snapshot.touchCooldown,
      attackTimer: snapshot.attackTimer,
      stunTimer: snapshot.stunTimer,
      lungeCooldown: snapshot.lungeCooldown ?? 0,
      lungeWindupTimer: snapshot.lungeWindupTimer ?? 0,
      lungeTimer: snapshot.lungeTimer ?? 0,
      hopCooldown: snapshot.hopCooldown ?? 0.35,
      hopWindupTimer: snapshot.hopWindupTimer ?? 0,
      hopTimer: snapshot.hopTimer ?? 0,
      hopDistance: snapshot.hopDistance ?? ArenaScene.hopperMaxHopDistance,
      landingRecoveryTimer: snapshot.landingRecoveryTimer ?? 0,
      shotCooldown: snapshot.shotCooldown ?? 0.9,
      shotWindupTimer: snapshot.shotWindupTimer ?? 0,
      orbitSeed: snapshot.orbitSeed,
    };

    if ((snapshot.lungeWindupTimer ?? 0) > 0) {
      this.createDroneLungeTelegraph(drone);
    }
    if (type === "hopper" && snapshot.shotWindupTimer && snapshot.shotWindupTimer > 0) {
      this.createHopperShotTelegraph(drone);
    }

    return drone;
  }

  private clampArenaX(value: number): number {
    return Phaser.Math.Clamp(value, 0, this.arenaWidth);
  }

  private clampArenaY(value: number): number {
    return Phaser.Math.Clamp(value, 0, this.arenaHeight);
  }

  private initialEnemySnapshot(spawnPoint: EnemySpawnPoint): EnemyArenaSnapshot {
    const type = spawnPoint.type;
    return {
      id: spawnPoint.id,
      type,
      alive: true,
      hp: type === "hopper" ? HOPPER_HP : 44,
      position: { x: spawnPoint.x, y: spawnPoint.y },
      velocity: { x: 0, y: 0 },
      lungeDirection: { x: 1, y: 0 },
      touchCooldown: 0,
      attackTimer: 0,
      stunTimer: 0,
      lungeCooldown: type === "bug" ? 0.55 + spawnPoint.id * 0.08 : 0,
      lungeWindupTimer: 0,
      lungeTimer: 0,
      orbitSeed: spawnPoint.orbitSeed,
      hopDirection: { x: 1, y: 0 },
      hopCooldown: type === "hopper" ? 0.35 : 0,
      hopWindupTimer: 0,
      hopTimer: 0,
      landingRecoveryTimer: 0,
      shotCooldown: type === "hopper" ? 0.8 : 0,
      shotWindupTimer: 0,
      lockedShotDirection: { x: 1, y: 0 },
    };
  }

  private destroyAllProjectiles(): void {
    this.projectiles.forEach((projectile) => projectile.sprite.destroy());
    this.projectiles = [];
  }

  private destroyAllDrones(): void {
    this.drones.forEach((drone) => this.destroyDroneRuntime(drone));
    this.drones = [];
  }

  private destroyDroneRuntime(drone: EnemyUnit): void {
    drone.playerCollider.destroy();
    drone.wallCollider.destroy();
    this.clearDroneLungeTelegraph(drone);
    this.clearHopperShotTelegraph(drone);
    drone.shadow.destroy();
    drone.sprite.destroy();
  }

  private clearTransientVisuals(): void {
    this.transientVisuals.forEach((visual) => {
      if (visual.active) {
        visual.destroy();
      }
    });
    this.transientVisuals.clear();
  }

  private trackTransientVisual<T extends Phaser.GameObjects.GameObject>(visual: T): T {
    this.transientVisuals.add(visual);
    visual.once("destroy", () => {
      this.transientVisuals.delete(visual);
    });
    return visual;
  }

  private timeSubsystem<T>(label: SubsystemLabel, fn: () => T): T {
    this.diagnostics.beginSubsystem(label);
    const result = fn();
    this.diagnostics.endSubsystem(label);
    return result;
  }

  private diagnosticsContext() {
    return {
      snapshotHistoryLength: this.snapshotHistory.length,
      dronesLength: this.drones.length,
      projectilesLength: this.projectiles.length,
      computeCyclePhase: this.computeCycle.phase,
      collapsePlaybackActive: this.collapsePlayback !== undefined,
      deathSequenceActive: this.deathSequenceActive,
    };
  }
}
