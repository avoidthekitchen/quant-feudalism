import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from "../constants";
import {
  ACTOR_DISPLAY_SCALE,
  PLAYER_SHEET_KEY,
  SPRITE_ACTIONS,
  SPRITE_DIRECTIONS,
  type SpriteAction,
  type SpriteDirection,
  spriteAnimationKey,
  spriteFrameName,
} from "../generated-art";
import { playBackgroundMusic } from "../music";

type ShopAction = "deploy" | "market" | "workshop";

type ShopStation = {
  action: ShopAction;
  label: string;
  prompt: string;
  position: Phaser.Math.Vector2;
  radius: number;
  ring: Phaser.GameObjects.Arc;
  labelText: Phaser.GameObjects.Text;
};

export class ShopScene extends Phaser.Scene {
  private static readonly playerSpeed = 235;

  private scanLine?: Phaser.GameObjects.Rectangle;
  private player?: Phaser.GameObjects.Sprite;
  private playerShadow?: Phaser.GameObjects.Image;
  private cursors?: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
  };
  private stations: ShopStation[] = [];
  private activeStation?: ShopStation;
  private promptText?: Phaser.GameObjects.Text;
  private currentPlayerAnim = "";
  private playerFacing: SpriteDirection = "s";

  constructor() {
    super(SCENES.shop);
  }

  create(): void {
    playBackgroundMusic(this, "outside");
    this.stations = [];
    this.activeStation = undefined;
    this.currentPlayerAnim = "";
    this.playerFacing = "s";

    this.cameras.main.setBackgroundColor(0x22313c);

    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x22313c);
    this.add.rectangle(GAME_WIDTH / 2, 124, GAME_WIDTH, 190, 0x344653, 0.86);
    this.add.image(GAME_WIDTH * 0.74, GAME_HEIGHT * 0.44, "qf-haze").setScale(3.1, 2.1).setAlpha(0.24);
    this.add.image(GAME_WIDTH * 0.24, GAME_HEIGHT * 0.74, "qf-haze").setScale(2.4, 1.6).setAlpha(0.16);

    const sigil = this.add.container(GAME_WIDTH * 0.68, GAME_HEIGHT * 0.42);
    const outer = this.add.rectangle(0, 0, 280, 280);
    outer.setStrokeStyle(2, 0x60ffd3, 0.2);
    outer.angle = 45;
    const inner = this.add.rectangle(0, 0, 176, 176);
    inner.setStrokeStyle(2, 0xff4fa4, 0.18);
    inner.angle = 45;
    const seal = this.add.text(0, 0, "QF", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "120px",
      color: "#60ffd3",
    });
    seal.setOrigin(0.5);
    sigil.add([outer, inner, seal]);
    sigil.setAlpha(0.28);

    const platform = this.add.container(290, 470);
    const dais = this.add.polygon(0, 54, [0, -74, 170, 0, 0, 74, -170, 0], 0x344653, 0.92);
    dais.setStrokeStyle(2, 0x9fffea, 0.44);
    const terminal = this.add.image(112, 0, "qf-terminal").setScale(1.5);
    platform.add([dais, terminal]);

    this.registerPlayerAnimations();
    this.createStations();
    this.createPlayer();
    this.createPrompt();

    for (let i = 0; i < 7; i += 1) {
      this.add
        .rectangle(0, 160 + i * 64, GAME_WIDTH, 1, 0x60ffd3, 0.08)
        .setOrigin(0, 0.5);
    }

    this.scanLine = this.add.rectangle(GAME_WIDTH / 2, 0, GAME_WIDTH, 10, 0x60ffd3, 0.12);
    this.tweens.add({
      targets: this.scanLine,
      y: GAME_HEIGHT + 20,
      duration: 3400,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.cursors = this.input.keyboard!.addKeys("W,A,S,D,F") as ShopScene["cursors"];

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.stations = [];
      this.activeStation = undefined;
    });
  }

  update(_time: number, delta: number): void {
    if (!this.player || !this.playerShadow || !this.cursors) {
      return;
    }

    const dt = delta / 1000;
    const direction = new Phaser.Math.Vector2(
      (this.cursors.D.isDown ? 1 : 0) - (this.cursors.A.isDown ? 1 : 0),
      (this.cursors.S.isDown ? 1 : 0) - (this.cursors.W.isDown ? 1 : 0),
    );
    const moving = direction.lengthSq() > 0;

    if (moving) {
      direction.normalize();
      this.player.x = Phaser.Math.Clamp(this.player.x + direction.x * ShopScene.playerSpeed * dt, 100, GAME_WIDTH - 110);
      this.player.y = Phaser.Math.Clamp(this.player.y + direction.y * ShopScene.playerSpeed * dt, 235, GAME_HEIGHT - 96);
      this.playerFacing = this.directionForVector(direction);
    }

    this.playerShadow.setPosition(this.player.x, this.player.y + 18);
    this.playerShadow.setDepth(this.player.y - 16);
    this.player.setDepth(this.player.y);
    this.updatePlayerAnimation(moving ? "run" : "idle");
    this.updateActiveStation();

    if (Phaser.Input.Keyboard.JustDown(this.cursors.F) && this.activeStation) {
      this.triggerStation(this.activeStation);
    }
  }

  private createPlayer(): void {
    this.playerShadow = this.add.image(600, 368, "qf-shadow");
    this.playerShadow.setScale(0.92, 0.68);
    this.playerShadow.setAlpha(0.46);
    this.playerShadow.setDepth(500);

    this.player = this.add.sprite(
      600,
      350,
      PLAYER_SHEET_KEY,
      spriteFrameName("idle", "s", 0),
    );
    this.player.setScale(ACTOR_DISPLAY_SCALE);
    this.player.setDepth(500);
    this.updatePlayerAnimation("idle");
  }

  private createStations(): void {
    this.createStation({
      action: "deploy",
      label: "Arena Gate",
      prompt: "F: Enter Arena",
      x: 1030,
      y: 264,
      radius: 86,
      color: 0xffcf66,
    });
    this.add.image(1030, 250, "qf-gate").setScale(1.24).setAlpha(0.92).setDepth(270);

    this.createStation({
      action: "market",
      label: "Compute Market",
      prompt: "F: Open Shop",
      x: 725,
      y: 470,
      radius: 76,
      color: 0xff4fa4,
    });
    this.add.image(725, 452, "qf-terminal").setScale(1.42).setDepth(468);

    this.createStation({
      action: "workshop",
      label: "Workshop",
      prompt: "F: Enter Workshop",
      x: 500,
      y: 580,
      radius: 82,
      color: 0x60ffd3,
    });
    const workbench = this.add.container(500, 560);
    const slab = this.add.rectangle(0, 26, 156, 38, 0x172938, 0.92);
    slab.setStrokeStyle(2, 0x60ffd3, 0.46);
    const core = this.add.rectangle(-26, -3, 34, 58, 0x0c1822, 0.96);
    core.setStrokeStyle(2, 0xff4fa4, 0.5);
    const vial = this.add.rectangle(30, -6, 18, 50, 0x60ffd3, 0.82);
    workbench.add([slab, core, vial]);
    workbench.setDepth(560);
  }

  private createStation({
    action,
    label,
    prompt,
    x,
    y,
    radius,
    color,
  }: {
    action: ShopAction;
    label: string;
    prompt: string;
    x: number;
    y: number;
    radius: number;
    color: number;
  }): void {
    const ring = this.add.circle(x, y, radius, color, 0.035);
    ring.setStrokeStyle(2, color, 0.46);
    ring.setDepth(y - 8);
    ring.setInteractive(
      new Phaser.Geom.Circle(0, 0, radius),
      Phaser.Geom.Circle.Contains,
    );
    ring.on("pointerdown", () => {
      if (!this.player) {
        return;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        station.position.x,
        station.position.y,
      );
      if (distance <= station.radius) {
        this.triggerStation(station);
      }
    });
    ring.on("pointerover", () => ring.setFillStyle(color, 0.08));
    ring.on("pointerout", () => ring.setFillStyle(color, 0.035));

    const labelText = this.add.text(x, y - radius - 20, label, {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "13px",
      color: "#c9fff0",
    });
    labelText.setOrigin(0.5);
    labelText.setLetterSpacing(2);
    labelText.setDepth(y + 10);

    const station: ShopStation = {
      action,
      label,
      prompt,
      position: new Phaser.Math.Vector2(x, y),
      radius,
      ring,
      labelText,
    };
    this.stations.push(station);
  }

  private createPrompt(): void {
    this.promptText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 32, "", {
      fontFamily: "Azeret Mono, monospace",
      fontSize: "14px",
      color: "#f5fff7",
      backgroundColor: "rgba(5, 10, 16, 0.72)",
      padding: { x: 12, y: 8 },
    });
    this.promptText.setOrigin(0.5);
    this.promptText.setDepth(10_000);
    this.promptText.setVisible(false);
  }

  private updateActiveStation(): void {
    if (!this.player) {
      return;
    }

    let closest: ShopStation | undefined;
    let closestDistance = Number.POSITIVE_INFINITY;
    this.stations.forEach((station) => {
      const distance = Phaser.Math.Distance.Between(
        this.player!.x,
        this.player!.y,
        station.position.x,
        station.position.y,
      );
      const active = distance <= station.radius;
      station.ring.setStrokeStyle(2, active ? 0xf5fff7 : 0x60ffd3, active ? 0.78 : 0.3);
      station.labelText.setAlpha(active ? 1 : 0.68);
      if (active && distance < closestDistance) {
        closest = station;
        closestDistance = distance;
      }
    });

    this.activeStation = closest;
    if (this.promptText) {
      this.promptText.setText(closest?.prompt ?? "Walk to a station or use the buttons.");
      this.promptText.setVisible(true);
      this.promptText.setAlpha(closest ? 1 : 0.68);
    }
  }

  private triggerStation(station: ShopStation): void {
    window.dispatchEvent(
      new CustomEvent("qf:shop-action", {
        detail: { action: station.action },
      }),
    );
  }

  private registerPlayerAnimations(): void {
    (Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][]).forEach(([action, count]) => {
      SPRITE_DIRECTIONS.forEach((direction) => {
        const key = spriteAnimationKey("player", action, direction);
        if (this.anims.exists(key)) {
          return;
        }

        this.anims.create({
          key,
          frames: Array.from({ length: count }, (_, frame) => ({
            key: PLAYER_SHEET_KEY,
            frame: spriteFrameName(action, direction, frame),
          })),
          frameRate: action === "run" ? 9 : 5,
          repeat: -1,
        });
      });
    });
  }

  private updatePlayerAnimation(action: SpriteAction): void {
    if (!this.player) {
      return;
    }

    const key = spriteAnimationKey("player", action, this.playerFacing);
    if (this.currentPlayerAnim === key) {
      return;
    }

    this.currentPlayerAnim = key;
    this.player.play(key, true);
  }

  private directionForVector(vector: Phaser.Math.Vector2): SpriteDirection {
    const angle = Phaser.Math.RadToDeg(Math.atan2(vector.y, vector.x));

    if (angle >= -22.5 && angle < 22.5) {
      return "e";
    }
    if (angle >= 22.5 && angle < 67.5) {
      return "se";
    }
    if (angle >= 67.5 && angle < 112.5) {
      return "s";
    }
    if (angle >= 112.5 && angle < 157.5) {
      return "sw";
    }
    if (angle >= 157.5 || angle < -157.5) {
      return "w";
    }
    if (angle >= -157.5 && angle < -112.5) {
      return "nw";
    }
    if (angle >= -112.5 && angle < -67.5) {
      return "n";
    }
    return "ne";
  }
}
