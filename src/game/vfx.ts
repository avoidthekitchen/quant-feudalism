import * as Phaser from "phaser";
import type { SpriteDirection } from "./sprite-schema";
import { VFX_PRESETS, type VfxPreset } from "./vfx-presets";

const PLAYER_SHEET_KEY = "qf-player-sheet";

function spriteFrameName(action: string, direction: string, frame: number): string {
  return `${action}-${direction}-${frame}`;
}

function resolveBlendMode(mode: VfxPreset["blendMode"]): Phaser.BlendModes {
  if (mode === "add") {
    return Phaser.BlendModes.ADD;
  }
  if (mode === "screen") {
    return Phaser.BlendModes.SCREEN;
  }
  return Phaser.BlendModes.NORMAL;
}

type TriggerPayload = {
  x: number;
  y: number;
  direction?: Phaser.Math.Vector2;
  facing?: SpriteDirection;
  angle?: number;
  depth?: number;
  onComplete?: () => void;
};

export class ArenaVfxSystem {
  private readonly scene: Phaser.Scene;
  private readonly trackTransientVisual: <T extends Phaser.GameObjects.GameObject>(visual: T) => T;
  private readonly triggeredIds: string[] = [];

  constructor(
    scene: Phaser.Scene,
    trackTransientVisual: <T extends Phaser.GameObjects.GameObject>(visual: T) => T,
  ) {
    this.scene = scene;
    this.trackTransientVisual = trackTransientVisual;
  }

  getTriggerLog(): readonly string[] {
    return this.triggeredIds;
  }

  trigger(id: keyof typeof VFX_PRESETS, payload: TriggerPayload): void {
    this.triggeredIds.push(id);
    const preset = VFX_PRESETS[id];
    if (!preset) {
      return;
    }

    if (preset.cameraShake) {
      this.scene.cameras.main.shake(preset.cameraShake.durationMs, preset.cameraShake.intensity);
    }

    if (id === "dash_afterimage") {
      this.spawnDashAfterimage(payload, preset);
      return;
    }

    if (id === "melee_slash") {
      this.spawnSlashBurst(payload, preset);
      return;
    }

    if (id === "ranged_siphon") {
      this.spawnSiphonBurst(payload, preset);
      return;
    }

    if (payload.onComplete) {
      this.scene.time.delayedCall(preset.lifespanMs, payload.onComplete);
    }
  }

  private spawnDashAfterimage(payload: TriggerPayload, preset: VfxPreset): void {
    if (!payload.facing || !payload.direction) {
      return;
    }

    const frameDirection =
      payload.facing === "w" ? "e" : payload.facing === "nw" ? "ne" : payload.facing === "sw" ? "se" : payload.facing;
    const sprite = this.trackTransientVisual(this.scene.add.image(
      payload.x,
      payload.y,
      PLAYER_SHEET_KEY,
      spriteFrameName("dash", frameDirection, 1),
    ));
    sprite.setScale(0.5);
    sprite.setFlipX(payload.facing === "w" || payload.facing === "nw" || payload.facing === "sw");
    sprite.setAngle(payload.angle ?? 0);
    sprite.setAlpha(0.52);
    sprite.setTint(preset.glowColor ?? 0x60ffd3);
    sprite.setBlendMode(resolveBlendMode(preset.blendMode));
    if (typeof payload.depth === "number") {
      sprite.setDepth(payload.depth);
    }

    this.scene.tweens.add({
      targets: sprite,
      alpha: 0,
      x: sprite.x - payload.direction.x * 42,
      y: sprite.y - payload.direction.y * 22,
      duration: preset.lifespanMs,
      onComplete: () => {
        sprite.destroy();
        payload.onComplete?.();
      },
    });
  }

  private spawnSlashBurst(payload: TriggerPayload, preset: VfxPreset): void {
    const slash = this.trackTransientVisual(this.scene.add.image(payload.x, payload.y, "qf-slash"));
    slash.setRotation(payload.angle ?? 0);
    slash.setDepth(payload.depth ?? slash.y + 20);
    slash.setAlpha(0.72);
    slash.setScale(1.32);
    slash.setBlendMode(resolveBlendMode(preset.blendMode));

    this.scene.tweens.add({
      targets: slash,
      alpha: 0,
      scale: { from: 1.32, to: 1.58 },
      duration: preset.lifespanMs,
      onComplete: () => {
        slash.destroy();
        payload.onComplete?.();
      },
    });
  }

  private spawnSiphonBurst(payload: TriggerPayload, preset: VfxPreset): void {
    const pulse = this.trackTransientVisual(this.scene.add.circle(payload.x, payload.y, 20, preset.glowColor ?? 0x60ffd3, 0.08));
    pulse.setStrokeStyle(2, preset.glowColor ?? 0x60ffd3, 0.65);
    pulse.setDepth(payload.depth ?? payload.y + 18);

    this.scene.tweens.add({
      targets: pulse,
      alpha: 0,
      scale: { from: 0.75, to: 1.35 },
      duration: preset.lifespanMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        pulse.destroy();
        payload.onComplete?.();
      },
    });
  }
}
