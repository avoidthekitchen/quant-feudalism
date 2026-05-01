import * as Phaser from "phaser";
import arenaMusicM4aUrl from "../assets/audio/High_Scores_Only.m4a";
import arenaMusicOggUrl from "../assets/audio/High_Scores_Only.ogg";
import outsideMusicM4aUrl from "../assets/audio/Midnight_Perimeter.m4a";
import outsideMusicOggUrl from "../assets/audio/Midnight_Perimeter.ogg";
import { createGeneratedArt } from "../generated-art";
import {
  ART_ASSET_MANIFEST,
  DEFAULT_ART_MODE,
  getRequestedArtMode,
  resolveArtMode,
  shouldQueueExternalArt,
  validateLoadedAssets,
} from "../assets-manifest";
import { SCENES } from "../constants";
import { MUSIC_KEYS } from "../music";
import { gameState } from "../state";

export class BootScene extends Phaser.Scene {
  private selectedArtMode = DEFAULT_ART_MODE;
  private requestedArtMode = DEFAULT_ART_MODE;

  constructor() {
    super(SCENES.boot);
  }

  preload(): void {
    this.load.audio(MUSIC_KEYS.arena, [arenaMusicOggUrl, arenaMusicM4aUrl]);
    this.load.audio(MUSIC_KEYS.outside, [outsideMusicOggUrl, outsideMusicM4aUrl]);
    this.requestedArtMode = getRequestedArtMode();

    if (!shouldQueueExternalArt(this.requestedArtMode)) {
      return;
    }

    this.load.atlas(
      ART_ASSET_MANIFEST.actorAtlases.player.key,
      [
        ART_ASSET_MANIFEST.actorAtlases.player.textureURL,
        ART_ASSET_MANIFEST.actorAtlases.player.normalMapURL!,
      ],
      ART_ASSET_MANIFEST.actorAtlases.player.atlasURL!,
    );
    this.load.atlas(
      ART_ASSET_MANIFEST.actorAtlases.drone.key,
      [
        ART_ASSET_MANIFEST.actorAtlases.drone.textureURL,
        ART_ASSET_MANIFEST.actorAtlases.drone.normalMapURL!,
      ],
      ART_ASSET_MANIFEST.actorAtlases.drone.atlasURL!,
    );

    Object.values(ART_ASSET_MANIFEST.environment).forEach((entry) => {
      if (entry.normalMapURL) {
        this.load.image(entry.key, [entry.textureURL, entry.normalMapURL]);
      } else {
        this.load.image(entry.key, entry.textureURL);
      }
    });
  }

  create(): void {
    if (!shouldQueueExternalArt(this.requestedArtMode)) {
      this.selectedArtMode = "procedural";
      this.registry.set("qf-art-mode", this.selectedArtMode);
      createGeneratedArt(this);
      this.finishBoot();
      return;
    }

    const validation = validateLoadedAssets(
      ART_ASSET_MANIFEST,
      (key) => this.textures.exists(key),
      (key, frame) => this.textures.get(key).has(frame),
    );
    this.selectedArtMode = resolveArtMode(this.requestedArtMode, validation);
    this.registry.set("qf-art-mode", this.selectedArtMode);

    if (this.selectedArtMode === "procedural") {
      createGeneratedArt(this);
      if (validation.missing.length > 0) {
        console.warn(
          `External art missing; procedural fallback enabled. Missing keys: ${validation.missing.join(", ")}`,
        );
      }
    }

    this.finishBoot();
  }

  private finishBoot(): void {
    gameState.hydrateFromStorage();

    if (gameState.sceneMode === "arena") {
      gameState.restoreForShop(
        "Session interrupted during deployment. Returned to procurement chamber.",
      );
    }

    this.scene.start(SCENES.shop);
  }
}
