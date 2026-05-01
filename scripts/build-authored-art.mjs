import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const repoRoot = path.resolve(import.meta.dirname, "..");
const defaultPlayerSourcePath = "/Users/mistercheese/Downloads/Gemini_Generated_Image_8nxdza8nxdza8nxd.png";
const playerSourcePath = path.resolve(process.argv[2] ?? defaultPlayerSourcePath);
const outRoot = path.join(repoRoot, "public", "assets", "art");

const directions = ["s", "se", "e", "ne", "n", "nw", "w", "sw"];
const actions = {
  idle: 2,
  run: 4,
  attack: 3,
  dash: 3,
};

const frameWidth = 512;
const frameHeight = 596;
const sourceDirectionOrder = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const directionToSourceIndex = new Map(sourceDirectionOrder.map((direction, index) => [direction, index]));
const sourceGroupLeft = 20;
const sourceGroupWidth = 168.75;
const sourceRows = {
  idle0: { top: 132, height: 150 },
  idle1: { top: 132, height: 150 },
  run0: { top: 316, height: 148 },
  run1: { top: 316, height: 148 },
  attack0: { top: 493, height: 122 },
  attack1: { top: 493, height: 122 },
  dash0: { top: 642, height: 118 },
};

function rgba(r, g, b, a = 255) {
  return { r, g, b, a };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pixelIndex(width, x, y) {
  return (y * width + x) * 4;
}

function colorDistance(a, b) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function saturation(r, g, b) {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

function samplePixel(data, width, x, y) {
  const index = pixelIndex(width, x, y);
  return rgba(data[index], data[index + 1], data[index + 2], data[index + 3]);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function estimateBackground(data, width, height) {
  const samples = [];
  for (let y = 4; y < height - 4; y += 8) {
    samples.push(samplePixel(data, width, 4, y));
    samples.push(samplePixel(data, width, width - 5, y));
  }
  for (let x = 4; x < width - 4; x += 8) {
    samples.push(samplePixel(data, width, x, 4));
    samples.push(samplePixel(data, width, x, height - 5));
  }
  return rgba(
    median(samples.map((sample) => sample.r)),
    median(samples.map((sample) => sample.g)),
    median(samples.map((sample) => sample.b)),
  );
}

function connectedKeepMask(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  const stack = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) {
      continue;
    }

    const component = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const current = stack.pop();
      component.push(current);
      const x = current % width;
      const y = Math.floor(current / width);
      const neighbors = [
        x > 0 ? current - 1 : -1,
        x < width - 1 ? current + 1 : -1,
        y > 0 ? current - width : -1,
        y < height - 1 ? current + width : -1,
      ];

      for (const next of neighbors) {
        if (next >= 0 && mask[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }

    components.push(component);
  }

  const kept = new Uint8Array(mask.length);
  for (const component of components) {
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    for (const item of component) {
      const x = item % width;
      const y = Math.floor(item / width);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    const componentWidth = maxX - minX + 1;
    const componentHeight = maxY - minY + 1;
    const isGridLine =
      (componentWidth <= 4 && componentHeight > 10) ||
      (componentHeight <= 4 && componentWidth > 10);
    if (component.length >= 18 && componentHeight >= 8 && componentWidth >= 8 && !isGridLine) {
      for (const item of component) {
        kept[item] = 1;
      }
    }
  }
  return kept;
}

async function extractCell(source, left, top, width, height, options = {}) {
  const crop = await source
    .clone()
    .extract({
      left,
      top,
      width,
      height,
    })
    .raw()
    .ensureAlpha()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = crop;
  const candidate = new Uint8Array(info.width * info.height);
  const background = estimateBackground(data, info.width, info.height);

  for (let y = 1; y < info.height - 1; y += 1) {
    for (let x = 1; x < info.width - 1; x += 1) {
      const index = pixelIndex(info.width, x, y);
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const sat = saturation(r, g, b);
      const brightness = (r + g + b) / 3;
      const distantFromBackground = colorDistance(rgba(r, g, b), background) > 45;
      const vividSprite = sat > 30 && brightness < 180 && distantFromBackground;
      const darkSprite = brightness < 72 && distantFromBackground;
      const skinOrHair = r > 135 && g > 95 && b > 70 && b < 185 && distantFromBackground;
      if (vividSprite || darkSprite || skinOrHair) {
        candidate[y * info.width + x] = 1;
      }
    }
  }

  for (let y = 0; y < info.height; y += 1) {
    let candidatePixels = 0;
    for (let x = 0; x < info.width; x += 1) {
      candidatePixels += candidate[y * info.width + x];
    }
    if (candidatePixels > info.width * 0.82) {
      for (let x = 0; x < info.width; x += 1) {
        candidate[y * info.width + x] = 0;
      }
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    let candidatePixels = 0;
    for (let y = 0; y < info.height; y += 1) {
      candidatePixels += candidate[y * info.width + x];
    }
    if (candidatePixels > info.height * 0.82) {
      for (let y = 0; y < info.height; y += 1) {
        candidate[y * info.width + x] = 0;
      }
    }
  }

  const dilated = new Uint8Array(candidate);
  for (let pass = 0; pass < 2; pass += 1) {
    const sourceMask = new Uint8Array(dilated);
    for (let y = 1; y < info.height - 1; y += 1) {
      for (let x = 1; x < info.width - 1; x += 1) {
        const item = y * info.width + x;
        if (sourceMask[item]) {
          continue;
        }
        const index = pixelIndex(info.width, x, y);
        const r = data[index];
        const g = data[index + 1];
        const b = data[index + 2];
        const brightness = (r + g + b) / 3;
        const nearSprite =
          sourceMask[item - 1] ||
          sourceMask[item + 1] ||
          sourceMask[item - info.width] ||
          sourceMask[item + info.width];
        if (nearSprite && brightness < 105) {
          dilated[item] = 1;
        }
      }
    }
  }

  for (let y = 0; y < info.height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < info.width; x += 1) {
      const index = pixelIndex(info.width, x, y);
      if (data[index] < 60 && data[index + 1] < 60 && data[index + 2] < 70) {
        darkPixels += 1;
      }
    }
    if (darkPixels > info.width * 0.45) {
      for (let x = 0; x < info.width; x += 1) {
        dilated[y * info.width + x] = 0;
      }
    }
  }

  for (let x = 0; x < info.width; x += 1) {
    let darkPixels = 0;
    for (let y = 0; y < info.height; y += 1) {
      const index = pixelIndex(info.width, x, y);
      if (data[index] < 60 && data[index + 1] < 60 && data[index + 2] < 70) {
        darkPixels += 1;
      }
    }
    if (darkPixels > info.height * 0.45) {
      for (let y = 0; y < info.height; y += 1) {
        dilated[y * info.width + x] = 0;
      }
    }
  }

  const kept = connectedKeepMask(dilated, info.width, info.height);
  const out = Buffer.alloc(info.width * info.height * 4);
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const src = pixelIndex(info.width, x, y);
      const dst = src;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = kept[y * info.width + x] ? 255 : 0;
    }
  }

  let image = sharp(out, {
    raw: {
      width: info.width,
      height: info.height,
      channels: 4,
    },
  })
    .trim({ background: "#00000000", threshold: 0 })
    .resize({
      width: Math.min(frameWidth - 32, Math.round((options.scale ?? 3.9) * width)),
      height: Math.min(frameHeight - 72, Math.round((options.scale ?? 3.9) * height)),
      fit: "inside",
      kernel: "lanczos3",
    });

  if (options.flip) {
    image = image.flop();
  }

  if (options.tint) {
    image = image.modulate(options.tint);
  }

  if (options.blur) {
    image = image.blur(options.blur);
  }

  return image.png().toBuffer();
}

async function frameLayerFromCell(source, rowName, directionIndex, options = {}) {
  const direction = directions[directionIndex];
  const sourceDirectionIndex = directionToSourceIndex.get(direction);
  const row = sourceRows[rowName];
  const cropWidth = Math.round(sourceGroupWidth - 14);
  const cropLeft = Math.round(sourceGroupLeft + sourceGroupWidth * sourceDirectionIndex + 7);
  const input = await extractCell(
    source,
    cropLeft,
    row.top,
    cropWidth,
    row.height,
    options,
  );
  const meta = await sharp(input).metadata();
  const top = options.top ?? 36;
  const left = Math.round((frameWidth - meta.width) / 2 + (options.shiftX ?? 0));
  return {
    input,
    left: clamp(left, 0, frameWidth - meta.width),
    top: clamp(top + (options.shiftY ?? 0), 0, frameHeight - meta.height),
  };
}

async function buildPlayerFrame(source, action, directionIndex, frame) {
  let rowName = `${action}0`;
  const options = {};

  if (action === "idle" && frame === 1) {
    rowName = directionIndex < 2 ? "idle1" : "idle0";
    options.shiftY = directionIndex < 2 ? 0 : -3;
  }

  if (action === "run") {
    rowName = frame === 1 && directionIndex < 2 ? "run1" : "run0";
    options.shiftX = [-3, 2, 4, -2][frame];
    options.shiftY = [-2, 1, -1, 2][frame];
  }

  if (action === "attack") {
    rowName = frame === 1 && directionIndex < 2 ? "attack1" : "attack0";
    options.shiftX = [0, 5, 10][frame] * (directionIndex >= 5 ? -1 : 1);
    options.shiftY = [0, -2, 1][frame];
  }

  if (action === "dash") {
    rowName = "dash0";
    options.shiftX = [0, 7, 14][frame] * (directionIndex >= 5 ? -1 : 1);
    options.shiftY = [0, -2, -3][frame];
  }

  const base = await frameLayerFromCell(source, rowName, directionIndex, options);
  const composites = [];

  if (action === "dash" && frame > 0) {
    const trailInput = await sharp(base.input)
      .modulate({ brightness: 1.6, saturation: 1.4 })
      .tint({ r: 132, g: 60, b: 220 })
      .ensureAlpha()
      .linear([1, 1, 1, 0.38], [0, 0, 0, 0])
      .png()
      .toBuffer();
    composites.push({
      input: trailInput,
      left: clamp(base.left - (directionIndex >= 5 ? -24 : 24) * frame, 0, frameWidth - 1),
      top: base.top + 4,
    });
  }

  composites.push(base);

  if (action === "attack" && frame > 0) {
    const slashSvg = Buffer.from(`
      <svg width="${frameWidth}" height="${frameHeight}" xmlns="http://www.w3.org/2000/svg">
        <path d="M ${48 + frame * 10} ${134 - frame * 10} C ${126} ${76 - frame * 5}, ${184} ${80}, ${224} ${122 + frame * 6}" fill="none" stroke="#c3fbff" stroke-width="${7 + frame}" stroke-linecap="round" opacity="0.62"/>
        <path d="M ${52 + frame * 12} ${142 - frame * 4} C ${132} ${92}, ${185} ${102}, ${226} ${148}" fill="none" stroke="#a64dff" stroke-width="${5 + frame}" stroke-linecap="round" opacity="0.55"/>
      </svg>
    `);
    composites.push({ input: slashSvg, left: 0, top: 0 });
  }

  if (action === "dash" && frame > 0) {
    const trailSvg = Buffer.from(`
      <svg width="${frameWidth}" height="${frameHeight}" xmlns="http://www.w3.org/2000/svg">
        <path d="M 28 ${168 + frame * 4} L ${150 + frame * 12} ${150 - frame * 2}" stroke="#9d55ff" stroke-width="6" opacity="0.42" stroke-linecap="round"/>
        <path d="M 18 ${194} L ${132 + frame * 18} ${184}" stroke="#60f6ff" stroke-width="4" opacity="0.35" stroke-linecap="round"/>
      </svg>
    `);
    composites.unshift({ input: trailSvg, left: 0, top: 0 });
  }

  return sharp({
    create: {
      width: frameWidth,
      height: frameHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

function atlasFrame(name, x, y, width = frameWidth, height = frameHeight) {
  return {
    filename: name,
    frame: { x, y, w: width, h: height },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: width, h: height },
    sourceSize: { w: width, h: height },
    pivot: { x: 0.5, y: 0.82 },
  };
}

async function writeJson(filePath, value) {
  await fs.writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(`${filePath}.tmp`, filePath);
}

async function writeBuffer(filePath, buffer) {
  await fs.writeFile(`${filePath}.tmp`, buffer);
  await fs.rename(`${filePath}.tmp`, filePath);
}

async function buildPlayerAssets() {
  const source = sharp(playerSourcePath);
  const columns = Object.values(actions).reduce((sum, count) => sum + count, 0);
  const sheetWidth = frameWidth * columns;
  const sheetHeight = frameHeight * directions.length;
  const frames = [];
  const composites = [];
  let columnOffset = 0;

  for (const [action, count] of Object.entries(actions)) {
    for (let frame = 0; frame < count; frame += 1) {
      for (let row = 0; row < directions.length; row += 1) {
        const direction = directions[row];
        const x = (columnOffset + frame) * frameWidth;
        const y = row * frameHeight;
        const input = await buildPlayerFrame(source, action, row, frame);
        composites.push({ input, left: x, top: y });
        frames.push(atlasFrame(`${action}-${direction}-${frame}`, x, y));
      }
    }
    columnOffset += count;
  }

  await fs.mkdir(path.join(outRoot, "actors"), { recursive: true });
  const sheet = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  const alpha = await sharp(sheet).ensureAlpha().raw().toBuffer();
  const normal = Buffer.alloc(sheetWidth * sheetHeight * 4);
  for (let index = 0; index < normal.length; index += 4) {
    normal[index] = 128;
    normal[index + 1] = 128;
    normal[index + 2] = 255;
    normal[index + 3] = alpha[index + 3];
  }

  await writeBuffer(path.join(outRoot, "actors", "player.png"), sheet);
  await writeBuffer(
    path.join(outRoot, "actors", "player_n.png"),
    await sharp(normal, {
      raw: {
        width: sheetWidth,
        height: sheetHeight,
        channels: 4,
      },
    }).png().toBuffer(),
  );
  await writeJson(path.join(outRoot, "actors", "player.json"), {
    frames,
    meta: {
      app: "quant-feudalism authored-art builder",
      version: "1.0",
      image: "player.png",
      format: "RGBA8888",
      size: { w: sheetWidth, h: sheetHeight },
      scale: "1",
    },
  });
}

function svgImage(width, height, body) {
  return Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
}

async function pngFromSvg(filePath, width, height, body) {
  await writeBuffer(filePath, await sharp(svgImage(width, height, body)).png().toBuffer());
}

async function buildSimpleAtlas(actor) {
  const sheetWidth = frameWidth * 12;
  const sheetHeight = frameHeight * directions.length;
  const frames = [];
  const composites = [];
  let columnOffset = 0;

  for (const [action, count] of Object.entries(actions)) {
    for (let frame = 0; frame < count; frame += 1) {
      for (let row = 0; row < directions.length; row += 1) {
        const direction = directions[row];
        const x = (columnOffset + frame) * frameWidth;
        const y = row * frameHeight;
        const wing = action === "run" ? [-22, 10, 24, -8][frame] : action === "idle" ? frame * 4 : 0;
        const pulse = action === "attack" ? frame * 18 : action === "dash" ? frame * 26 : 0;
        const hue = actor === "drone" ? "#60ffd3" : "#ff4fa4";
        const body = `
          <ellipse cx="128" cy="230" rx="60" ry="14" fill="#02060a" opacity="0.45"/>
          <path d="M128 ${74 - pulse * 0.1} L${196 + wing + pulse * 0.2} 142 L128 210 L${60 - wing - pulse * 0.2} 142 Z" fill="#050910"/>
          <path d="M128 91 L${177 + wing} 142 L128 192 Z" fill="#24384a"/>
          <path d="M128 91 L${79 - wing} 142 L128 192 Z" fill="#121e2b"/>
          <rect x="${111 + (row < 4 ? 8 : -8)}" y="132" width="34" height="16" fill="${action === "attack" ? "#ffffff" : "#ff4f8b"}"/>
          <path d="M${70 - wing} 145 L${42 - wing - pulse} 174" stroke="#ffcf66" stroke-width="8" stroke-linecap="round"/>
          <path d="M${186 + wing} 145 L${214 + wing + pulse} 174" stroke="${hue}" stroke-width="8" stroke-linecap="round"/>
        `;
        const input = await sharp(svgImage(frameWidth, frameHeight, body)).png().toBuffer();
        composites.push({ input, left: x, top: y });
        frames.push(atlasFrame(`${action}-${direction}-${frame}`, x, y));
      }
    }
    columnOffset += count;
  }

  const sheet = await sharp({
    create: {
      width: sheetWidth,
      height: sheetHeight,
      channels: 4,
      background: "#00000000",
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
  const alpha = await sharp(sheet).ensureAlpha().raw().toBuffer();
  const normal = Buffer.alloc(sheetWidth * sheetHeight * 4);
  for (let index = 0; index < normal.length; index += 4) {
    normal[index] = 128;
    normal[index + 1] = 128;
    normal[index + 2] = 255;
    normal[index + 3] = alpha[index + 3];
  }

  await writeBuffer(path.join(outRoot, "actors", `${actor}.png`), sheet);
  await writeBuffer(
    path.join(outRoot, "actors", `${actor}_n.png`),
    await sharp(normal, {
      raw: { width: sheetWidth, height: sheetHeight, channels: 4 },
    }).png().toBuffer(),
  );
  await writeJson(path.join(outRoot, "actors", `${actor}.json`), {
    frames,
    meta: {
      app: "quant-feudalism authored-art builder",
      version: "1.0",
      image: `${actor}.png`,
      format: "RGBA8888",
      size: { w: sheetWidth, h: sheetHeight },
      scale: "1",
    },
  });
}

async function buildEnvironmentAndVfx() {
  await fs.mkdir(path.join(outRoot, "environment"), { recursive: true });
  await fs.mkdir(path.join(outRoot, "vfx"), { recursive: true });

  await pngFromSvg(path.join(outRoot, "environment", "floor.png"), 512, 296, `
    <rect width="512" height="296" fill="#00000000"/>
    <path d="M256 20 L492 148 L256 276 L20 148 Z" fill="#344653"/>
    <path d="M256 44 L446 148 L256 252 L66 148 Z" fill="#49606d"/>
    <path d="M20 148 L256 276 L256 296 L20 168 Z" fill="#22313c" opacity="0.75"/>
    <path d="M492 148 L256 276 L256 296 L492 168 Z" fill="#2b3e4a" opacity="0.75"/>
    <path d="M256 20 L492 148 M492 148 L256 276 M256 276 L20 148 M20 148 L256 20 M256 44 L256 252 M66 148 L446 148" stroke="#9fffea" stroke-width="4" opacity="0.28"/>
  `);
  await pngFromSvg(path.join(outRoot, "environment", "shadow.png"), 176, 72, `
    <ellipse cx="88" cy="36" rx="78" ry="24" fill="#02060a" opacity="0.72"/>
    <ellipse cx="88" cy="36" rx="86" ry="30" fill="#0df2c9" opacity="0.12"/>
  `);
  await pngFromSvg(path.join(outRoot, "environment", "pillar.png"), 224, 300, `
    <rect x="54" y="56" width="84" height="208" fill="#09121a"/>
    <rect x="70" y="40" width="96" height="224" fill="#1f3440"/>
    <path d="M70 40 L118 4 L166 40 Z" fill="#0d1b25"/>
    <path d="M70 40 L118 76 L166 40 Z" fill="#315568"/>
    <rect x="86" y="84" width="12" height="140" fill="#60ffd3"/>
    <rect x="128" y="108" width="20" height="76" fill="#ff4fa4"/>
    <rect x="86" y="236" width="64" height="10" fill="#ffcf66"/>
    <path d="M70 40 L118 4 L166 40 M70 40 V264 M166 40 V264" fill="none" stroke="#c9fff0" stroke-width="4" opacity="0.65"/>
  `);
  await pngFromSvg(path.join(outRoot, "environment", "pillar_n.png"), 224, 300, `<rect width="224" height="300" fill="#8080ff"/>`);
  await pngFromSvg(path.join(outRoot, "environment", "gate.png"), 384, 300, `
    <rect x="36" y="84" width="312" height="44" fill="#061119"/>
    <rect x="52" y="20" width="56" height="256" fill="#061119"/>
    <rect x="276" y="20" width="56" height="256" fill="#061119"/>
    <rect x="72" y="40" width="44" height="212" fill="#1a3c49"/>
    <rect x="260" y="40" width="44" height="212" fill="#1a3c49"/>
    <rect x="114" y="52" width="150" height="14" fill="#60ffd3"/>
    <rect x="164" y="68" width="16" height="156" fill="#60ffd3"/>
    <rect x="140" y="252" width="108" height="16" fill="#ff4fa4"/>
    <path d="M56 20 L192 0 L328 20 M56 20 V276 M328 20 V276" fill="none" stroke="#c9fff0" stroke-width="6" opacity="0.72"/>
    <rect x="132" y="90" width="120" height="140" fill="none" stroke="#ffcf66" stroke-width="4" opacity="0.82"/>
  `);
  await pngFromSvg(path.join(outRoot, "environment", "gate_n.png"), 384, 300, `<rect width="384" height="300" fill="#8080ff"/>`);
  await pngFromSvg(path.join(outRoot, "environment", "terminal.png"), 176, 224, `
    <path d="M88 12 L160 52 L88 92 L16 52 Z" fill="#071017"/>
    <rect x="40" y="56" width="96" height="148" fill="#071017"/>
    <rect x="52" y="68" width="96" height="120" fill="#173843"/>
    <rect x="62" y="80" width="68" height="16" fill="#60ffd3"/>
    <rect x="64" y="112" width="36" height="10" fill="#ff4fa4"/>
    <rect x="64" y="136" width="56" height="10" fill="#ff4fa4"/>
    <path d="M16 52 L88 12 L160 52 M40 56 H136 V204 H40 Z" fill="none" stroke="#c9fff0" stroke-width="4" opacity="0.72"/>
  `);

  await pngFromSvg(path.join(outRoot, "vfx", "bolt.png"), 192, 72, `
    <path d="M8 38 L52 20 L42 34 L88 16 L72 38 L130 18 L102 48 L184 34" fill="none" stroke="#f8ffff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 38 L52 20 L42 34 L88 16 L72 38 L130 18 L102 48 L184 34" fill="none" stroke="#8e79ff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round" opacity="0.44"/>
    <path d="M8 38 L52 20 L42 34 L88 16 L72 38 L130 18 L102 48 L184 34" fill="none" stroke="#60e8ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  `);
  await pngFromSvg(path.join(outRoot, "vfx", "slash.png"), 256, 256, `
    <path d="M42 154 C92 70 164 52 224 90 C162 90 108 122 70 202 Z" fill="#60ffd3" opacity="0.48"/>
    <path d="M48 162 C100 82 166 66 222 100" fill="none" stroke="#f7ffff" stroke-width="11" stroke-linecap="round" opacity="0.9"/>
    <path d="M64 176 C120 114 178 100 238 132" fill="none" stroke="#ff4fa4" stroke-width="8" stroke-linecap="round" opacity="0.58"/>
  `);
  await pngFromSvg(path.join(outRoot, "vfx", "haze.png"), 256, 256, `
    <defs>
      <radialGradient id="g" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
        <stop offset="42%" stop-color="#60ffd3" stop-opacity="0.2"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <circle cx="128" cy="128" r="120" fill="url(#g)"/>
    <path d="M46 170 C88 122 120 210 162 156 C184 128 198 112 224 120" fill="none" stroke="#ffffff" stroke-width="10" opacity="0.24"/>
    <path d="M34 96 C76 68 118 106 152 78 C178 58 204 62 230 82" fill="none" stroke="#c8fff7" stroke-width="8" opacity="0.18"/>
  `);
}

async function main() {
  await buildPlayerAssets();
  await buildSimpleAtlas("drone");
  await buildEnvironmentAndVfx();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
