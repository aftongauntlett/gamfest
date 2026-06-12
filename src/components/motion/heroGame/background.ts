import { drawBillboard, FACE_FRAMES, getBillboardGeometry } from './billboard';
import { HERO_BASELINE_RATIO } from './constants';
import { pseudoRandom, type Palette } from './palette';

/** Sidewalk/road geometry shared between background art and player physics. */
export function getStreetLevels(baseline: number, cell: number) {
  const sidewalkH = Math.round(cell);
  const roadTop = baseline + sidewalkH;
  return { sidewalkH, roadTop, roadDrop: sidewalkH };
}

// Fixed star field — stable positions on the right half of the canvas (clear of text overlay)
export const STARS = Array.from({ length: 30 }, (_, i) => ({
  xFrac: 0.48 + pseudoRandom(i * 17.391 + 1.1) * 0.52,
  yFrac: pseudoRandom(i * 11.721 + 2.3) * 0.86,
  size:
    pseudoRandom(i * 7.153) > 0.92 ? 3 : pseudoRandom(i * 7.153) > 0.68 ? 2 : 1,
  alpha: 0.22 + pseudoRandom(i * 5.317) * 0.34,
  phase: pseudoRandom(i * 13.891) * Math.PI * 2,
  speed: 0.25 + pseudoRandom(i * 3.741) * 0.75,
  cross: pseudoRandom(i * 2.917 + 8.4) > 0.76,
}));

export function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  elapsed: number,
) {
  STARS.forEach((star) => {
    const twinklePeriod = 7200;
    const twinkleWindow = 620;
    const twinkleSeed = Math.floor(elapsed / twinklePeriod);
    const twinkleIndex = Math.floor(
      pseudoRandom(twinkleSeed * 19.137 + 4.2) * STARS.length,
    );
    const twinkleAge = elapsed % twinklePeriod;
    const twinkleActive =
      star === STARS[twinkleIndex] && twinkleAge < twinkleWindow;
    const twinkle = twinkleActive
      ? Math.sin((twinkleAge / twinkleWindow) * Math.PI)
      : 0;
    const starX = Math.round(star.xFrac * width);
    const starY = Math.round(star.yFrac * baseline);
    const glowSize = star.size + (twinkle > 0.75 ? 2 : twinkle > 0 ? 1 : 0);

    ctx.globalAlpha = star.alpha + twinkle * 0.65;
    ctx.fillStyle = '#d8e4ff';
    ctx.fillRect(starX, starY, star.size, star.size);
    if (star.cross && star.size > 1) {
      ctx.globalAlpha = star.alpha * 0.65;
      ctx.fillRect(starX - 1, starY, star.size + 2, 1);
      ctx.fillRect(starX, starY - 1, 1, star.size + 2);
    }
    if (twinkle > 0.35) {
      ctx.globalAlpha = twinkle * 0.5;
      ctx.fillRect(starX - 1, starY, glowSize, 1);
      ctx.fillRect(starX, starY - 1, 1, glowSize);
    }
  });
  ctx.globalAlpha = 1;
}

export function drawBuildingWindows(
  ctx: CanvasRenderingContext2D,
  bldX: number,
  bldTop: number,
  bldBottom: number,
  bldWidth: number,
  cell: number,
  bldSeed: number,
  litColor: string,
  darkColor: string,
  litProb: number,
  elapsed = 0,
) {
  const winW = Math.max(3, Math.floor(cell * 0.7));
  const winH = Math.max(2, Math.floor(cell * 0.55));
  const gapX = Math.max(winW + 3, Math.floor(cell * 1.8));
  const gapY = Math.max(winH + 3, Math.floor(cell * 1.6));
  const padX = Math.max(2, Math.floor(cell * 0.6));
  const padTop = Math.max(2, Math.floor(cell * 0.8));

  // Center the window grid: count how many columns fit then distribute symmetrically
  const numCols = Math.max(
    1,
    Math.floor((bldWidth - 2 * padX - winW) / gapX) + 1,
  );
  const totalSpanX = (numCols - 1) * gapX + winW;
  const startX = bldX + Math.floor((bldWidth - totalSpanX) / 2);

  let idx = 0;
  for (let wy = bldTop + padTop; wy + winH <= bldBottom - 2; wy += gapY) {
    for (let col = 0; col < numCols; col++) {
      const wx = startX + col * gapX;
      let isLit = pseudoRandom(bldSeed + idx * 7.3) < litProb;

      // ~4% of windows can toggle on/off over time — a slow, rare flicker
      const flickerSeed = pseudoRandom(bldSeed + idx * 7.3 + 99.7);
      if (flickerSeed < 0.04 && elapsed > 0) {
        const period = 6000 + pseudoRandom(bldSeed + idx * 3.7) * 14000;
        if (Math.floor(elapsed / period) % 2 === 1) isLit = !isLit;
      }

      if (isLit) {
        ctx.globalAlpha = 0.22;
        ctx.fillStyle = litColor;
        ctx.fillRect(
          Math.round(wx) - 1,
          Math.round(wy) - 1,
          winW + 2,
          winH + 2,
        );
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = isLit ? litColor : darkColor;
      ctx.fillRect(Math.round(wx), Math.round(wy), winW, winH);
      idx++;
    }
  }
}

export function drawSkyline(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  offset: number,
  color: string,
  step: number,
  minHeight: number,
  maxHeight: number,
  seed: number,
  bottom = baseline,
  windowLit?: string,
  windowDark?: string,
  cell = 3,
  litProb = 0.45,
  elapsed = 0,
  gap = 0,
) {
  const count = Math.ceil(width / step) + 2;
  const baseCol = Math.floor(offset / step);
  const buildingWidth = Math.max(cell * 3, step - gap);

  for (let i = -1; i < count; i++) {
    const x = i * step - (offset % step);
    const worldCol = baseCol + i;

    // Slow envelope sets neighborhood character; fast component gives per-building drama
    const t = worldCol * 0.1 + seed * 4.1;
    const tFast = worldCol * 1.5 + seed * 2.71;
    const slow = Math.sin(t) * 0.5 + Math.sin(t * 0.55 + 2.1) * 0.3;
    const fast = Math.sin(tFast) * 0.5 + Math.sin(tFast * 1.7 + 1.2) * 0.3;
    const raw = Math.max(0, Math.min(1, (slow * 0.4 + fast * 0.6 + 1.0) / 2.0));
    // S-curve contrast — biases strongly toward very tall or very short (avoids mid-range)
    const n =
      raw < 0.5
        ? 0.5 * Math.pow(2 * raw, 2.3)
        : 1 - 0.5 * Math.pow(2 * (1 - raw), 2.3);
    const h = minHeight + n * (maxHeight - minHeight);

    const bx = Math.round(x);
    const bt = Math.round(baseline - h);
    ctx.fillStyle = color;
    ctx.fillRect(bx, bt, Math.ceil(buildingWidth), bottom - bt);

    if (windowLit && windowDark) {
      drawBuildingWindows(
        ctx,
        bx,
        bt,
        bottom,
        Math.ceil(buildingWidth),
        cell,
        worldCol * 73 + seed * 1000,
        windowLit,
        windowDark,
        litProb,
        elapsed,
      );
    }
  }
}

export function drawPipes(
  ctx: CanvasRenderingContext2D,
  bbX: number,
  bbWidth: number,
  bbBottom: number,
  canvasHeight: number,
  cell: number,
  color: string,
) {
  const pipeW = Math.max(2, Math.floor(cell * 0.55));
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const px = Math.round(bbX + t * bbWidth - pipeW / 2);
    ctx.fillStyle = color;
    ctx.fillRect(px, bbBottom, pipeW, canvasHeight - bbBottom);
  }
}

export function drawBrickBuilding(
  ctx: CanvasRenderingContext2D,
  bldX: number,
  bldWidth: number,
  top: number,
  bottom: number,
  cell: number,
  palette: Pick<Palette, 'brickA' | 'brickB' | 'grout'>,
) {
  const brickH = Math.max(4, Math.floor(cell * 0.72));
  const brickW = Math.max(10, cell * 2);
  const mortar = 1;
  const rows = Math.ceil((bottom - top) / brickH) + 1;

  ctx.save();
  ctx.beginPath();
  ctx.rect(bldX, top, bldWidth, bottom - top);
  ctx.clip();

  // Solid grout fill — bricks drawn on top so gaps are opaque, not transparent
  ctx.fillStyle = palette.grout;
  ctx.fillRect(bldX, top, bldWidth, bottom - top);

  for (let row = 0; row < rows; row++) {
    const ry = top + row * brickH;
    const offset = row % 2 === 0 ? 0 : Math.floor(brickW / 2);
    const cols = Math.ceil(bldWidth / brickW) + 2;

    for (let col = -1; col < cols; col++) {
      const bx = bldX + col * brickW - offset;
      ctx.fillStyle = (col + row) % 3 === 0 ? palette.brickA : palette.brickB;
      ctx.fillRect(
        bx + mortar,
        ry + mortar,
        brickW - mortar * 2,
        brickH - mortar * 2,
      );
    }
  }

  ctx.restore();
}

export function drawStreet(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  cell: number,
  palette: Palette,
  daytime: boolean,
) {
  const { sidewalkH, roadTop } = getStreetLevels(baseline, cell);

  // Sidewalk slab
  ctx.fillStyle = palette.sidewalk;
  ctx.fillRect(0, baseline, width, sidewalkH);

  // Tile expansion joints — single row of pavers, vertical joints only
  const jointColor = daytime ? 'rgb(0 0 0 / 0.10)' : 'rgb(0 0 0 / 0.30)';
  ctx.fillStyle = jointColor;
  const tileW = cell * 4;
  for (let tx = 0; tx < width; tx += tileW) {
    ctx.fillRect(Math.round(tx), baseline, 1, sidewalkH);
  }

  // Road starts immediately below the single sidewalk row.
  ctx.fillStyle = palette.road;
  ctx.fillRect(0, roadTop, width, height - roadTop);

  // Night: neon-green reflection pooling on the sidewalk near the billboard
  if (!daytime) {
    const refW = width * 0.48;
    const grad = ctx.createLinearGradient(width - refW, 0, width, 0);
    grad.addColorStop(0, 'rgba(57,255,20,0)');
    grad.addColorStop(1, 'rgba(57,255,20,0.09)');
    ctx.fillStyle = grad;
    ctx.fillRect(width - refW, baseline, refW, sidewalkH);
  }
}

export function drawScanlines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string,
) {
  ctx.fillStyle = color;
  for (let y = 0; y < height; y += 3) {
    ctx.fillRect(0, y, width, 1);
  }
}

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  elapsed: number,
  daytime: boolean,
  showBillboardMessage = true,
  billboardOptions?: {
    message?: string;
    glitching?: boolean;
    noiseSeed?: number;
    showControls?: boolean;
    helpOpen?: boolean;
    screenBroken?: boolean;
    faceFrame?: number;
    volume?: number;
    beforeSkyline?: () => void;
    starPower?: boolean;
  },
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);

  const baseline = height * HERO_BASELINE_RATIO;
  const cell = Math.max(3, Math.floor(height / 28));

  // Stars in the sky — night only, drawn before buildings
  if (!daytime) {
    drawStars(ctx, width, baseline, elapsed);
  }
  billboardOptions?.beforeSkyline?.();

  // Ground fill behind everything — fills the base zone so nothing is empty
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, baseline, width, height - baseline);

  // Far skyline — no windows, wide height range for dramatic silhouette
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.012,
    palette.skylineFar,
    cell * 7,
    height * 0.04,
    height * 0.68,
    11,
    height,
    undefined,
    undefined,
    cell,
    0.45,
    elapsed,
    Math.max(cell, 6),
  );
  // Near skyline — with windows, wide range: short squat blocks to tall towers
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.03,
    palette.skylineNear,
    cell * 5,
    height * 0.08,
    height * 0.58,
    47,
    height,
    palette.windowLit,
    palette.windowDark,
    cell,
    0.06,
    elapsed,
    Math.max(Math.floor(cell * 0.45), 3),
  );

  const billboard = getBillboardGeometry(width, cell);

  // Support gap — thin strip of pipes separating the billboard frame from the brick below
  drawPipes(
    ctx,
    billboard.bbX,
    billboard.bbWidth,
    billboard.frameBottom,
    billboard.brickTop,
    cell,
    palette.pipe,
  );

  // Brick building — the pedestal the billboard sits on, filling the rest of the gap above the street
  drawBrickBuilding(
    ctx,
    billboard.brickX,
    billboard.brickWidth,
    billboard.brickTop,
    baseline,
    cell,
    palette,
  );

  drawBillboard(
    ctx,
    { x: billboard.bbX, y: billboard.bbY },
    { width: billboard.bbWidth, height: billboard.bbHeight, cell },
    {
      frame: palette.frame,
      screen: palette.screen,
      glow: palette.glow,
      facePixel: palette.facePixel,
    },
    billboardOptions?.faceFrame ??
      Math.floor(elapsed / 1400) % FACE_FRAMES.length,
    !daytime,
    elapsed,
    showBillboardMessage,
    billboardOptions,
  );

  drawStreet(ctx, width, height, baseline, cell, palette, daytime);
}
