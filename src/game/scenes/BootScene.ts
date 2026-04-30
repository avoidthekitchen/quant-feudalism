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
    gameState.hydrateFromStorage();

    if (gameState.sceneMode === "arena") {
      gameState.restoreForShop(
        "Session interrupted during deployment. Returned to procurement chamber.",
      );
    }

    this.scene.start(SCENES.shop);
  }
}
