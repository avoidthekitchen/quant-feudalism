import * as Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH, SCENES } from "./constants";
import { ArenaScene } from "./scenes/ArenaScene";
import { BootScene } from "./scenes/BootScene";
import { ShopScene } from "./scenes/ShopScene";

export function createGame(parent: string): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: false,
    backgroundColor: "#13181b",
    maxLights: 12,
    scene: [BootScene, ShopScene, ArenaScene],
    physics: {
      default: "arcade",
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    },
    fps: {
      target: 60,
    },
    callbacks: {
      postBoot: (game) => {
        game.scene.start(SCENES.boot);
      },
    },
  });
}
