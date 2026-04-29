import * as Phaser from "phaser";
import { createGeneratedArt } from "../generated-art";
import { SCENES } from "../constants";
import { gameState } from "../state";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  create(): void {
    createGeneratedArt(this);
    gameState.restoreForShop(
      "Procurement chamber online. Buy more compute or deploy into the arena.",
    );
    this.scene.start(SCENES.shop);
  }
}
