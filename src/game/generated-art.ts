import * as Phaser from "phaser";

export const PLAYER_SHEET_KEY = "qf-player-sheet";
export const DRONE_SHEET_KEY = "qf-drone-sheet";
export const SPRITE_DIRECTIONS = ["s", "se", "e", "ne", "n", "nw", "w", "sw"] as const;
export const ACTOR_ART_SCALE = 2;
export const ACTOR_FRAME_WIDTH = 96;
export const ACTOR_FRAME_HEIGHT = 112;
export const SPRITE_ACTIONS = {
  idle: 2,
  run: 4,
  attack: 3,
  dash: 3,
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
  const dashPulse = action === "dash" ? frame : -1;
  const bob = action === "run" ? (frame % 2 === 0 ? -2 : 1) : action === "idle" && frame === 1 ? -1 : 0;
  const legA = action === "run" ? [-6, 2, 5, -2][runCycle] : action === "dash" ? -8 : 0;
  const legB = action === "run" ? [5, -3, -6, 3][runCycle] : action === "dash" ? 3 : 0;
  const lean = action === "dash" ? side * 5 : side * 2 + (action === "run" ? side * 2 : 0);
  const aimSide = side === 0 ? 1 : side;
  const cx = x + 48;
  const ground = y + 100;
  const torsoY = y + 44 + bob;
  const headY = y + 24 + bob + (back ? -2 : 0);
  const hoodLean = lean + side;
  const armorShade = back ? "#121a25" : "#0b111a";
  const armorMid = back ? "#1b2633" : "#172432";
  const cloth = back ? "#0a0f17" : "#070b12";
  const plate = action === "dash" ? "#c93557" : "#a92746";
  const neonRed = action === "attack" ? "#ff6b91" : "#ff3f72";
  const neonTeal = action === "dash" ? "#9fffea" : "#60ffd3";
  const visor = back ? neonTeal : "#ff4f8b";

  rect(ctx, x + 27, ground - 9, 42, 8, "rgba(2, 5, 9, 0.46)");
  if (action === "dash") {
    rect(ctx, cx - side * (38 + frame * 9), y + 50 + frame * 3, 32, 4, "rgba(96, 255, 211, 0.42)");
    rect(ctx, cx - side * (31 + frame * 7), y + 64, 24, 4, "rgba(255, 63, 114, 0.35)");
    rect(ctx, cx - side * (26 + frame * 6), y + 73, 18, 3, "rgba(255, 255, 255, 0.28)");
  }

  strokePixelLine(ctx, cx + hoodLean + aimSide * 12, torsoY + 5, cx + hoodLean + aimSide * 31, y + 22, "#070b10", 5);
  strokePixelLine(ctx, cx + hoodLean + aimSide * 14, torsoY + 7, cx + hoodLean + aimSide * 33, y + 24, "#c9fff0", 2);
  rect(ctx, cx + hoodLean + aimSide * 24, y + 20, 5, 15, "#05070b");

  rect(ctx, cx - 13 + legA, y + 71 + bob, 9, 21, "#090f17");
  rect(ctx, cx - 10 + legA, y + 75 + bob, 5, 12, "#1e2d38");
  rect(ctx, cx + 5 + legB, y + 70 + bob, 9, 23, "#0d1420");
  rect(ctx, cx + 7 + legB, y + 74 + bob, 5, 13, "#263746");
  rect(ctx, cx - 14 + legA, y + 91 + bob, 16, 6, "#080c13");
  rect(ctx, cx + 2 + legB, y + 92 + bob, 17, 5, "#080c13");
  rect(ctx, cx - 11 + legA, y + 90 + bob, 7, 3, neonTeal);
  rect(ctx, cx + 9 + legB, y + 91 + bob, 7, 3, neonTeal);

  polygon(ctx, [
    [cx - 20 + lean, torsoY + 2],
    [cx - 7 + lean, torsoY - 3],
    [cx + 17 + lean, torsoY + 3],
    [cx + 14 + lean, torsoY + 35],
    [cx - 17 + lean, torsoY + 37],
  ], "#060a11");
  rect(ctx, cx - 18 + lean, torsoY + 7, 33, 29, armorShade);
  rect(ctx, cx - 13 + lean, torsoY + 10, 21, 22, armorMid);
  rect(ctx, cx - 3 + lean, torsoY + 8, 5, 27, "#05080d");
  rect(ctx, cx - 17 + lean, torsoY + 35, 33, 4, "#222d3a");
  rect(ctx, cx - 20 + lean, torsoY + 12, 6, 19, "#0f1722");
  rect(ctx, cx + 10 + lean, torsoY + 10, 5, 23, neonTeal);
  rect(ctx, cx - 8 + lean, torsoY + 13, 5, 4, "#d7fff8");
  rect(ctx, cx + 2 + lean, torsoY + 17, 4, 4, "#e9fff9");

  if (front) {
    rect(ctx, cx - 24 + lean, torsoY + 8, 10, 14, plate);
    rect(ctx, cx + 12 + lean, torsoY + 8, 10, 13, "#7c1b35");
  } else {
    rect(ctx, cx - 22 + lean, torsoY + 10, 8, 16, "#68182d");
    rect(ctx, cx + 12 + lean, torsoY + 9, 8, 15, "#3a1320");
  }

  if (attackPulse >= 0) {
    const reach = 25 + attackPulse * 13;
    strokePixelLine(
      ctx,
      cx + side * 6,
      torsoY + 18,
      cx + dir.x * reach + side * 14,
      torsoY + 18 + dir.y * reach * 0.55,
      attackPulse === 1 ? "#ffffff" : neonTeal,
      attackPulse === 1 ? 5 : 3,
    );
    strokePixelLine(
      ctx,
      cx + side * 2,
      torsoY + 22,
      cx + dir.x * (reach + 12),
      torsoY + 22 + dir.y * reach * 0.5,
      neonRed,
      2,
    );
  } else {
    rect(ctx, cx - 30 + lean - aimSide * 2, torsoY + 18, 13, 7, "#070b12");
    rect(ctx, cx - 31 + lean - aimSide * 2, torsoY + 15, 8, 9, plate);
    rect(ctx, cx + 15 + lean + aimSide * 2, torsoY + 14, 17, 6, "#070b12");
    rect(ctx, cx + 21 + lean + aimSide * 2, torsoY + 12, 7, 8, "#711a31");
    strokePixelLine(
      ctx,
      cx + lean + aimSide * 6,
      torsoY + 24,
      cx + lean + aimSide * 30,
      torsoY + 17 + dir.y * 8,
      "#111923",
      3,
    );
    strokePixelLine(ctx, cx + lean + aimSide * 9, torsoY + 23, cx + lean + aimSide * 30, torsoY + 17 + dir.y * 8, neonRed, 1);
  }

  polygon(ctx, [
    [cx - 15 + hoodLean, headY + 3],
    [cx - 9 + hoodLean, headY - 7],
    [cx + 8 + hoodLean, headY - 6],
    [cx + 15 + hoodLean, headY + 4],
    [cx + 9 + hoodLean, headY + 20],
    [cx - 10 + hoodLean, headY + 19],
  ], "#060a10");
  rect(ctx, cx - 10 + hoodLean, headY + 2, 19, 15, cloth);
  rect(ctx, cx - 7 + hoodLean, headY + 5, 13, 8, "#101923");
  rect(ctx, cx - 5 + hoodLean + aimSide * 2, headY + 7, 10, 3, visor);
  rect(ctx, cx + hoodLean + aimSide * 7, headY + 9, 4, 3, "#eaffff");
  rect(ctx, cx - 11 + hoodLean, headY + 16, 22, 5, "#111925");
  rect(ctx, cx - 13 + hoodLean, headY + 2, 3, 14, "#263642");

  if (direction.includes("n")) {
    rect(ctx, cx - 4 + lean, torsoY + 1, 8, 42, neonTeal);
    rect(ctx, cx - 18 + hoodLean, headY + 1, 36, 9, "#05080d");
    rect(ctx, cx - 12 + lean, torsoY + 10, 24, 18, "#111a25");
  }

  if (direction.includes("s")) {
    rect(ctx, cx - 7 + lean, torsoY + 6, 14, 20, "#0e1721");
    rect(ctx, cx - 5 + lean, torsoY + 9, 4, 14, neonTeal);
    rect(ctx, cx + 3 + lean, torsoY + 9, 4, 14, neonRed);
    rect(ctx, cx - 12 + hoodLean, headY + 7, 24, 5, "#17222d");
    rect(ctx, cx - 5 + hoodLean + aimSide * 2, headY + 8, 11, 2, visor);
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
  const cx = x + 48;
  const cy = y + 58 + (action === "run" ? Math.sin(frame * Math.PI) * 2 : 0);
  const wing = action === "idle" ? (frame === 0 ? 0 : 2) : [-7, 4, 7, -4][frame % 4] ?? 0;
  const attack = action === "attack";
  const dash = action === "dash";

  rect(ctx, cx - 28, y + 87, 56, 7, "rgba(2, 5, 9, 0.42)");
  if (dash) {
    rect(ctx, cx - side * (42 + frame * 8), cy - 3, 34, 4, "rgba(96, 255, 211, 0.4)");
  }

  ctx.fillStyle = "#05090f";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 22);
  ctx.lineTo(cx + 30 + wing + side * 4, cy);
  ctx.lineTo(cx, cy + 22);
  ctx.lineTo(cx - 30 - wing + side * 4, cy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#20384a";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx + 22 + wing, cy);
  ctx.lineTo(cx, cy + 14);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#132331";
  ctx.beginPath();
  ctx.moveTo(cx, cy - 14);
  ctx.lineTo(cx - 22 - wing, cy);
  ctx.lineTo(cx, cy + 14);
  ctx.closePath();
  ctx.fill();

  rect(ctx, cx - 7 + dir.x * 4, cy - 4 + dir.y * 2, 14, 7, attack ? "#ffffff" : "#ff2c54");
  strokePixelLine(ctx, cx - 34 - wing, cy, cx - 45 - wing, cy + 12, "#ffcf66", 2);
  strokePixelLine(ctx, cx + 34 + wing, cy, cx + 45 + wing, cy + 12, "#60ffd3", 2);

  if (attack) {
    strokePixelLine(ctx, cx, cy, cx + dir.x * (34 + frame * 7), cy + dir.y * (22 + frame * 5), "#ff2c54", 4);
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
    ACTOR_FRAME_WIDTH * ACTOR_ART_SCALE * columns,
    ACTOR_FRAME_HEIGHT * ACTOR_ART_SCALE * SPRITE_DIRECTIONS.length,
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
        const sourceX = x * ACTOR_ART_SCALE;
        const sourceY = y * ACTOR_ART_SCALE;

        ctx.save();
        ctx.translate(sourceX, sourceY);
        ctx.scale(ACTOR_ART_SCALE, ACTOR_ART_SCALE);
        drawFrame(ctx, 0, 0, direction, action, frame);
        ctx.restore();

        texture.add(
          `${action}-${direction}-${frame}`,
          0,
          sourceX,
          sourceY,
          ACTOR_FRAME_WIDTH * ACTOR_ART_SCALE,
          ACTOR_FRAME_HEIGHT * ACTOR_ART_SCALE,
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
  actor: "player" | "drone",
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
  graphics.fillStyle(0x60ffd3, 0.36);
  graphics.fillTriangle(10, 48, 96, 8, 82, 90);
  graphics.fillStyle(0xff4fa4, 0.24);
  graphics.fillTriangle(24, 52, 88, 26, 100, 76);
  graphics.lineStyle(2, 0xf5fffd, 0.85);
  graphics.strokeTriangle(10, 48, 96, 8, 82, 90);
  graphics.generateTexture("qf-slash", 96, 96);

  graphics.clear();
  graphics.fillStyle(0x60ffd3, 0.1);
  graphics.fillCircle(128, 128, 116);
  graphics.fillStyle(0xff4fa4, 0.08);
  graphics.fillCircle(148, 108, 78);
  graphics.fillStyle(0xffcf66, 0.05);
  graphics.fillCircle(96, 152, 64);
  graphics.generateTexture("qf-haze", 256, 256);

  graphics.destroy();
}
