import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from "../constants";
import {
  ACTOR_ART_SCALE,
  DRONE_SHEET_KEY,
  PLAYER_SHEET_KEY,
  SPRITE_ACTIONS,
  SPRITE_DIRECTIONS,
  type SpriteAction,
  type SpriteDirection,
  spriteAnimationKey,
  spriteFrameName,
} from "../generated-art";
import { gameState } from "../state";

type EnemyUnit = {
  sprite: Phaser.Physics.Arcade.Sprite;
  shadow: Phaser.GameObjects.Image;
  hp: number;
  touchCooldown: number;
  attackTimer: number;
  orbitSeed: number;
};

type Projectile = {
  sprite: Phaser.Physics.Arcade.Image;
  velocity: Phaser.Math.Vector2;
  ttl: number;
};

export class ArenaScene extends Phaser.Scene {
  private readonly arenaWidth = 1640;
  private readonly arenaHeight = 1180;
  private readonly extractionPoint = new Phaser.Math.Vector2(1440, 160);
  private readonly entryPoint = new Phaser.Math.Vector2(200, 980);

  private player!: Phaser.Physics.Arcade.Sprite;
  private playerShadow!: Phaser.GameObjects.Image;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private drones: EnemyUnit[] = [];
  private projectiles: Projectile[] = [];
  private cursors!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
  };
  private promptText!: Phaser.GameObjects.Text;
  private blurFilter?: Phaser.Filters.Blur;
  private extractionRing?: Phaser.GameObjects.Arc;
  private arenaCleared = false;
  private enemyCountLabel?: Phaser.GameObjects.Text;
  private lastMeleeAt = 0;
  private lastRangedAt = 0;
  private lastDashAt = -Infinity;
  private dashTimer = 0;
  private dashDirection = new Phaser.Math.Vector2(1, 0);
  private playerAttackTimer = 0;
  private playerFacing: SpriteDirection = "s";
  private currentPlayerAnim = "";
  private velocity = new Phaser.Math.Vector2();

  constructor() {
    super(SCENES.arena);
  }

  create(): void {
    this.drones = [];
    this.projectiles = [];
    this.velocity.set(0, 0);
    this.dashTimer = 0;
    this.lastDashAt = -Infinity;
    this.playerAttackTimer = 0;
    this.playerFacing = "s";
    this.currentPlayerAnim = "";

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

    this.player = this.physics.add.sprite(
      this.entryPoint.x,
      this.entryPoint.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    this.player.setDepth(this.entryPoint.y);
    this.player.setScale(1 / ACTOR_ART_SCALE);
    this.player.setCollideWorldBounds(true);
    this.player.setSize(44, 40);
    this.player.setOffset(50, 108);
    const playerBody = this.player.body as Phaser.Physics.Arcade.Body;
    playerBody.setMaxVelocity(560, 560);

    this.physics.add.collider(this.player, this.walls);

    this.spawnEnemies();

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.cameras.main.setZoom(1.08);
    this.blurFilter = this.cameras.main.filters!.external.addBlur(
      0,
      1,
      1,
      0.001,
      0xeaffff,
      2,
    );

    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", this.handlePointerDown, this);

    this.cursors = this.input.keyboard!.addKeys("W,A,S,D,F,SPACE") as ArenaScene["cursors"];

    this.promptText = this.add.text(22, GAME_HEIGHT - 92, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "13px",
      color: "#eaf8ea",
      backgroundColor: "rgba(11, 17, 18, 0.56)",
      padding: { left: 8, right: 8, top: 6, bottom: 6 },
    });
    this.promptText.setScrollFactor(0);
    this.promptText.setDepth(9999);

    this.enemyCountLabel = this.add.text(24, 24, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "14px",
      color: "#dcf7e3",
    });
    this.enemyCountLabel.setScrollFactor(0);
    this.enemyCountLabel.setDepth(9999);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.off("pointerdown", this.handlePointerDown, this);
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    const pointer = this.input.activePointer;
    pointer.updateWorldPoint(this.cameras.main);

    this.updatePlayerMovement(dt, pointer);
    this.updatePlayerOrientation(pointer);
    this.updateDrones(dt);
    this.updateProjectiles(dt);
    this.updateVisuals();
    this.updateExtractionPrompt();
    this.playerAttackTimer = Math.max(0, this.playerAttackTimer - dt);

    gameState.regenerate(delta);

    if (Phaser.Input.Keyboard.JustDown(this.cursors.F) && this.canExtract()) {
      const note = this.arenaCleared
        ? "Arena pacified. Procurement rights renewed."
        : "Emergency extraction granted. The corporations keep the unused fear.";
      gameState.finishArena(this.arenaCleared ? "cleared" : "retreated", note);
      this.scene.start(SCENES.shop);
    }

    if (!this.arenaCleared && this.drones.length === 0) {
      this.arenaCleared = true;
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
  }

  private drawArenaFloor(): void {
    this.add.rectangle(
      this.arenaWidth / 2,
      this.arenaHeight / 2,
      this.arenaWidth + 40,
      this.arenaHeight + 40,
      0x070b12,
    );

    const startX = 80;
    const startY = 44;
    for (let row = 0; row < 26; row += 1) {
      for (let col = 0; col < 17; col += 1) {
        const x = startX + col * 96 + (row % 2) * 48;
        const y = startY + row * 46;
        const tile = this.add.image(x, y, "qf-floor");
        tile.setAlpha((row + col) % 5 === 0 ? 0.98 : 0.78);
        tile.setDepth(-260 + row);
      }
    }

    for (let i = 0; i < 9; i += 1) {
      const line = this.add.rectangle(820, 120 + i * 118, 1480, 1, 0x60ffd3, 0.08);
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
        fontSize: "13px",
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
    ];

    positions.forEach(([x, y], index) => {
      const shadow = this.add.image(x, y + 18, "qf-shadow");
      shadow.setScale(0.58, 0.52);
      shadow.setAlpha(0.42);
      shadow.setDepth(y - 6);

      const sprite = this.physics.add.sprite(x, y, DRONE_SHEET_KEY, spriteFrameName("idle", "s", 0));
      sprite.setScale(1 / ACTOR_ART_SCALE);
      sprite.setCircle(28);
      sprite.setOffset(68, 88);
      sprite.setDepth(y + 2);
      sprite.setBounce(0.1);
      sprite.setCollideWorldBounds(true);
      this.physics.add.collider(sprite, this.walls);
      this.physics.add.collider(sprite, this.player);

      this.drones.push({
        sprite,
        shadow,
        hp: 44,
        touchCooldown: 0,
        attackTimer: 0,
        orbitSeed: index * 0.6,
      });
    });
  }

  private registerActorAnimations(): void {
    this.registerAnimationSet("player", PLAYER_SHEET_KEY);
    this.registerAnimationSet("drone", DRONE_SHEET_KEY);
  }

  private registerAnimationSet(actor: "player" | "drone", sheetKey: string): void {
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
      this.dashTimer -= dt;
      const dashSpeed = 520 * gameState.getMovementMultiplier();
      this.velocity.copy(this.dashDirection).scale(dashSpeed);
      this.player.setVelocity(this.velocity.x, this.velocity.y);
      this.updatePlayerSprite(input, pointer, "dash");
      this.updatePlayerShadow();
      return;
    }

    const movementMultiplier = gameState.getMovementMultiplier();
    const maxSpeed = 220 * movementMultiplier;
    const accelerate = 510 * movementMultiplier;
    const decelerate = 660 * (0.8 + movementMultiplier * 0.25);

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
    const now = this.time.now;
    if (now - this.lastDashAt < 620 || this.dashTimer > 0) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Dash denied. Compute or allotment debt must recover first.");
      return;
    }

    if (!gameState.spend(gameState.dashCost)) {
      gameState.setNotice("Dash denied. Compute window cannot authorize displacement.");
      return;
    }

    const direction = input.lengthSq() > 0
      ? input.clone()
      : new Phaser.Math.Vector2(pointer.worldX - this.player.x, pointer.worldY - this.player.y);

    if (direction.lengthSq() === 0) {
      direction.set(1, 0);
    }

    direction.normalize();

    this.lastDashAt = now;
    this.dashTimer = 0.16;
    this.dashDirection.copy(direction);
    this.playerFacing = this.directionFromVector(direction, this.playerFacing);
    this.cameras.main.shake(90, 0.0022);
    this.createDashAfterimage();
  }

  private createDashAfterimage(): void {
    const afterimage = this.add.image(
      this.player.x,
      this.player.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("dash", this.animationDirectionForFacing(this.playerFacing), 1),
    );
    afterimage.setScale(1 / ACTOR_ART_SCALE);
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

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    pointer.updateWorldPoint(this.cameras.main);

    if (pointer.rightButtonDown()) {
      this.tryRanged(pointer.worldX, pointer.worldY);
      return;
    }

    this.tryMelee(pointer.worldX, pointer.worldY);
  }

  private tryMelee(targetX: number, targetY: number): void {
    const now = this.time.now;
    if (now - this.lastMeleeAt < 280) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Melee denied. Compute or allotment debt must recover first.");
      return;
    }

    if (!gameState.spend(gameState.meleeCost)) {
      gameState.setNotice("Melee impulse denied. You are fully rate-limited.");
      return;
    }

    this.lastMeleeAt = now;
    const aimVector = new Phaser.Math.Vector2(targetX - this.player.x, targetY - this.player.y);
    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
    this.playerFacing = this.directionFromVector(
      aimVector,
      this.playerFacing,
    );
    const swingAngle = this.angleForDirection(this.playerFacing);
    this.playerAttackTimer = 0.18;
    this.playPlayerAnimation("attack", this.playerFacing);
    const slash = this.add.image(
      this.player.x + Math.cos(swingAngle) * 46,
      this.player.y + Math.sin(swingAngle) * 30,
      "qf-slash",
    );
    slash.setRotation(swingAngle);
    slash.setDepth(this.player.y + 30);
    slash.setAlpha(0.72);
    slash.setScale(1.18);

    this.tweens.add({
      targets: slash,
      alpha: 0,
      scale: { from: 1.18, to: 1.42 },
      duration: 130,
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

      if (distance <= 142 && forwardReach > -18 && delta <= 1.08) {
        this.hitDrone(drone, 24, swingAngle, 250);
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
    const now = this.time.now;
    if (now - this.lastRangedAt < 520) {
      return;
    }

    if (!gameState.canUseAbility()) {
      gameState.setNotice("Ranged denied. Compute or allotment debt must recover first.");
      return;
    }

    if (!gameState.spend(gameState.rangedCost)) {
      gameState.setNotice("Ranged cast rejected. Allotment reserve fully seized.");
      return;
    }

    this.lastRangedAt = now;

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, targetX, targetY);
    this.playerFacing = this.directionFromVector(
      new Phaser.Math.Vector2(targetX - this.player.x, targetY - this.player.y),
      this.playerFacing,
    );
    this.playerAttackTimer = 0.16;
    this.playPlayerAnimation("attack", this.playerFacing);
    const sprite = this.physics.add.image(
      this.player.x + Math.cos(angle) * 28,
      this.player.y + Math.sin(angle) * 28,
      "qf-bolt",
    );
    sprite.setRotation(angle);
    sprite.setDepth(this.player.y + 20);

    const velocity = new Phaser.Math.Vector2(Math.cos(angle), Math.sin(angle)).scale(490);
    sprite.setVelocity(velocity.x, velocity.y);

    this.projectiles.push({
      sprite,
      velocity,
      ttl: 1.2,
    });
  }

  private hitDrone(drone: EnemyUnit, damage: number, angle: number, force: number): void {
    drone.hp -= damage;
    drone.sprite.setVelocity(
      Math.cos(angle) * force,
      Math.sin(angle) * force,
    );

    this.tweens.add({
      targets: drone.sprite,
      alpha: { from: 0.25, to: 1 },
      duration: 90,
      yoyo: true,
    });

    if (drone.hp <= 0) {
      drone.shadow.destroy();
      drone.sprite.destroy();
      this.drones = this.drones.filter((candidate) => candidate !== drone);
      gameState.registerKill();
    }
  }

  private updateDrones(dt: number): void {
    this.drones.forEach((drone) => {
      const toPlayer = new Phaser.Math.Vector2(this.player.x - drone.sprite.x, this.player.y - drone.sprite.y);
      const distance = toPlayer.length();
      const direction = toPlayer.normalize();
      const orbit = new Phaser.Math.Vector2(-direction.y, direction.x).scale(
        Math.sin(this.time.now * 0.0018 + drone.orbitSeed) * 46,
      );
      const desired = direction.scale(distance > 58 ? 132 : 68).add(orbit);

      const body = drone.sprite.body as Phaser.Physics.Arcade.Body;
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

      if (drone.touchCooldown > 0) {
        drone.touchCooldown -= dt;
      }
      drone.attackTimer = Math.max(0, drone.attackTimer - dt);

      if (distance < 46 && drone.touchCooldown <= 0) {
        drone.touchCooldown = 0.9;
        drone.attackTimer = 0.26;
        const died = gameState.applyDamage(14);
        this.cameras.main.shake(130, 0.0035);

        if (died) {
          gameState.finishArena(
            "decommissioned",
            "Integrity collapse. The corporations reclaimed your body from the arena floor.",
          );
          this.scene.start(SCENES.shop);
        }
      }

      drone.shadow.setPosition(drone.sprite.x, drone.sprite.y + 16);
      drone.shadow.setDepth(drone.sprite.y - 12);
      drone.sprite.setDepth(drone.sprite.y + 5);
      drone.sprite.setAngle(Math.sin(this.time.now * 0.004 + drone.orbitSeed) * 5);
      const droneDirection = this.directionFromVector(body.velocity, "s");
      const droneAction: SpriteAction = drone.attackTimer > 0 ? "attack" : body.velocity.lengthSq() > 400 ? "run" : "idle";
      drone.sprite.play(spriteAnimationKey("drone", droneAction, droneDirection), true);
    });
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
    if (this.blurFilter) {
      this.blurFilter.strength = 0.001 + severity * 0.95;
      this.blurFilter.x = 0.8 + severity * 2.4;
      this.blurFilter.y = 0.8 + severity * 2.4;
      this.blurFilter.steps = severity > 0.7 ? 4 : 2;
    }

    this.enemyCountLabel?.setText(
      `Hostiles ${this.drones.length.toString().padStart(2, "0")} // Gate ${
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
      this.promptText.setText(
        this.arenaCleared
          ? "Press F to extract and collect the corporate bounty."
          : "Press F to emergency-extract. Surviving drones will void the bonus.",
      );
      return;
    }

    if (gameState.allotmentCurrent <= 0) {
      this.promptText.setText("Allotment exhausted. Movement and sight are degraded until you reach the shop.");
      return;
    }

    if (gameState.computeCurrent < 0) {
      this.promptText.setText("Rate-limited. Let the compute window recover or keep skating through the debt.");
      return;
    }

    this.promptText.setText("Space to dash. Left click melee, right click ranged. Abilities drain both pools.");
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
}
