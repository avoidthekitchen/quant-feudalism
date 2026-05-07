import * as Phaser from "phaser";
import arenaMusicM4aUrl from "../assets/audio/High_Scores_Only.m4a";
import arenaMusicOggUrl from "../assets/audio/High_Scores_Only.ogg";
import outsideMusicM4aUrl from "../assets/audio/Midnight_Perimeter.m4a";
import outsideMusicOggUrl from "../assets/audio/Midnight_Perimeter.ogg";
import { createGeneratedArt } from "../generated-art";
import { SCENES } from "../constants";
import { MUSIC_KEYS } from "../music";
import { gameState } from "../state";

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.load.audio(MUSIC_KEYS.arena, [arenaMusicOggUrl, arenaMusicM4aUrl]);
    this.load.audio(MUSIC_KEYS.outside, [outsideMusicOggUrl, outsideMusicM4aUrl]);
  }

  create(): void {
    createGeneratedArt(this);
    gameState.hydrateFromStorage();

    this.scene.start(SCENES.shop);
  }
}
