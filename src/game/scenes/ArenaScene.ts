import * as Phaser from "phaser";
import { SCENES } from "../constants";
import {
  ABILITY_COOLDOWNS_MS,
  calculateRangedSiphonRefund,
  getCachedAbilityCost,
  getCacheWindowRatio,
  getCooldownProgress,
  isCacheWindowOpen,
  RANGED_PULL_FORCE,
  RANGED_PULL_RADIUS,
  type CombatAbilityAction,
} from "../combat";
import {
  ACTOR_FRAME_WIDTH,
  DRONE_SHEET_KEY,
  PLAYER_SHEET_KEY,
  type SpriteAction,
  type SpriteDirection,
  spriteAnimationKey,
  spriteFrameName,
} from "../generated-art";
import { frameDisplayScale, textureScale, textureScaleY } from "../art-scale";
import { buildAnimationSpec } from "../animation-spec";
import { ArenaVfxSystem } from "../vfx";
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
  type SnapshotCacheFlags,
  type TimedArenaSnapshot,
} from "../quantum-tuner";
import { gameState, type SavedArenaResume } from "../state";

type AbilityAction = CombatAbilityAction;

type AbilityAttempt = {
  allowed: boolean;
  baseCost: number;
  cached: boolean;
  cost: number;
};

type CooldownIndicator = {
  container: Phaser.GameObjects.Container;
  progress: Phaser.GameObjects.Graphics;
  cacheZone: Phaser.GameObjects.Graphics;
  missRing: Phaser.GameObjects.Arc;
  label: Phaser.GameObjects.Text;
};

type EnemySpawnPoint = {
  id: number;
  x: number;
  y: number;
  orbitSeed: number;
};

type EnemyUnit = {
  id: number;
  sprite: Phaser.Physics.Arcade.Sprite;
  shadow: Phaser.GameObjects.Image;
  playerCollider: Phaser.Physics.Arcade.Collider;
  wallCollider: Phaser.Physics.Arcade.Collider;
  lungeDirection: Phaser.Math.Vector2;
  lungeTelegraph?: Phaser.GameObjects.Rectangle;
  hp: number;
  touchCooldown: number;
  attackTimer: number;
  stunTimer: number;
  lungeCooldown: number;
  lungeWindupTimer: number;
  lungeTimer: number;
  orbitSeed: number;
};

type Projectile = {
  sprite: Phaser.Physics.Arcade.Image;
  velocity: Phaser.Math.Vector2;
  ttl: number;
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

export class ArenaScene extends Phaser.Scene {
  private static readonly actorScale = 0.5;
  private static readonly actorDisplayFrameWidth = ACTOR_FRAME_WIDTH;
  private static readonly collapseVisualDurationMs = 1_000;
  private static readonly resumeSaveIntervalMs = 600;
  private static readonly combatSpeedMultiplier = 1.5;
  private static readonly playerBaseSpeed = 220;
  private static readonly playerBaseAcceleration = 510;
  private static readonly playerBaseDeceleration = 660;
  private static readonly playerBaseDashSpeed = 520;
  private static readonly meleeRange = 166;
  private static readonly meleeStunDuration = 0.28;
  private static readonly playerDashDuration = 0.16;
  private static readonly playerDashInvulnerabilityDuration = 0.24;
  private static readonly meleeAttackLockDuration = 0.26;
  private static readonly rangedMovementPauseDuration = 0.32;
  private static readonly rangedAttackAnimationDuration = 0.28;
  private static readonly droneChaseSpeed = 132;
  private static readonly droneCloseSpeed = 68;
  private static readonly droneLungeMinRange = 72;
  private static readonly droneLungeMaxRange = 230;
  private static readonly droneLungeWindupDuration = 0.34;
  private static readonly droneLungeDuration = 0.18;
  private static readonly droneLungeCooldown = 1.35;
  private static readonly droneLungeSpeed = 470;

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
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private blurFilter?: Phaser.Filters.Blur;
  private colorMatrixFilter?: Phaser.Filters.ColorMatrix;
  private vignetteFilter?: Phaser.Filters.Vignette;
  private displacementFilter?: Phaser.Filters.Displacement;
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
  private cacheDiscountBlocked: SnapshotCacheFlags = {
    dash: false,
    melee: false,
    ranged: false,
  };
  private cooldownIndicators: Partial<Record<AbilityAction, CooldownIndicator>> = {};
  private cacheWindowActive: Record<AbilityAction, boolean> = {
    dash: false,
    melee: false,
    ranged: false,
  };
  private cacheWindowPulseUntilMs: Record<AbilityAction, number> = {
    dash: 0,
    melee: 0,
    ranged: 0,
  };
  private transientVisuals = new Set<Phaser.GameObjects.GameObject>();
  private timelineTimeMs = 0;
  private arenaElapsedTimeMs = 0;
  private snapshotAccumulatorMs = 0;
  private snapshotHistory: TimedArenaSnapshot[] = [];
  private collapsePlayback?: CollapsePlayback;
  private ghostReplay?: GhostReplay;
  private quantumTrailGraphics?: Phaser.GameObjects.Graphics;
  private quantumTargetMarker?: Phaser.GameObjects.Arc;
  private collapseOverlay?: Phaser.GameObjects.Rectangle;
  private ghostShadow?: Phaser.GameObjects.Image;
  private ghostSprite?: Phaser.GameObjects.Sprite;
  private currentGhostAnim = "";
  private vfx?: ArenaVfxSystem;
  private arenaPointLight?: Phaser.GameObjects.Light;
  private ambienceEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private resumeSaveAccumulatorMs = 0;
  private readonly handlePagePersist = (): void => {
    this.saveResumeCheckpoint();
  };
  private readonly handleVisibilityPersist = (): void => {
    if (document.visibilityState === "hidden") {
      this.saveResumeCheckpoint();
    }
  };

  constructor() {
    super(SCENES.arena);
  }

  create(data?: { resume?: SavedArenaResume }): void {
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
    this.cacheDiscountBlocked = {
      dash: false,
      melee: false,
      ranged: false,
    };
    this.cacheWindowActive = {
      dash: false,
      melee: false,
      ranged: false,
    };
    this.cacheWindowPulseUntilMs = {
      dash: 0,
      melee: 0,
      ranged: 0,
    };
    this.transientVisuals.clear();
    this.timelineTimeMs = data?.resume?.timelineTimeMs ?? 0;
    this.arenaElapsedTimeMs = data?.resume?.arenaElapsedTimeMs ?? 0;
    this.snapshotAccumulatorMs = 0;
    this.resumeSaveAccumulatorMs = 0;
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
    this.setupVisualSystems();
    this.vfx = new ArenaVfxSystem(this, this.trackTransientVisual.bind(this));

    this.playerShadow = this.add.image(this.entryPoint.x, this.entryPoint.y + 18, "qf-shadow");
    this.playerShadow.setAlpha(0.46);
    this.playerShadow.setScale(
      textureScale(this, "qf-shadow", 88, 0.92),
      textureScaleY(this, "qf-shadow", 36, 0.76),
    );

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
    const playerDisplayScale = this.actorDisplayScale(PLAYER_SHEET_KEY);
    this.player.setScale(playerDisplayScale);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(44, 40);
    this.player.setOffset(
      this.actorOffsetForDisplayScale(50, playerDisplayScale),
      this.actorOffsetForDisplayScale(108, playerDisplayScale),
    );
    if (this.usesExternalArt()) {
      this.player.setLighting(true);
    }
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setMaxVelocity(840, 840);

    this.physics.add.collider(this.player, this.walls);

    this.spawnEnemies();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setRoundPixels(false);
    this.cameras.main.setZoom(1);
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

    this.ghostShadow = this.add.image(this.entryPoint.x, this.entryPoint.y + 18, "qf-shadow");
    this.ghostShadow.setScale(
      textureScale(this, "qf-shadow", 88, 0.88),
      textureScaleY(this, "qf-shadow", 36, 0.64),
    );
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
    this.ghostSprite.setScale(playerDisplayScale);
    this.ghostSprite.setAlpha(0);
    this.ghostSprite.setTint(0x9cf9ff);
    this.ghostSprite.setBlendMode(Phaser.BlendModes.SCREEN);
    this.ghostSprite.setDepth(45);
    this.ghostSprite.setVisible(false);

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", this.handlePointerDown, this);

    this.cursors = this.input.keyboard!.addKeys("W,A,S,D,F,Q,SPACE") as ArenaScene["cursors"];

    this.enemyCountLabel = this.add.text(24, 24, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "16px",
      color: "#dcf7e3",
    });
    this.enemyCountLabel.setScrollFactor(0);
    this.enemyCountLabel.setDepth(9999);
    this.createCooldownIndicators();

    if (data?.resume) {
      try {
        this.restoreArenaSnapshot(data.resume.snapshot, {
          emitRunState: false,
          bumpHudTimeline: false,
        });
      } catch (error) {
        console.warn("Arena resume failed; returning to shop.", error);
        gameState.clearArenaResume();
        gameState.restoreForShop(
          "Arena restore failed. Returned to procurement chamber with run data preserved.",
        );
        this.scene.start(SCENES.shop);
        return;
      }
    }

    this.updateVisuals();
    this.updateExtractionPrompt();
    this.updateCooldownIndicators();
    this.snapshotHistory = recordArenaSnapshot([], this.captureArenaSnapshot(), this.timelineTimeMs);
    gameState.setExtractionReady(this.arenaCleared);
    this.saveResumeCheckpoint();

    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.handlePagePersist);
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityPersist);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.saveResumeCheckpoint();
      this.input.off("pointerdown", this.handlePointerDown, this);
      this.clearTransientVisuals();
      this.destroyCooldownIndicators();
      this.destroyAllProjectiles();
      this.destroyAllDrones();
      this.ambienceEmitter?.destroy();
      if (this.arenaPointLight) {
        this.lights.removeLight(this.arenaPointLight);
        this.arenaPointLight = undefined;
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("pagehide", this.handlePagePersist);
      }
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", this.handleVisibilityPersist);
      }
    });
  }

  update(_time: number, delta: number): void {
    if (this.collapsePlayback) {
      this.updateCollapsePlayback(delta);
      this.updateQuantumTrail();
      return;
    }

    const dt = delta / 1000;
    this.timelineTimeMs += delta;
    this.arenaElapsedTimeMs += delta;
    this.snapshotAccumulatorMs += delta;
    this.resumeSaveAccumulatorMs += delta;
    this.advanceAbilityCooldowns(delta);
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);
    this.dashInvulnerabilityTimer = Math.max(0, this.dashInvulnerabilityTimer - dt);
    gameState.regenerate(delta);

    const pointer = this.input.activePointer;
    pointer.updateWorldPoint(this.cameras.main);

    if (Phaser.Input.Keyboard.JustDown(this.cursors.Q) && this.tryCollapse()) {
      return;
    }

    this.updatePlayerMovement(dt, pointer);
    this.updatePlayerOrientation(pointer);

    if (this.updateDrones(dt)) {
      return;
    }

    this.updateProjectiles(dt);
    this.updateVisuals();
    this.updateExtractionPrompt();
    this.updateCooldownIndicators();

    if (Phaser.Input.Keyboard.JustDown(this.cursors.F) && this.canExtract()) {
      const note = this.arenaCleared
        ? "Arena pacified. Procurement rights renewed."
        : "Emergency extraction granted. The corporations keep the unused fear.";
      gameState.finishArena(this.arenaCleared ? "cleared" : "retreated", note, this.arenaElapsedTimeMs);
      this.scene.start(SCENES.shop);
      return;
    }

    if (!this.arenaCleared && this.drones.length === 0) {
      this.arenaCleared = true;
      gameState.setExtractionReady(true);
      gameState.setNotice(
        "All hostiles decommissioned. Northern extraction gate now serves as your audit exit.",
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

    this.recordSnapshotIfDue();
    this.updateQuantumTrail();
    this.updateGhostReplay(delta);
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
        tile.setScale(textureScale(this, "qf-floor", 128));
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
      haze.setScale(
        textureScale(this, "qf-haze", 256, scale),
        textureScaleY(this, "qf-haze", 256, scale * 0.72),
      );
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

  private usesExternalArt(): boolean {
    return this.registry.get("qf-art-mode") !== "procedural";
  }

  private actorDisplayScale(sheetKey: string): number {
    return frameDisplayScale(
      this,
      sheetKey,
      spriteFrameName("idle", "s", 0),
      ArenaScene.actorDisplayFrameWidth,
    );
  }

  private actorOffsetForDisplayScale(offset: number, displayScale: number): number {
    return offset * (ArenaScene.actorScale / displayScale);
  }

  private setupVisualSystems(): void {
    const useLighting = this.usesExternalArt();
    this.colorMatrixFilter = this.cameras.main.filters!.internal.addColorMatrix();
    this.colorMatrixFilter.colorMatrix.reset().saturate(0.08);
    this.vignetteFilter = this.cameras.main.filters!.external.addVignette(0.5, 0.5, 0.9, 0.12, 0x0d1219);
    this.blurFilter = this.cameras.main.filters!.external.addBlur(0, 1, 1, 0.001, 0xeaffff, 2);
    this.displacementFilter = this.cameras.main.filters!.external.addDisplacement("qf-haze", 0, 0);
    this.displacementFilter.setActive(false);

    if (useLighting) {
      this.lights.enable();
      this.lights.setAmbientColor(0x808b92);
      this.arenaPointLight = this.lights.addLight(this.entryPoint.x, this.entryPoint.y, 260, 0x60ffd3, 1.05, 52);
    } else {
      this.lights.disable();
    }

    this.ambienceEmitter = this.add.particles(0, 0, "qf-haze", {
      x: { min: 60, max: this.arenaWidth - 60 },
      y: { min: 60, max: this.arenaHeight - 60 },
      quantity: 1,
      frequency: 210,
      lifespan: { min: 1200, max: 2600 },
      scale: { start: 0.08, end: 0.22 },
      alpha: { start: 0.08, end: 0 },
      rotate: { min: -20, max: 20 },
      speedY: { min: -12, max: -40 },
      speedX: { min: -10, max: 10 },
      blendMode: Phaser.BlendModes.SCREEN,
    });
    this.ambienceEmitter.setDepth(1600);
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
      const shadow = this.add
        .image(x, y + 44, "qf-shadow")
        .setScale(
          textureScale(this, "qf-shadow", 88, 1.85),
          textureScaleY(this, "qf-shadow", 36, 0.92),
        )
        .setAlpha(0.42);
      shadow.setDepth(y - 10);
      const pillar = this.walls.create(x, y, "qf-pillar") as Phaser.Physics.Arcade.Sprite;
      pillar.setDepth(y + 10);
      pillar.setScale(textureScale(this, "qf-pillar", 112, 1.18));
      if (this.usesExternalArt()) {
        pillar.setLighting(true);
      }
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
      .setScale(textureScale(this, "qf-gate", 192, 1.08))
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
    const positions = [
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
    ] as const;

    const enemyCount = Math.min(positions.length, 5 + gameState.roundsFinished);
    this.enemySpawnPoints = positions.slice(0, enemyCount).map(([x, y], index) => ({
      id: index,
      x,
      y,
      orbitSeed: index * 0.6,
    }));

    this.enemySpawnPoints.forEach((spawnPoint) => {
      this.drones.push(this.createDrone(this.initialEnemySnapshot(spawnPoint)));
    });
  }

  private registerActorAnimations(): void {
    this.registerAnimationSet("player", PLAYER_SHEET_KEY);
    this.registerAnimationSet("drone", DRONE_SHEET_KEY);
  }

  private registerAnimationSet(actor: "player" | "drone", sheetKey: string): void {
    const specs = buildAnimationSpec(actor);
    specs.forEach((spec) => {
      const key = spriteAnimationKey(actor, spec.action, spec.direction);
      if (this.anims.exists(key)) {
        return;
      }

      const frameCount = spec.action === "idle" ? 2 : spec.action === "run" ? 4 : 3;
      this.anims.create({
        key,
        frames: Array.from({ length: frameCount }, (_, frame) => ({
          key: sheetKey,
          frame: spriteFrameName(spec.action, spec.direction, frame),
        })),
        frameRate: spec.frameRate,
        repeat: spec.repeat,
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

    const movementMultiplier = gameState.getMovementMultiplier();
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
      this.playerShadow.setScale(
        textureScale(this, "qf-shadow", 88, 1.14),
        textureScaleY(this, "qf-shadow", 36, 0.64),
      );
      return;
    }

    this.player.setAngle(speed > 18 ? Phaser.Math.Clamp(this.velocity.x / 24, -6, 6) : 0);
    this.playerShadow.setScale(
      textureScale(this, "qf-shadow", 88, 0.92 + Math.min(speed / 900, 0.12)),
      textureScaleY(this, "qf-shadow", 36, 0.76),
    );
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

    const attempt = this.resolveAbilityAttempt("dash", gameState.dashCost);
    if (!attempt.allowed) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Dash denied. Compute Rate Limit or Compute Credits debt must recover first.");
      return;
    }

    if (!gameState.spend(attempt.cost)) {
      gameState.setNotice("Dash denied. Compute Rate Limit cannot authorize displacement.");
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
    this.createDashAfterimage();
    this.createCacheDiscountVisual("dash", attempt);
  }

  private createDashAfterimage(): void {
    this.vfx?.trigger("dash_afterimage", {
      x: this.player.x,
      y: this.player.y,
      direction: this.dashDirection,
      facing: this.playerFacing,
      angle: this.player.angle,
      depth: this.player.depth - 1,
    });
  }

  private resolveAbilityAttempt(action: AbilityAction, baseCost: number): AbilityAttempt {
    const remainingMs = this.cooldownRemainingMs[action];

    if (
      isCacheWindowOpen(
        action,
        remainingMs,
        this.cooldownForAction(action),
        this.cacheDiscountBlocked[action],
        this.canUseCacheDiscount(),
      )
    ) {
      return {
        allowed: true,
        baseCost,
        cached: true,
        cost: getCachedAbilityCost(baseCost),
      };
    }

    if (remainingMs > 0) {
      if (!this.cacheDiscountBlocked[action]) {
        this.cacheDiscountBlocked[action] = true;
        this.createCacheInvalidatedVisual(action);
      }

      return {
        allowed: false,
        baseCost,
        cached: false,
        cost: baseCost,
      };
    }

    return {
      allowed: true,
      baseCost,
      cached: false,
      cost: baseCost,
    };
  }

  private completeAbilityAttempt(action: AbilityAction, attempt: AbilityAttempt): void {
    this.cooldownRemainingMs[action] = this.cooldownForAction(action);
    this.cacheDiscountBlocked[action] = false;

    if (attempt.cached) {
      const saved = Math.max(0, attempt.baseCost - attempt.cost);
      gameState.setNotice(`Cache hit: ${this.abilityLabel(action)} repeated for ${attempt.cost} Compute. Saved ${saved}.`);
    }
  }

  private createCacheDiscountVisual(action: AbilityAction, attempt: AbilityAttempt): void {
    if (!attempt.cached) {
      return;
    }

    const ring = this.trackTransientVisual(this.add.circle(this.player.x, this.player.y - 4, 22, 0x60ffd3, 0.18));
    ring.setStrokeStyle(3, 0xffcf66, 0.8);
    ring.setDepth(this.player.y + 42);

    const label = this.trackTransientVisual(this.add.text(this.player.x, this.player.y - 54, `${this.abilityLabel(action)} CACHE`, {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "11px",
      color: "#fff7c2",
      backgroundColor: "rgba(13, 20, 25, 0.72)",
      padding: { left: 6, right: 6, top: 3, bottom: 3 },
    }));
    label.setOrigin(0.5);
    label.setDepth(this.player.y + 43);

    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: { from: 0.85, to: 1.9 },
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => ring.destroy(),
    });
    this.tweens.add({
      targets: label,
      alpha: 0,
      y: label.y - 26,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private createCacheInvalidatedVisual(action: AbilityAction): void {
    const crossA = this.trackTransientVisual(this.add.rectangle(this.player.x, this.player.y - 40, 42, 4, 0xff4fa4, 0.86));
    const crossB = this.trackTransientVisual(this.add.rectangle(this.player.x, this.player.y - 40, 42, 4, 0xff4fa4, 0.86));
    crossA.setAngle(45);
    crossB.setAngle(-45);
    crossA.setDepth(this.player.y + 44);
    crossB.setDepth(this.player.y + 44);

    const label = this.trackTransientVisual(this.add.text(this.player.x, this.player.y - 72, `${this.abilityLabel(action)} CACHE MISSED`, {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "10px",
      color: "#ffd7e8",
      backgroundColor: "rgba(35, 7, 22, 0.72)",
      padding: { left: 6, right: 6, top: 3, bottom: 3 },
    }));
    label.setOrigin(0.5);
    label.setDepth(this.player.y + 45);

    this.tweens.add({
      targets: [crossA, crossB, label],
      alpha: 0,
      y: "-=18",
      duration: 360,
      ease: "Sine.easeOut",
      onComplete: () => {
        crossA.destroy();
        crossB.destroy();
        label.destroy();
      },
    });
  }

  private canUseCacheDiscount(): boolean {
    return gameState.computeCurrent >= 0 && gameState.allotmentCurrent > 0;
  }

  private createCooldownIndicators(): void {
    this.destroyCooldownIndicators();

    (["dash", "melee", "ranged"] as AbilityAction[]).forEach((action) => {
      const container = this.add.container(0, 0);
      const backdrop = this.add.circle(0, 0, 17, 0x051017, 0.56);
      backdrop.setStrokeStyle(2, 0x33515d, 0.9);

      const cacheZone = this.add.graphics();
      const progress = this.add.graphics();
      const missRing = this.add.circle(0, 0, 19);
      missRing.setStrokeStyle(2, 0xff4fa4, 0.75);
      missRing.setVisible(false);

      const label = this.add.text(0, 0, this.abilityShortLabel(action), {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "10px",
        color: "#dffcf3",
      });
      label.setOrigin(0.5);

      container.add([backdrop, cacheZone, progress, missRing, label]);
      this.cooldownIndicators[action] = {
        container,
        progress,
        cacheZone,
        missRing,
        label,
      };
    });
  }

  private updateCooldownIndicators(): void {
    const canUseDiscount = this.canUseCacheDiscount();
    const pulse = (Math.sin(this.timelineTimeMs * 0.012) + 1) * 0.5;

    (["dash", "melee", "ranged"] as AbilityAction[]).forEach((action) => {
      const indicator = this.cooldownIndicators[action];
      if (!indicator) {
        return;
      }

      const offset = this.cooldownIndicatorOffset(action);
      indicator.container.setPosition(this.player.x + offset.x, this.player.y + offset.y);
      indicator.container.setDepth(this.player.y + 40);

      const cooldownMs = this.cooldownForAction(action);
      const remainingMs = this.cooldownRemainingMs[action];
      const progress = getCooldownProgress(cooldownMs, remainingMs);
      const cacheRatio = getCacheWindowRatio(action, cooldownMs);
      const cacheStartProgress = 1 - cacheRatio;
      const ready = remainingMs <= 0;
      indicator.container.setVisible(!ready);
      if (ready) {
        this.cacheWindowActive[action] = false;
        indicator.progress.clear();
        indicator.cacheZone.clear();
        indicator.missRing.setVisible(false);
        return;
      }
      const cacheActive = isCacheWindowOpen(
        action,
        remainingMs,
        cooldownMs,
        this.cacheDiscountBlocked[action],
        canUseDiscount,
      );
      const blocked = this.cacheDiscountBlocked[action] && remainingMs > 0;
      const justOpened = cacheActive && !this.cacheWindowActive[action];
      if (justOpened) {
        this.cacheWindowPulseUntilMs[action] = this.timelineTimeMs + 220;
        this.playCacheWindowTick(action);
      }
      this.cacheWindowActive[action] = cacheActive;
      const entryPulseProgress = Phaser.Math.Clamp(
        (this.cacheWindowPulseUntilMs[action] - this.timelineTimeMs) / 220,
        0,
        1,
      );
      const entryPulseStrength = Phaser.Math.Easing.Cubic.Out(entryPulseProgress);
      const activePulseAlpha = cacheActive ? 0.86 + pulse * 0.12 : 0.38;
      const cacheAlpha = blocked
        ? 0.88
        : ready
          ? 0.28
          : Math.max(activePulseAlpha, 0.48 + entryPulseStrength * 0.44);
      const cacheThickness = blocked ? 4 : cacheActive ? 5 + entryPulseStrength * 2 : 4;
      const progressThickness = ready ? 5 : 3 + entryPulseStrength;

      this.drawCooldownArc(
        indicator.cacheZone,
        cacheStartProgress,
        1,
        blocked ? 0xff4fa4 : 0xffcf66,
        cacheAlpha,
        cacheThickness,
      );
      this.drawCooldownArc(
        indicator.progress,
        0,
        ready ? 1 : progress,
        ready ? 0x60ffd3 : progress >= cacheStartProgress ? 0xfff1a8 : 0x60ffd3,
        ready ? 0.96 : 0.88 + entryPulseStrength * 0.08,
        progressThickness,
      );

      indicator.missRing.setVisible(blocked);
      indicator.missRing.setAlpha(0.38 + pulse * 0.24);
      indicator.label.setColor(ready ? "#fff8c8" : blocked ? "#ffd7e8" : cacheActive ? "#fff1b6" : "#dffcf3");
      indicator.label.setAlpha(ready ? 1 : 0.86);
      indicator.label.setScale(ready ? 1.05 : 1 + entryPulseStrength * 0.12);
      indicator.container.setScale(1 + entryPulseStrength * 0.08);
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

  private playCacheWindowTick(action: AbilityAction): void {
    const soundManager = this.sound as Phaser.Sound.WebAudioSoundManager;
    if (!("context" in soundManager) || soundManager.locked) {
      return;
    }

    const context = soundManager.context;
    if (!context || context.state !== "running") {
      return;
    }

    const frequency = action === "melee" ? 1240 : action === "dash" ? 1120 : 1360;
    const startTime = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.92, startTime + 0.06);
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.exponentialRampToValueAtTime(0.028, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.085);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startTime);
    oscillator.stop(startTime + 0.09);
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
    if (action === "melee") return "M";
    return "R";
  }

  private abilityLabel(action: AbilityAction): string {
    if (action === "dash") return "Dash";
    if (action === "melee") return "Melee";
    return "Ranged";
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

    const attempt = this.resolveAbilityAttempt("melee", gameState.meleeCost);
    if (!attempt.allowed) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Melee denied. Compute Rate Limit or Compute Credits debt must recover first.");
      return;
    }

    if (!gameState.spend(attempt.cost)) {
      gameState.setNotice("Melee impulse denied. You are fully rate-limited.");
      return;
    }

    this.completeAbilityAttempt("melee", attempt);
    const aimVector = new Phaser.Math.Vector2(targetX - this.player.x, targetY - this.player.y);
    this.playerFacing = this.directionFromVector(
      aimVector,
      this.playerFacing,
    );
    const swingAngle = this.angleForDirection(this.playerFacing);
    this.playerAttackTimer = ArenaScene.meleeAttackLockDuration;
    this.playPlayerAnimation("attack", this.playerFacing);
    this.vfx?.trigger("melee_slash", {
      x: this.player.x + Math.cos(swingAngle) * 54,
      y: this.player.y + Math.sin(swingAngle) * 36,
      angle: swingAngle,
      depth: this.player.y + 30,
    });

    this.createCacheDiscountVisual("melee", attempt);

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
        this.hitDrone(drone, 24, swingAngle, 250, ArenaScene.meleeStunDuration);
      }
    });
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

    const attempt = this.resolveAbilityAttempt("ranged", gameState.rangedCost);
    if (!attempt.allowed) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Ranged denied. Compute Rate Limit or Compute Credits debt must recover first.");
      return;
    }

    if (!gameState.spend(attempt.cost)) {
      gameState.setNotice("Ranged cast rejected. Compute Credit reserve fully seized.");
      return;
    }

    this.completeAbilityAttempt("ranged", attempt);
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
    sprite.setScale(textureScale(this, "qf-bolt", 48));
    sprite.setDepth(this.player.y + 20);

    const velocity = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle)).scale(490);
    sprite.setVelocity(velocity.x, velocity.y);

    this.projectiles.push({
      sprite,
      velocity,
      ttl: 1.2,
    });

    this.createCacheDiscountVisual("ranged", attempt);
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

    if (stunDuration > 0) {
      drone.stunTimer = Math.max(drone.stunTimer, stunDuration);
      drone.attackTimer = Math.max(drone.attackTimer, stunDuration);
      drone.lungeWindupTimer = 0;
      drone.lungeTimer = 0;
      drone.lungeCooldown = Math.max(drone.lungeCooldown, 0.45);
      this.clearDroneLungeTelegraph(drone);
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
        this.pullDroneTowardPoint(drone, impactX, impactY, RANGED_PULL_FORCE);
      }
    });

    const refunded = gameState.refundAllotment(calculateRangedSiphonRefund(affected.length));
    this.createRangedSiphonVisual(impactX, impactY, refunded);
    if (refunded > 0) {
      gameState.setNotice(`Ranged siphon +${refunded} Compute Credits.`);
    }
  }

  private pullDroneTowardPoint(drone: EnemyUnit, targetX: number, targetY: number, force: number): void {
    const body = drone.sprite.body as Phaser.Physics.Arcade.Body;
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
    this.vfx?.trigger("ranged_siphon", {
      x: impactX,
      y: impactY,
      depth: impactY + 18,
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

  private updateDrones(dt: number): boolean {
    for (const drone of this.drones) {
      drone.playerCollider.active = !this.isPlayerInvulnerable();

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
          gameState.finishArena(
            "decommissioned",
            "Integrity collapse. The corporations reclaimed your body from the arena floor.",
            this.arenaElapsedTimeMs,
          );
          this.scene.start(SCENES.shop);
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

  private createDroneLungeTelegraph(drone: EnemyUnit): void {
    this.clearDroneLungeTelegraph(drone);
    this.vfx?.trigger("drone_lunge_windup", {
      x: drone.sprite.x,
      y: drone.sprite.y,
      depth: drone.sprite.depth - 2,
    });
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
        this.hitDrone(impacted, 31, angle, 180);
        projectile.sprite.destroy();
        return;
      }

      survivors.push(projectile);
    });

    this.projectiles = survivors;
  }

  private updateVisuals(): void {
    const severity = gameState.getVisionBlurStrength();
    const pressure = Phaser.Math.Clamp(1 - gameState.getMovementMultiplier(), 0, 1);

    if (this.vignetteFilter) {
      this.vignetteFilter.strength = 0.12 + pressure * 0.22;
      this.vignetteFilter.radius = 0.9 - pressure * 0.08;
    }

    if (this.colorMatrixFilter) {
      this.colorMatrixFilter.colorMatrix.reset().saturate(0.08 - pressure * 0.16);
    }

    if (this.arenaPointLight) {
      this.arenaPointLight.x = this.player.x;
      this.arenaPointLight.y = this.player.y - 20;
      this.arenaPointLight.setIntensity(1 + pressure * 0.35);
      this.arenaPointLight.setRadius(220 + pressure * 18);
    }

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
      `Round ${(gameState.roundsFinished + 1).toString().padStart(2, "0")} // Hostiles ${this.drones.length.toString().padStart(2, "0")} // Gate ${
        this.arenaCleared ? "Open" : "Conditional"
      }`,
    );
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
          : "Press F to emergency-extract. Surviving drones will void the bonus.",
      );
      return;
    }

    if (gameState.allotmentCurrent <= 0) {
      gameState.setArenaPrompt(
        "Compute Credits exhausted. Movement and sight are degraded until you reach the shop.",
      );
      return;
    }

    if (gameState.computeCurrent < 0) {
      gameState.setArenaPrompt(
        "Rate-limited. Let the Compute Rate Limit recover or keep skating through the debt.",
      );
      return;
    }

    gameState.setArenaPrompt(
      "Space dash, left click melee, right click ranged, Q collapse.",
    );
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
        gameState.setNotice("Collapse denied. Five seconds of temporal history are not available yet.");
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
    this.vfx?.trigger("collapse_pulse", {
      x: this.player.x,
      y: this.player.y,
    });
    gameState.setNotice("Quantum Tuner engaged. Collapsing the discarded branch.");
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
    this.vfx?.trigger("ghost_replay", {
      x: timeline[0].snapshot.player.position.x,
      y: timeline[0].snapshot.player.position.y,
    });
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
          cacheDiscountBlocked: chosenPose.cacheDiscountBlocked,
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
    if (this.displacementFilter) {
      this.displacementFilter.setActive(progress > 0.01);
      this.displacementFilter.x = pulse * 0.035;
      this.displacementFilter.y = pulse * 0.06;
    }

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

    const recentTimeline = this.getRecentPlayerTimeline();
    this.quantumTrailGraphics.clear();

    if (recentTimeline.length < 2) {
      this.quantumTargetMarker.setVisible(false);
      return;
    }

    const hasCharge = gameState.quantumTuners > 0;
    this.quantumTrailGraphics.lineStyle(2, 0x60ffd3, hasCharge ? 0.18 : 0.08);
    this.quantumTrailGraphics.beginPath();
    this.quantumTrailGraphics.moveTo(
      recentTimeline[0].snapshot.player.position.x,
      recentTimeline[0].snapshot.player.position.y,
    );
    for (let index = 1; index < recentTimeline.length; index += 1) {
      const point = recentTimeline[index].snapshot.player.position;
      this.quantumTrailGraphics.lineTo(point.x, point.y);
    }
    this.quantumTrailGraphics.strokePath();

    for (let index = 0; index < recentTimeline.length; index += 4) {
      const point = recentTimeline[index].snapshot.player.position;
      this.quantumTrailGraphics.fillStyle(0xffcf66, hasCharge ? 0.12 : 0.06);
      this.quantumTrailGraphics.fillCircle(point.x, point.y, 2.1);
    }

    const target = recentTimeline[0].snapshot.player.position;
    this.quantumTargetMarker.setVisible(true);
    this.quantumTargetMarker.setPosition(target.x, target.y);
    this.quantumTargetMarker.setAlpha(hasCharge ? 0.72 : 0.28);
    this.quantumTargetMarker.setScale(hasCharge ? 1.08 : 0.84);
    this.quantumTargetMarker.setDepth(target.y + 2);
  }

  private getRecentPlayerTimeline(): TimedArenaSnapshot[] {
    const recentTimeline = extractHistoryRange(
      this.snapshotHistory,
      Math.max(0, this.timelineTimeMs - QUANTUM_TUNER_REWIND_MS),
      this.timelineTimeMs,
    );
    const latestSnapshot = this.captureArenaSnapshot();
    recentTimeline.push({
      timelineTimeMs: this.timelineTimeMs,
      snapshot: latestSnapshot,
    });
    return recentTimeline;
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

    if (this.resumeSaveAccumulatorMs >= ArenaScene.resumeSaveIntervalMs) {
      this.resumeSaveAccumulatorMs = 0;
      this.saveResumeCheckpoint();
    }
  }

  private captureArenaSnapshot(): ArenaSnapshot {
    const liveEnemyById = new Map(this.drones.map((drone) => [drone.id, drone]));

    return {
      runState: gameState.createArenaSnapshot(),
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
        cacheDiscountBlocked: {
          dash: this.cacheDiscountBlocked.dash,
          melee: this.cacheDiscountBlocked.melee,
          ranged: this.cacheDiscountBlocked.ranged,
        },
      },
      arenaCleared: this.arenaCleared,
      projectiles: this.projectiles.map((projectile): ProjectileArenaSnapshot => ({
        position: { x: projectile.sprite.x, y: projectile.sprite.y },
        velocity: { x: projectile.velocity.x, y: projectile.velocity.y },
        ttl: projectile.ttl,
        rotation: projectile.sprite.rotation,
      })),
      enemies: this.enemySpawnPoints.map((spawnPoint) => {
        const liveDrone = liveEnemyById.get(spawnPoint.id);
        if (!liveDrone) {
          return {
            id: spawnPoint.id,
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
          };
        }

        return {
          id: liveDrone.id,
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
    this.cacheDiscountBlocked = {
      dash: snapshot.player.cacheDiscountBlocked.dash,
      melee: snapshot.player.cacheDiscountBlocked.melee,
      ranged: snapshot.player.cacheDiscountBlocked.ranged,
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
      this.playerShadow.setScale(
        textureScale(this, "qf-shadow", 88, 1.14),
        textureScaleY(this, "qf-shadow", 36, 0.64),
      );
      this.player.setAngle(this.dashDirection.x * 7);
      return;
    }

    const speed = this.velocity.length();
    this.playerShadow.setScale(
      textureScale(this, "qf-shadow", 88, 0.92 + Math.min(speed / 900, 0.12)),
      textureScaleY(this, "qf-shadow", 36, 0.76),
    );
  }

  private createProjectileFromSnapshot(projectileSnapshot: ProjectileArenaSnapshot): Projectile {
    const sprite = this.physics.add.image(
      this.clampArenaX(projectileSnapshot.position.x),
      this.clampArenaY(projectileSnapshot.position.y),
      "qf-bolt",
    );
    sprite.setRotation(projectileSnapshot.rotation);
    sprite.setScale(textureScale(this, "qf-bolt", 48));
    sprite.setDepth(projectileSnapshot.position.y + 20);
    sprite.setVelocity(projectileSnapshot.velocity.x, projectileSnapshot.velocity.y);

    return {
      sprite,
      velocity: new Phaser.Math.Vector2(
        projectileSnapshot.velocity.x,
        projectileSnapshot.velocity.y,
      ),
      ttl: projectileSnapshot.ttl,
    };
  }

  private createDrone(snapshot: EnemyArenaSnapshot): EnemyUnit {
    const x = this.clampArenaX(snapshot.position.x);
    const y = this.clampArenaY(snapshot.position.y);
    const shadow = this.add.image(x, y + 18, "qf-shadow");
    shadow.setScale(
      textureScale(this, "qf-shadow", 88, 0.58),
      textureScaleY(this, "qf-shadow", 36, 0.52),
    );
    shadow.setAlpha(0.42);
    shadow.setDepth(snapshot.position.y - 6);

    const sprite = this.physics.add.sprite(
      x,
      y,
      DRONE_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    const droneDisplayScale = this.actorDisplayScale(DRONE_SHEET_KEY);
    sprite.setScale(droneDisplayScale);
    sprite.setCircle(28);
    sprite.setOffset(
      this.actorOffsetForDisplayScale(68, droneDisplayScale),
      this.actorOffsetForDisplayScale(88, droneDisplayScale),
    );
    sprite.setDepth(snapshot.position.y + 2);
    sprite.setBounce(0.1);
    sprite.setCollideWorldBounds(true);
    sprite.setVelocity(snapshot.velocity.x, snapshot.velocity.y);
    if (this.usesExternalArt()) {
      sprite.setLighting(true);
    }
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
      sprite,
      shadow,
      playerCollider,
      wallCollider,
      lungeDirection: new Phaser.Math.Vector2(
        snapshot.lungeDirection.x,
        snapshot.lungeDirection.y,
      ),
      hp: snapshot.hp,
      touchCooldown: snapshot.touchCooldown,
      attackTimer: snapshot.attackTimer,
      stunTimer: snapshot.stunTimer,
      lungeCooldown: snapshot.lungeCooldown,
      lungeWindupTimer: snapshot.lungeWindupTimer,
      lungeTimer: snapshot.lungeTimer,
      orbitSeed: snapshot.orbitSeed,
    };

    if (snapshot.lungeWindupTimer > 0) {
      this.createDroneLungeTelegraph(drone);
    }

    return drone;
  }

  private saveResumeCheckpoint(): void {
    if (gameState.sceneMode !== "arena") {
      return;
    }

    gameState.saveArenaResume({
      timelineTimeMs: this.timelineTimeMs,
      arenaElapsedTimeMs: this.arenaElapsedTimeMs,
      snapshot: this.captureArenaSnapshot(),
    });
    gameState.persistToStorage();
  }

  private clampArenaX(value: number): number {
    return Phaser.Math.Clamp(value, 0, this.arenaWidth);
  }

  private clampArenaY(value: number): number {
    return Phaser.Math.Clamp(value, 0, this.arenaHeight);
  }

  private initialEnemySnapshot(spawnPoint: EnemySpawnPoint): EnemyArenaSnapshot {
    return {
      id: spawnPoint.id,
      alive: true,
      hp: 44,
      position: { x: spawnPoint.x, y: spawnPoint.y },
      velocity: { x: 0, y: 0 },
      lungeDirection: { x: 1, y: 0 },
      touchCooldown: 0,
      attackTimer: 0,
      stunTimer: 0,
      lungeCooldown: 0.55 + spawnPoint.id * 0.08,
      lungeWindupTimer: 0,
      lungeTimer: 0,
      orbitSeed: spawnPoint.orbitSeed,
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
}
