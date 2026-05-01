import * as Phaser from "phaser";

export function textureScale(
  scene: Phaser.Scene,
  textureKey: string,
  expectedWidth: number,
  baseScale = 1,
): number {
  const frame = scene.textures.getFrame(textureKey);
  if (!frame || frame.width <= 0) {
    return baseScale;
  }

  return baseScale * (expectedWidth / frame.width);
}

export function textureScaleY(
  scene: Phaser.Scene,
  textureKey: string,
  expectedHeight: number,
  baseScale = 1,
): number {
  const frame = scene.textures.getFrame(textureKey);
  if (!frame || frame.height <= 0) {
    return baseScale;
  }

  return baseScale * (expectedHeight / frame.height);
}

export function frameDisplayScale(
  scene: Phaser.Scene,
  textureKey: string,
  frameName: string,
  targetDisplayWidth: number,
): number {
  const frame = scene.textures.getFrame(textureKey, frameName);
  if (!frame || frame.width <= 0) {
    return 1;
  }

  return targetDisplayWidth / frame.width;
}
