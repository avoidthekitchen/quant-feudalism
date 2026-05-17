import * as Phaser from "phaser";

export const PLAYER_SHEET_KEY = "qf-player-sheet";
export const DRONE_SHEET_KEY = "qf-drone-sheet";
export const HOPPER_SHEET_KEY = "qf-hopper-sheet";
export const SPRITE_DIRECTIONS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;
export const ACTOR_FRAME_WIDTH = 192;
export const ACTOR_FRAME_HEIGHT = 224;
export const ACTOR_DISPLAY_SCALE = 0.5;
export const SPRITE_ACTIONS = {
  idle: 4,
  run: 6,
  attack: 5,
  dash: 4,
} as const;

export type SpriteDirection = (typeof SPRITE_DIRECTIONS)[number];
export type SpriteAction = keyof typeof SPRITE_ACTIONS;

type PlayerFrameOptions = {
  key: string;
  legA: number;
  legB: number;
  armA: number;
  armB: number;
  torsoLean: number;
  headY: number;
  dash?: boolean;
};

function drawPlayerFrame(
  graphics: Phaser.GameObjects.Graphics,
  {
    key,
    legA,
    legB,
    armA,
    armB,
    torsoLean,
    headY,
    dash = false,
  }: PlayerFrameOptions,
): void {
  graphics.clear();
  graphics.fillStyle(0x050912, 0.45);
  graphics.fillEllipse(35, 70, 34, 12);
  graphics.fillStyle(0x061119, 1);
  graphics.fillRect(24 + torsoLean, 29, 20, 34);
  graphics.fillStyle(dash ? 0x1f7783 : 0x164957, 1);
  graphics.fillRect(16 + torsoLean, 35, 20, 28);
  graphics.fillStyle(0x26d6bf, 1);
  graphics.fillRect(35 + torsoLean, 31, 12, 25);
  graphics.fillStyle(0xebf8d7, 1);
  graphics.fillRect(28 + torsoLean, headY, 16, 15);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(42 + torsoLean, headY + 4, 4, 8);
  graphics.fillStyle(0xffcf66, 1);
  graphics.fillRect(20 + legA, 61, 8, 12);
  graphics.fillRect(39 + legB, 58, 8, 15);
  graphics.fillStyle(0x071017, 1);
  graphics.fillRect(13 + armA, 47, 11, 8);
  graphics.fillRect(43 + armB, 41, 16, 6);
  graphics.lineStyle(2, 0xc9fff0, dash ? 1 : 0.9);
  graphics.lineBetween(50 + torsoLean, 28, 64 + torsoLean, 16);
  graphics.lineBetween(54 + torsoLean, 30, 68 + torsoLean, 23);
  graphics.lineStyle(2, 0xff4fa4, 0.7);
  graphics.lineBetween(14 + armA, 35, 6 + armA, 50);

  if (dash) {
    graphics.fillStyle(0x60ffd3, 0.32);
    graphics.fillTriangle(10, 40, 2, 52, 12, 62);
    graphics.fillStyle(0xff4fa4, 0.24);
    graphics.fillTriangle(16, 34, 4, 42, 18, 50);
  }

  graphics.generateTexture(key, 72, 80);
}

function drawDroneFrame(
  graphics: Phaser.GameObjects.Graphics,
  key: string,
  wingOffset: number,
  eyeY: number,
): void {
  graphics.clear();
  graphics.fillStyle(0x05090f, 1);
  graphics.fillTriangle(28, 2, 54 + wingOffset, 18, 28, 34);
  graphics.fillTriangle(28, 2, 2 - wingOffset, 18, 28, 34);
  graphics.fillStyle(0x243342, 1);
  graphics.fillTriangle(28, 7, 47 + wingOffset, 18, 28, 29);
  graphics.fillStyle(0x15222d, 1);
  graphics.fillTriangle(28, 7, 9 - wingOffset, 18, 28, 29);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(24, eyeY, 8, 6);
  graphics.lineStyle(2, 0x60ffd3, 0.85);
  graphics.strokeTriangle(28, 2, 54 + wingOffset, 18, 28, 34);
  graphics.strokeTriangle(28, 2, 2 - wingOffset, 18, 28, 34);
  graphics.lineStyle(1, 0xffcf66, 0.74);
  graphics.lineBetween(7 - wingOffset, 18, -wingOffset, 28);
  graphics.lineBetween(49 + wingOffset, 18, 56 + wingOffset, 28);
  graphics.generateTexture(key, 56, 40);
}

function actionColumnOffset(action: SpriteAction): number {
  let offset = 0;
  for (const [candidate, count] of Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][]) {
    if (candidate === action) {
      return offset;
    }
    offset += count;
  }

  return offset;
}

function directionVector(direction: SpriteDirection): Phaser.Math.Vector2 {
  const vectors: Record<SpriteDirection, [number, number]> = {
    s: [0, 1],
    se: [1, 1],
    e: [1, 0],
    ne: [1, -1],
    n: [0, -1],
    nw: [-1, -1],
    w: [-1, 0],
    sw: [-1, 1],
  };
  const [x, y] = vectors[direction];
  return new Phaser.Math.Vector2(x, y).normalize();
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(width), Math.round(height));
}

function strokePixelLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width = 3,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(Math.round(x1), Math.round(y1));
  ctx.lineTo(Math.round(x2), Math.round(y2));
  ctx.stroke();
}

function polygon(
  ctx: CanvasRenderingContext2D,
  points: [number, number][],
  color: string,
): void {
  if (points.length === 0) {
    return;
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(Math.round(points[0][0]), Math.round(points[0][1]));
  points.slice(1).forEach(([pointX, pointY]) => {
    ctx.lineTo(Math.round(pointX), Math.round(pointY));
  });
  ctx.closePath();
  ctx.fill();
}

function drawPlayerSheetFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: SpriteDirection,
  action: SpriteAction,
  frame: number,
): void {
  const dir = directionVector(direction);
  const side = Math.sign(dir.x);
  const back = dir.y < -0.25;
  const front = dir.y > 0.25;
  const runCycle = action === "run" ? frame : 0;
  const attackPulse = action === "attack" ? frame : -1;
  const idleBob = action === "idle" ? [0, -1, -2, -1][frame] : 0;
  const bob = action === "run" ? [-4, -1, 2, -3, 1, 3][runCycle] : idleBob;
  const legA = action === "run" ? [-14, -6, 7, 13, 5, -8][runCycle] : action === "dash" ? -16 - frame * 3 : 0;
  const legB = action === "run" ? [12, 7, -4, -13, -7, 6][runCycle] : action === "dash" ? 8 + frame : 0;
  const lean = action === "dash" ? side * (10 + frame * 2) : side * 4 + (action === "run" ? side * (3 + (frame % 3)) : 0);
  const aimSide = side === 0 ? 1 : side;
  const cx = x + 96;
  const ground = y + 200;
  const torsoY = y + 88 + bob;
  const headY = y + 48 + bob + (back ? -4 : 0);
  const hoodLean = lean + side;
  const armorShade = back ? "#121a25" : "#0b111a";
  const armorMid = back ? "#1b2633" : "#172432";
  const cloth = back ? "#0a0f17" : "#070b12";
  const plate = action === "dash" ? "#c93557" : "#a92746";
  const neonRed = action === "attack" ? "#ff6b91" : "#ff3f72";
  const neonTeal = action === "dash" ? "#9fffea" : "#60ffd3";
  const visor = back ? neonTeal : "#ff4f8b";

  rect(ctx, x + 54, ground - 18, 84, 16, "rgba(2, 5, 9, 0.46)");
  if (action === "dash") {
    rect(ctx, cx - side * (76 + frame * 18), y + 100 + frame * 6, 64, 8, "rgba(96, 255, 211, 0.42)");
    rect(ctx, cx - side * (62 + frame * 14), y + 128, 48, 8, "rgba(255, 63, 114, 0.35)");
    rect(ctx, cx - side * (52 + frame * 12), y + 146, 36, 6, "rgba(255, 255, 255, 0.28)");
    rect(ctx, cx - side * (42 + frame * 22), y + 88 + frame * 7, 10, 4, "rgba(201, 255, 240, 0.42)");
    rect(ctx, cx - side * (86 + frame * 20), y + 158 - frame * 5, 8, 3, "rgba(255, 79, 164, 0.38)");
  }

  const drawBackSword = () => {
    strokePixelLine(ctx, cx + hoodLean + aimSide * 24, torsoY + 10, cx + hoodLean + aimSide * 62, y + 44, "#070b10", 10);
    strokePixelLine(ctx, cx + hoodLean + aimSide * 28, torsoY + 14, cx + hoodLean + aimSide * 66, y + 48, "#c9fff0", 4);
    rect(ctx, cx + hoodLean + aimSide * 48, y + 40, 10, 30, "#05070b");
  };

  if (!back) drawBackSword();

  rect(ctx, cx - 26 + legA, y + 142 + bob, 18, 42, "#090f17");
  rect(ctx, cx - 20 + legA, y + 150 + bob, 10, 24, "#1e2d38");
  rect(ctx, cx + 10 + legB, y + 140 + bob, 18, 46, "#0d1420");
  rect(ctx, cx + 14 + legB, y + 148 + bob, 10, 26, "#263746");
  rect(ctx, cx - 28 + legA, y + 182 + bob, 32, 12, "#080c13");
  rect(ctx, cx + 4 + legB, y + 184 + bob, 34, 10, "#080c13");
  rect(ctx, cx - 22 + legA, y + 180 + bob, 14, 6, neonTeal);
  rect(ctx, cx + 18 + legB, y + 182 + bob, 14, 6, neonTeal);

  polygon(ctx, [
    [cx - 40 + lean, torsoY + 4],
    [cx - 14 + lean, torsoY - 6],
    [cx + 34 + lean, torsoY + 6],
    [cx + 28 + lean, torsoY + 70],
    [cx - 34 + lean, torsoY + 74],
  ], "#060a11");
  rect(ctx, cx - 36 + lean, torsoY + 14, 66, 58, armorShade);
  rect(ctx, cx - 26 + lean, torsoY + 20, 42, 44, armorMid);
  rect(ctx, cx - 6 + lean, torsoY + 16, 10, 54, "#05080d");
  rect(ctx, cx - 34 + lean, torsoY + 70, 66, 8, "#222d3a");
  rect(ctx, cx - 40 + lean, torsoY + 24, 12, 38, "#0f1722");
  rect(ctx, cx + 20 + lean, torsoY + 20, 10, 46, neonTeal);
  rect(ctx, cx - 16 + lean, torsoY + 26, 10, 8, "#d7fff8");
  rect(ctx, cx + 4 + lean, torsoY + 34, 8, 8, "#e9fff9");

  if (front) {
    rect(ctx, cx - 48 + lean, torsoY + 16, 20, 28, plate);
    rect(ctx, cx + 24 + lean, torsoY + 16, 20, 26, "#7c1b35");
  } else {
    rect(ctx, cx - 44 + lean, torsoY + 20, 16, 32, "#68182d");
    rect(ctx, cx + 24 + lean, torsoY + 18, 16, 30, "#3a1320");
  }

  if (attackPulse >= 0) {
    const reach = [34, 56, 106, 86, 52][attackPulse] ?? 70;
    const attackWidth = attackPulse === 2 ? 12 : attackPulse === 3 ? 8 : 5;
    strokePixelLine(
      ctx,
      cx - dir.x * (attackPulse === 0 ? 18 : 4) + side * 12,
      torsoY + 36 - (attackPulse === 0 ? 8 : 0),
      cx + dir.x * reach + side * 28,
      torsoY + 36 + dir.y * reach * 0.55,
      attackPulse === 2 ? "#ffffff" : neonTeal,
      attackWidth,
    );
    strokePixelLine(
      ctx,
      cx + side * 4,
      torsoY + 44,
      cx + dir.x * (reach + 28),
      torsoY + 44 + dir.y * reach * 0.5,
      neonRed,
      attackPulse === 2 ? 7 : 4,
    );
    rect(ctx, cx + dir.x * (reach - 8), torsoY + 28 + dir.y * reach * 0.35, 8, 8, attackPulse === 2 ? "#fff8d6" : "rgba(96, 255, 211, 0.65)");
  } else {
    rect(ctx, cx - 60 + lean - aimSide * 4, torsoY + 36, 26, 14, "#070b12");
    rect(ctx, cx - 62 + lean - aimSide * 4, torsoY + 30, 16, 18, plate);
    rect(ctx, cx + 30 + lean + aimSide * 4, torsoY + 28, 34, 12, "#070b12");
    rect(ctx, cx + 42 + lean + aimSide * 4, torsoY + 24, 14, 16, "#711a31");
    
    // Fingers on left hand
    rect(ctx, cx - 66 + lean - aimSide * 4, torsoY + 38, 6, 4, "#263746");
    rect(ctx, cx - 66 + lean - aimSide * 4, torsoY + 42, 5, 3, "#263746");
    rect(ctx, cx - 64 + lean - aimSide * 4, torsoY + 46, 4, 3, "#263746");
    
    // Fingers on right hand
    rect(ctx, cx + 54 + lean + aimSide * 4, torsoY + 30, 4, 5, "#263746");
    rect(ctx, cx + 56 + lean + aimSide * 4, torsoY + 26, 3, 4, "#263746");
    rect(ctx, cx + 58 + lean + aimSide * 4, torsoY + 34, 3, 4, "#263746");

    strokePixelLine(
      ctx,
      cx + lean + aimSide * 12,
      torsoY + 48,
      cx + lean + aimSide * 60,
      torsoY + 34 + dir.y * 16,
      "#111923",
      6,
    );
    strokePixelLine(ctx, cx + lean + aimSide * 18, torsoY + 46, cx + lean + aimSide * 60, torsoY + 34 + dir.y * 16, neonRed, 2);
  }

  polygon(ctx, [
    [cx - 30 + hoodLean, headY + 6],
    [cx - 18 + hoodLean, headY - 14],
    [cx + 16 + hoodLean, headY - 12],
    [cx + 30 + hoodLean, headY + 8],
    [cx + 18 + hoodLean, headY + 40],
    [cx - 20 + hoodLean, headY + 38],
  ], "#060a10");
  rect(ctx, cx - 20 + hoodLean, headY + 4, 38, 30, cloth);
  rect(ctx, cx - 14 + hoodLean, headY + 10, 26, 16, "#101923");
  rect(ctx, cx - 10 + hoodLean + aimSide * 4, headY + 14, 20, 6, visor);
  rect(ctx, cx + hoodLean + aimSide * 14, headY + 18, 8, 6, "#eaffff");
  rect(ctx, cx - 22 + hoodLean, headY + 32, 44, 10, "#111925");
  rect(ctx, cx - 26 + hoodLean, headY + 4, 6, 28, "#263642");

  if (direction.includes("n")) {
    rect(ctx, cx - 8 + lean, torsoY + 2, 16, 84, neonTeal);
    rect(ctx, cx - 36 + hoodLean, headY + 2, 72, 18, "#05080d");
    rect(ctx, cx - 24 + lean, torsoY + 20, 48, 36, "#111a25");
  }

  if (back) drawBackSword();

  if (direction.includes("s")) {
    rect(ctx, cx - 14 + lean, torsoY + 12, 28, 40, "#0e1721");
    rect(ctx, cx - 10 + lean, torsoY + 18, 8, 28, neonTeal);
    rect(ctx, cx + 6 + lean, torsoY + 18, 8, 28, neonRed);
    rect(ctx, cx - 24 + hoodLean, headY + 14, 48, 10, "#17222d");
    rect(ctx, cx - 10 + hoodLean + aimSide * 4, headY + 16, 22, 4, visor);
  }
}

function drawDroneSheetFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: SpriteDirection,
  action: SpriteAction,
  frame: number,
): void {
  const dir = directionVector(direction);
  const side = Math.sign(dir.x);
  const cx = x + 96;
  const cy = y + 116 + (action === "run" ? [-4, 2, 5, -2, 3, -3][frame % 6] : action === "attack" ? frame * 2 : 0);
  const wing = action === "idle" ? [0, 3, 5, 2][frame] : [-16, -7, 8, 16, 6, -10][frame % 6] ?? 0;
  const attack = action === "attack";
  const dash = action === "dash";

  rect(ctx, cx - 56, y + 174, 112, 14, "rgba(2, 5, 9, 0.42)");
  if (dash) {
    rect(ctx, cx - side * (84 + frame * 16), cy - 6, 68, 8, "rgba(96, 255, 211, 0.4)");
  }

  ctx.fillStyle = "#05090f";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 44);
  ctx.lineTo(cx + 60 + wing + side * 8, cy);
  ctx.lineTo(cx, cy + 44);
  ctx.lineTo(cx - 60 - wing + side * 8, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#20384a";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 28);
  ctx.lineTo(cx + 44 + wing, cy);
  ctx.lineTo(cx, cy + 28);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#132331";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 28);
  ctx.lineTo(cx - 44 - wing, cy);
  ctx.lineTo(cx, cy + 28);
  ctx.closePath();
  ctx.fill();

  rect(ctx, cx - 14 + dir.x * 8, cy - 8 + dir.y * 4, 28, 14, attack ? "#ffffff" : "#ff2c54");
  strokePixelLine(ctx, cx - 68 - wing, cy, cx - 90 - wing, cy + 24, "#ffcf66", 4);
  strokePixelLine(ctx, cx + 68 + wing, cy, cx + 90 + wing, cy + 24, "#60ffd3", 4);

  if (attack) {
    rect(ctx, cx - 30 - dir.x * frame * 7, cy - 22 - dir.y * frame * 4, 60, 44, `rgba(255, 79, 164, ${0.08 + frame * 0.04})`);
    strokePixelLine(ctx, cx - dir.x * frame * 8, cy - dir.y * frame * 6, cx + dir.x * (68 + frame * 18), cy + dir.y * (44 + frame * 12), frame >= 3 ? "#ffffff" : "#ff2c54", 8 + frame);
  }
}

function drawHopperSheetFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  direction: SpriteDirection,
  action: SpriteAction,
  frame: number,
): void {
  const dir = directionVector(direction);
  const side = Math.sign(dir.x) || 1;
  const cx = x + 96;
  const hopPulse = action === "run" ? [0, -12, -20, -8, 4, 1][frame % 6] : action === "dash" ? -16 + frame * 4 : 0;
  const crouch = action === "attack" ? frame * 3 : action === "idle" ? [0, 1, 2, 1][frame] : 0;
  const cy = y + 136 + hopPulse + crouch;
  const legSpread = action === "run" ? [32, 44, 54, 48, 34, 24][frame % 6] : action === "attack" ? 26 - frame : 38;
  const antennaLift = action === "attack" ? 12 + frame * 5 : 5;
  const glow = action === "attack";

  rect(ctx, cx - 48, y + 178, 96, 12, "rgba(2, 5, 9, 0.38)");

  if (action === "run" || action === "dash") {
    rect(ctx, cx - side * (72 + frame * 14), cy + 8, 54, 7, "rgba(255, 207, 102, 0.34)");
    rect(ctx, cx - side * (54 + frame * 12), cy + 22, 38, 6, "rgba(255, 107, 53, 0.26)");
  }

  if (glow) {
    rect(ctx, cx - 42 + dir.x * 12, cy - 42 + dir.y * 8, 84, 84, "rgba(255, 107, 53, 0.14)");
    rect(ctx, cx - 28 + dir.x * 18, cy - 28 + dir.y * 12, 56, 56, "rgba(255, 207, 102, 0.16)");
  }

  const rearLegColor = "#442716";
  const legColor = "#784118";
  const hotLeg = "#ffcf66";
  strokePixelLine(ctx, cx - 26, cy + 20, cx - legSpread, cy + 58, rearLegColor, 9);
  strokePixelLine(ctx, cx - legSpread, cy + 58, cx - legSpread - 30, cy + 66, legColor, 9);
  strokePixelLine(ctx, cx + 26, cy + 20, cx + legSpread, cy + 58, rearLegColor, 9);
  strokePixelLine(ctx, cx + legSpread, cy + 58, cx + legSpread + 30, cy + 66, legColor, 9);
  strokePixelLine(ctx, cx - 18, cy + 18, cx - 36, cy + 46, hotLeg, 4);
  strokePixelLine(ctx, cx + 18, cy + 18, cx + 36, cy + 46, hotLeg, 4);

  strokePixelLine(ctx, cx - 24, cy + 2, cx - 58, cy + 26, "#5f3518", 7);
  strokePixelLine(ctx, cx + 24, cy + 2, cx + 58, cy + 26, "#5f3518", 7);
  rect(ctx, cx - 66, cy + 24, 18, 8, "#ff6b35");
  rect(ctx, cx + 48, cy + 24, 18, 8, "#ff6b35");

  ctx.fillStyle = "#130d08";
  ctx.beginPath();
  ctx.ellipse(cx, cy, 42, 28 - crouch, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ff8f2f";
  ctx.beginPath();
  ctx.ellipse(cx + side * 6, cy - 2, 32, 20 - crouch * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#743815";
  ctx.beginPath();
  ctx.ellipse(cx - side * 14, cy + 4, 22, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  polygon(ctx, [
    [cx - 34 + dir.x * 4, cy - 4],
    [cx - 12 + dir.x * 10, cy - 30],
    [cx + 22 + dir.x * 12, cy - 26],
    [cx + 36 + dir.x * 8, cy - 2],
    [cx + 16 + dir.x * 6, cy + 18],
    [cx - 24 + dir.x * 2, cy + 16],
  ], "#1a0f08");
  polygon(ctx, [
    [cx - 22 + dir.x * 6, cy - 5],
    [cx - 8 + dir.x * 12, cy - 20],
    [cx + 18 + dir.x * 12, cy - 18],
    [cx + 28 + dir.x * 8, cy - 2],
    [cx + 10 + dir.x * 6, cy + 10],
    [cx - 16 + dir.x * 2, cy + 8],
  ], "#ffb13d");

  rect(ctx, cx - 16 + dir.x * 16, cy - 10 + dir.y * 4, 26, 9, glow ? "#ffffff" : "#261106");
  rect(ctx, cx - 12 + dir.x * 18, cy - 8 + dir.y * 4, 18, 5, glow ? "#ff3d1f" : "#60ffd3");
  rect(ctx, cx + 8 + dir.x * 15, cy - 12 + dir.y * 4, 7, 7, "#fff8d6");

  strokePixelLine(ctx, cx - 4 + dir.x * 12, cy - 26, cx - 22 + dir.x * 34, cy - 58 - antennaLift, "#ffcf66", 3);
  strokePixelLine(ctx, cx + 10 + dir.x * 12, cy - 24, cx + 30 + dir.x * 34, cy - 54 - antennaLift, "#ffcf66", 3);
  rect(ctx, cx - 26 + dir.x * 34, cy - 62 - antennaLift, 7, 7, "#ff6b35");
  rect(ctx, cx + 27 + dir.x * 34, cy - 58 - antennaLift, 7, 7, "#ff6b35");

  rect(ctx, cx - 28, cy + 8, 56, 6, "#2a1609");
  rect(ctx, cx - 20, cy + 10, 12, 5, "#ffcf66");
  rect(ctx, cx + 6, cy + 10, 12, 5, "#ffcf66");

  if (glow) {
    strokePixelLine(ctx, cx + dir.x * 24, cy - 6, cx + dir.x * (78 + frame * 12), cy + dir.y * (36 + frame * 8), "#ff6b35", 7);
    strokePixelLine(ctx, cx + dir.x * 26, cy - 6, cx + dir.x * (82 + frame * 12), cy + dir.y * (38 + frame * 8), "#ffcf66", 3);
  }
}

function createActorSheet(
  scene: Phaser.Scene,
  key: string,
  drawFrame: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    direction: SpriteDirection,
    action: SpriteAction,
    frame: number,
  ) => void,
): void {
  if (scene.textures.exists(key)) {
    return;
  }

  const columns = Object.values(SPRITE_ACTIONS).reduce((total, count) => total + count, 0);
  const texture = scene.textures.createCanvas(
    key,
    ACTOR_FRAME_WIDTH * columns,
    ACTOR_FRAME_HEIGHT * SPRITE_DIRECTIONS.length,
  );

  if (!texture) {
    return;
  }

  const ctx = texture.context;
  ctx.imageSmoothingEnabled = false;

  SPRITE_DIRECTIONS.forEach((direction, row) => {
    (Object.entries(SPRITE_ACTIONS) as [SpriteAction, number][]).forEach(([action, count]) => {
      const offset = actionColumnOffset(action);
      for (let frame = 0; frame < count; frame += 1) {
        const x = (offset + frame) * ACTOR_FRAME_WIDTH;
        const y = row * ACTOR_FRAME_HEIGHT;

        drawFrame(ctx, x, y, direction, action, frame);

        texture.add(
          `${action}-${direction}-${frame}`,
          0,
          x,
          y,
          ACTOR_FRAME_WIDTH,
          ACTOR_FRAME_HEIGHT,
        );
      }
    });
  });

  texture.refresh();
}

export function spriteFrameName(
  action: SpriteAction,
  direction: SpriteDirection,
  frame: number,
): string {
  return `${action}-${direction}-${frame}`;
}

export function spriteAnimationKey(
  actor: "player" | "drone" | "hopper",
  action: SpriteAction,
  direction: SpriteDirection,
): string {
  return `${actor}-${action}-${direction}`;
}

export function createGeneratedArt(scene: Phaser.Scene): void {
  if (scene.textures.exists("qf-floor")) {
    return;
  }

  const graphics = scene.add.graphics();
  graphics.setVisible(false);
  createActorSheet(scene, PLAYER_SHEET_KEY, drawPlayerSheetFrame);
  createActorSheet(scene, DRONE_SHEET_KEY, drawDroneSheetFrame);
  createActorSheet(scene, HOPPER_SHEET_KEY, drawHopperSheetFrame);

  graphics.clear();
  graphics.fillStyle(0x344653, 1);
  graphics.fillTriangle(64, 6, 124, 36, 64, 66);
  graphics.fillTriangle(64, 6, 4, 36, 64, 66);
  graphics.fillStyle(0x49606d, 1);
  graphics.fillTriangle(64, 10, 118, 36, 64, 61);
  graphics.fillStyle(0x3c515f, 1);
  graphics.fillTriangle(64, 10, 10, 36, 64, 61);
  graphics.fillStyle(0x22313c, 0.78);
  graphics.fillTriangle(4, 36, 64, 66, 64, 72);
  graphics.fillTriangle(124, 36, 64, 66, 64, 72);
  graphics.lineStyle(2, 0x9fffea, 0.34);
  graphics.lineBetween(64, 6, 124, 36);
  graphics.lineBetween(124, 36, 64, 66);
  graphics.lineStyle(2, 0xff4fa4, 0.2);
  graphics.lineBetween(64, 66, 4, 36);
  graphics.lineBetween(4, 36, 64, 6);
  graphics.lineStyle(1, 0xe6fff9, 0.18);
  graphics.lineBetween(64, 10, 64, 64);
  graphics.lineBetween(12, 36, 116, 36);
  graphics.lineStyle(1, 0xffcf66, 0.28);
  graphics.lineBetween(47, 27, 64, 36);
  graphics.lineBetween(64, 36, 82, 27);
  graphics.generateTexture("qf-floor", 128, 74);

  graphics.clear();
  graphics.fillStyle(0x2b3b47, 1);
  graphics.fillTriangle(64, 6, 124, 36, 64, 66);
  graphics.fillTriangle(64, 6, 4, 36, 64, 66);
  graphics.lineStyle(2, 0x071017, 0.62);
  graphics.lineBetween(28, 34, 48, 26);
  graphics.lineBetween(50, 48, 70, 38);
  graphics.lineBetween(78, 34, 108, 42);
  graphics.lineStyle(1, 0xff4fa4, 0.32);
  graphics.lineBetween(30, 35, 46, 28);
  graphics.lineBetween(80, 35, 106, 42);
  graphics.generateTexture("qf-floor-cracked", 128, 74);

  graphics.clear();
  graphics.fillStyle(0x2f4350, 1);
  graphics.fillTriangle(64, 6, 124, 36, 64, 66);
  graphics.fillTriangle(64, 6, 4, 36, 64, 66);
  graphics.lineStyle(2, 0x60ffd3, 0.48);
  graphics.lineBetween(14, 36, 42, 36);
  graphics.lineBetween(42, 36, 56, 28);
  graphics.lineBetween(56, 28, 92, 28);
  graphics.lineBetween(64, 42, 112, 42);
  graphics.fillStyle(0xc9fff0, 0.6);
  graphics.fillRect(54, 26, 5, 5);
  graphics.fillRect(90, 26, 5, 5);
  graphics.generateTexture("qf-floor-circuit", 128, 74);

  graphics.clear();
  graphics.fillStyle(0x1b2934, 1);
  graphics.fillTriangle(64, 6, 124, 36, 64, 66);
  graphics.fillTriangle(64, 6, 4, 36, 64, 66);
  graphics.fillStyle(0x071017, 0.56);
  graphics.fillEllipse(64, 40, 74, 24);
  graphics.lineStyle(1, 0x9fffea, 0.22);
  graphics.strokeEllipse(64, 40, 82, 30);
  graphics.generateTexture("qf-floor-pool", 128, 74);

  graphics.clear();
  graphics.fillStyle(0x263844, 1);
  graphics.fillTriangle(64, 6, 124, 36, 64, 66);
  graphics.fillTriangle(64, 6, 4, 36, 64, 66);
  graphics.lineStyle(1, 0x0b151d, 0.72);
  for (let i = 0; i < 6; i += 1) {
    graphics.lineBetween(28 + i * 14, 22, 16 + i * 14, 50);
    graphics.lineBetween(18 + i * 18, 34, 42 + i * 18, 48);
  }
  graphics.lineStyle(1, 0xffcf66, 0.22);
  graphics.lineBetween(24, 54, 104, 22);
  graphics.generateTexture("qf-floor-grate", 128, 74);

  graphics.clear();
  graphics.fillStyle(0x02060a, 0.72);
  graphics.fillEllipse(44, 18, 78, 24);
  graphics.fillStyle(0x0df2c9, 0.12);
  graphics.fillEllipse(44, 18, 86, 30);
  graphics.generateTexture("qf-shadow", 88, 36);

  graphics.clear();
  drawPlayerFrame(graphics, {
    key: "qf-player",
    legA: 0,
    legB: 0,
    armA: 0,
    armB: 0,
    torsoLean: 0,
    headY: 15,
  });
  drawPlayerFrame(graphics, {
    key: "qf-player-run-0",
    legA: -3,
    legB: 4,
    armA: 4,
    armB: -3,
    torsoLean: 1,
    headY: 14,
  });
  drawPlayerFrame(graphics, {
    key: "qf-player-run-1",
    legA: 4,
    legB: -4,
    armA: -2,
    armB: 3,
    torsoLean: -1,
    headY: 16,
  });
  drawPlayerFrame(graphics, {
    key: "qf-player-dash",
    legA: -6,
    legB: -2,
    armA: -4,
    armB: 5,
    torsoLean: 4,
    headY: 14,
    dash: true,
  });

  drawDroneFrame(graphics, "qf-drone", 0, 15);
  drawDroneFrame(graphics, "qf-drone-0", -4, 14);
  drawDroneFrame(graphics, "qf-drone-1", 5, 16);

  graphics.clear();
  graphics.fillStyle(0x09121a, 1);
  graphics.fillRect(27, 28, 42, 104);
  graphics.fillStyle(0x1f3440, 1);
  graphics.fillRect(35, 20, 48, 112);
  graphics.fillStyle(0x0d1b25, 1);
  graphics.fillTriangle(35, 20, 59, 2, 83, 20);
  graphics.fillStyle(0x315568, 1);
  graphics.fillTriangle(35, 20, 59, 38, 83, 20);
  graphics.fillStyle(0x60ffd3, 1);
  graphics.fillRect(43, 42, 6, 70);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(64, 54, 10, 38);
  graphics.fillStyle(0xffcf66, 1);
  graphics.fillRect(43, 118, 32, 5);
  graphics.lineStyle(2, 0xc9fff0, 0.65);
  graphics.lineBetween(35, 20, 59, 2);
  graphics.lineBetween(59, 2, 83, 20);
  graphics.lineBetween(35, 20, 35, 132);
  graphics.lineBetween(83, 20, 83, 132);
  graphics.generateTexture("qf-pillar", 112, 150);

  graphics.clear();
  graphics.fillStyle(0x061119, 1);
  graphics.fillRect(18, 42, 156, 22);
  graphics.fillRect(26, 10, 28, 128);
  graphics.fillRect(138, 10, 28, 128);
  graphics.fillStyle(0x1a3c49, 1);
  graphics.fillRect(36, 20, 22, 106);
  graphics.fillRect(130, 20, 22, 106);
  graphics.fillStyle(0x60ffd3, 1);
  graphics.fillRect(57, 26, 75, 7);
  graphics.fillRect(82, 34, 8, 78);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(70, 126, 54, 8);
  graphics.lineStyle(3, 0xc9fff0, 0.72);
  graphics.lineBetween(28, 10, 96, 0);
  graphics.lineBetween(96, 0, 164, 10);
  graphics.lineBetween(28, 10, 28, 138);
  graphics.lineBetween(164, 10, 164, 138);
  graphics.lineStyle(2, 0xffcf66, 0.82);
  graphics.strokeRect(66, 45, 60, 70);
  graphics.generateTexture("qf-gate", 192, 150);

  graphics.clear();
  graphics.fillStyle(0x071017, 1);
  graphics.fillTriangle(44, 6, 80, 26, 44, 46);
  graphics.fillTriangle(44, 6, 8, 26, 44, 46);
  graphics.fillRect(20, 28, 48, 74);
  graphics.fillStyle(0x173843, 1);
  graphics.fillRect(26, 34, 48, 60);
  graphics.fillStyle(0x60ffd3, 1);
  graphics.fillRect(31, 40, 34, 8);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(32, 56, 18, 5);
  graphics.fillRect(32, 68, 28, 5);
  graphics.lineStyle(2, 0xc9fff0, 0.72);
  graphics.lineBetween(8, 26, 44, 6);
  graphics.lineBetween(44, 6, 80, 26);
  graphics.strokeRect(20, 28, 48, 74);
  graphics.generateTexture("qf-terminal", 88, 112);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.72);
  graphics.fillRect(0, 6, 44, 5);
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(30, 3, 16, 11);
  graphics.fillStyle(0xff4fa4, 1);
  graphics.fillRect(10, 3, 12, 3);
  graphics.generateTexture("qf-bolt", 48, 18);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.18);
  graphics.fillEllipse(30, 10, 72, 24);
  graphics.fillStyle(0xff4fa4, 0.12);
  graphics.fillEllipse(24, 10, 48, 16);
  graphics.fillStyle(0xffffff, 0.92);
  graphics.fillRect(22, 7, 26, 6);
  graphics.generateTexture("qf-bolt-glow", 72, 24);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.36);
  graphics.fillTriangle(10, 48, 96, 8, 82, 90);
  graphics.fillStyle(0xff4fa4, 0.24);
  graphics.fillTriangle(24, 52, 88, 26, 100, 76);
  graphics.lineStyle(2, 0xf5fffd, 0.85);
  graphics.strokeTriangle(10, 48, 96, 8, 82, 90);
  graphics.generateTexture("qf-slash", 96, 96);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.16);
  graphics.fillTriangle(4, 58, 118, 8, 92, 118);
  graphics.fillStyle(0xff4fa4, 0.24);
  graphics.fillTriangle(22, 56, 108, 30, 124, 94);
  graphics.lineStyle(5, 0xffffff, 0.78);
  graphics.lineBetween(18, 58, 100, 20);
  graphics.lineStyle(3, 0xffcf66, 0.72);
  graphics.lineBetween(34, 76, 112, 88);
  graphics.generateTexture("qf-slash-heavy", 128, 128);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.1);
  graphics.fillCircle(128, 128, 116);
  graphics.fillStyle(0xff4fa4, 0.08);
  graphics.fillCircle(148, 108, 78);
  graphics.fillStyle(0xffcf66, 0.05);
  graphics.fillCircle(96, 152, 64);
  graphics.generateTexture("qf-haze", 256, 256);

  graphics.clear();
  graphics.fillStyle(0xffffff, 0.92);
  graphics.fillCircle(5, 5, 4);
  graphics.fillStyle(0x60ffd3, 0.48);
  graphics.fillCircle(5, 5, 5);
  graphics.generateTexture("qf-spark", 10, 10);

  graphics.clear();
  graphics.lineStyle(3, 0xffffff, 0.78);
  graphics.strokeCircle(32, 32, 18);
  graphics.lineStyle(2, 0x60ffd3, 0.42);
  graphics.strokeCircle(32, 32, 26);
  graphics.generateTexture("qf-impact-ring", 64, 64);

  graphics.clear();
  graphics.fillStyle(0xffffff, 1);
  graphics.fillRect(0, 0, 8, 8);
  graphics.generateTexture("qf-hit-flash", 8, 8);

  graphics.clear();
  graphics.fillStyle(0x020408, 0.42);
  graphics.fillEllipse(44, 18, 74, 22);
  graphics.lineStyle(1, 0xff4fa4, 0.24);
  graphics.lineBetween(18, 17, 70, 20);
  graphics.lineStyle(1, 0xffcf66, 0.2);
  graphics.lineBetween(28, 12, 56, 26);
  graphics.generateTexture("qf-scorch", 88, 36);

  graphics.destroy();
}
