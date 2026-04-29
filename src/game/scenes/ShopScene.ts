import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from "../constants";
import { ACTOR_ART_SCALE, PLAYER_SHEET_KEY, spriteFrameName } from "../generated-art";

export class ShopScene extends Phaser.Scene {
  private scanLine?: Phaser.GameObjects.Rectangle;

  constructor() {
    super(SCENES.shop);
  }

  create(): void {
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

    this.add
      .text(84, 74, "PROCUREMENT VESTIBULE", {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "22px",
        color: "#c9fff0",
      })
      .setLetterSpacing(6);

    this.add
      .text(86, 112, "AUSTERITY RITUAL // STATIC PROTOTYPE // NO BACKEND SOVEREIGNTY", {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "12px",
        color: "#ffcf66",
      })
      .setLetterSpacing(2);

    const platform = this.add.container(290, 470);
    const dais = this.add.polygon(0, 54, [0, -74, 170, 0, 0, 74, -170, 0], 0x344653, 0.92);
    dais.setStrokeStyle(2, 0x9fffea, 0.44);
    const avatarShadow = this.add.image(-36, 48, "qf-shadow").setScale(1.05, 0.72).setAlpha(0.52);
    const avatar = this.add
      .image(-36, -4, PLAYER_SHEET_KEY, spriteFrameName("idle", "se", 0))
      .setScale(1.9 / ACTOR_ART_SCALE);
    const terminal = this.add.image(112, 0, "qf-terminal").setScale(1.5);
    platform.add([dais, avatarShadow, avatar, terminal]);

    this.add
      .text(96, 576, "YOUR BODY IS A LEASED RUNTIME.", {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "18px",
        color: "#c9fff0",
      })
      .setLetterSpacing(4);

    this.add
      .text(96, 612, "Deploy from the side panel. Compute Credit purchases refill the reserve, not the pain.", {
        fontFamily: "Azeret Mono, monospace",
        fontSize: "13px",
        color: "#9fb5bd",
        wordWrap: { width: 420 },
      })
      .setLineSpacing(7);

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
  }
}
