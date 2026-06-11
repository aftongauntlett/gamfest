import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

const { Engine, Bodies, Body, Composite, Events } = Matter;

const TARGET_FPS = 24;
const FRAME_DURATION = 1000 / TARGET_FPS;
const SPRITE_SIZE = 32;

// --- Hero mini-game tuning (Phase 1: core platformer) -----------------

/** Physics steps run at a fixed 60Hz regardless of render FPS. */
const FIXED_PHYSICS_DT = 1000 / 60;
/** Velocity is in px per physics step at 60Hz, so 2 ≈ 120px/s. */
const PLAYER_WALK_SPEED = 2;
/** Tuned so an unassisted jump reaches roughly `cell * 5`. */
const PLAYER_JUMP_VELOCITY = 9;
const PLAYER_FRICTION = 0.8;
const LANDING_SQUASH_MS = 80;
const SPAWN_DROP_CELLS = 8;
/** Player spawns near the left edge of the canvas, not dead-center. */
const PLAYER_SPAWN_X_CELLS = 4;
const WALK_BOB_PERIOD_MS = 220;
const IDLE_SWAY_PERIOD_MS = 600;
const PROMPT_BLINK_MS = 600;

interface Palette {
  sky: string;
  skylineFar: string;
  skylineNear: string;
  screen: string;
  frame: string;
  glow: string;
  facePixel: string;
  scanline: string;
  brickA: string;
  brickB: string;
  pipe: string;
  grout: string;
  ground: string;
  windowLit: string;
  windowDark: string;
  sidewalk: string;
  curb: string;
  road: string;
}

interface SpriteInfo {
  img: HTMLImageElement;
  col: number;
  row: number;
}

function isESTDaytime(): boolean {
  const override = new URLSearchParams(window.location.search).get('heroTime');
  if (override === 'day') return true;
  if (override === 'night') return false;
  const h =
    +new Date().toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    }) % 24;
  return h >= 6 && h < 20;
}

function getPalette(daytime: boolean): Palette {
  if (daytime) {
    return {
      sky: '#87ceeb',
      skylineFar: '#b8cdd8',
      skylineNear: '#8aa4b0',
      screen: '#f8f8f8',
      frame: '#1a1a1a',
      glow: '#22cc04',
      facePixel: '#1a5028',
      scanline: 'rgb(0 0 0 / 3%)',
      brickA: '#b05030',
      brickB: '#c46040',
      pipe: '#2a2a2a',
      grout: '#6b2010',
      ground: '#5c4530',
      windowLit: '#cce0f4',
      windowDark: '#4a6880',
      sidewalk: '#c8c0b0',
      curb: '#948878',
      road: '#686870',
    };
  }
  return {
    sky: '#0d0e10',
    skylineFar: '#16181c',
    skylineNear: '#2b2e34',
    screen: '#060e06',
    frame: '#1e2026',
    glow: '#39ff14',
    facePixel: '#39ff14',
    scanline: 'rgb(255 255 255 / 4%)',
    brickA: '#1c1a1a',
    brickB: '#242020',
    pipe: '#14151a',
    grout: '#080706',
    ground: '#1a1820',
    windowLit: '#f0c840',
    windowDark: '#0a0c10',
    sidewalk: '#3a3f4a',
    curb: '#262a32',
    road: '#1c1e26',
  };
}

function pseudoRandom(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/** Converts a `#rrggbb` palette color to an `rgba()` string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Sidewalk/road geometry shared between background art and player physics. */
function getStreetLevels(baseline: number, cell: number) {
  const sidewalkH = Math.round(cell);
  const curbH = Math.max(2, Math.round(cell * 0.35));
  const roadTop = baseline + sidewalkH + curbH;
  return { sidewalkH, curbH, roadTop, roadDrop: sidewalkH + curbH };
}

// Fixed star field — stable positions on the right half of the canvas (clear of text overlay)
const STARS = Array.from({ length: 30 }, (_, i) => ({
  xFrac: 0.48 + pseudoRandom(i * 17.391 + 1.1) * 0.52,
  yFrac: pseudoRandom(i * 11.721 + 2.3) * 0.86,
  size: pseudoRandom(i * 7.153) > 0.82 ? 2 : 1,
  alpha: 0.1 + pseudoRandom(i * 5.317) * 0.25,
  phase: pseudoRandom(i * 13.891) * Math.PI * 2,
  speed: 0.25 + pseudoRandom(i * 3.741) * 0.75,
}));

function drawStars(
  ctx: CanvasRenderingContext2D,
  width: number,
  baseline: number,
  elapsed: number,
) {
  STARS.forEach((star) => {
    const twinkle = Math.sin(elapsed * 0.001 * star.speed + star.phase);
    ctx.globalAlpha = star.alpha * (0.55 + twinkle * 0.45);
    ctx.fillStyle = '#d8e4ff';
    ctx.fillRect(
      Math.round(star.xFrac * width),
      Math.round(star.yFrac * baseline),
      star.size,
      star.size,
    );
  });
  ctx.globalAlpha = 1;
}

function drawBuildingWindows(
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

function drawSkyline(
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
) {
  const count = Math.ceil(width / step) + 2;
  const baseCol = Math.floor(offset / step);

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
    ctx.fillRect(bx, bt, step + 1, bottom - bt);
    // Shadow strip at right edge — simulates an alley without exposing background
    ctx.fillStyle = 'rgb(0 0 0 / 0.18)';
    ctx.fillRect(bx + step - 2, bt, 3, bottom - bt);

    if (windowLit && windowDark) {
      drawBuildingWindows(
        ctx,
        bx,
        bt,
        bottom,
        step + 1,
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

/** Pixel face — two expressions (open smile / blink) */
const FACE_FRAMES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [
    [2, 1],
    [5, 1],
    [2, 2],
    [5, 2],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
  ],
  [
    [1, 2],
    [2, 2],
    [5, 2],
    [6, 2],
    [1, 4],
    [2, 4],
    [3, 4],
    [4, 4],
    [5, 4],
    [6, 4],
  ],
];

const BILLBOARD_TEXT = 'That happened. It ruled.';

function drawBillboard(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  size: { width: number; height: number; cell: number },
  colors: { frame: string; screen: string; glow: string; facePixel: string },
  frame: number,
  nightGlow = false,
  elapsed = 0,
) {
  const { x, y } = origin;
  const { width, height, cell } = size;
  const fw = cell * 1.5;

  ctx.fillStyle = colors.frame;
  ctx.fillRect(x - fw, y - cell, width + fw * 2, height + cell * 2);

  ctx.fillStyle = colors.screen;
  ctx.fillRect(x, y, width, height);

  // CRT phosphor bloom — subtle radial glow from screen center
  if (nightGlow) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rad = Math.sqrt(width * width + height * height) * 0.62;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    grad.addColorStop(0, 'rgba(22, 90, 14, 0.60)');
    grad.addColorStop(0.45, 'rgba(8, 38, 6, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);
  }

  // Face — shifted into upper ~40% of screen to leave room for text below
  ctx.fillStyle = colors.facePixel;
  const px = Math.max(2, Math.floor(width / 10));
  const ox = x + (width - px * 8) / 2;
  const oy = y + Math.floor((height - px * 6) * 0.32);
  FACE_FRAMES[frame].forEach(([col, row]) => {
    ctx.fillRect(ox + col * px, oy + row * px, px - 1, px - 1);
  });

  // Terminal text with blinking underscore cursor
  const cursor = Math.floor(elapsed / 530) % 2 === 0 ? '_' : ' ';
  const fullText = BILLBOARD_TEXT + cursor;
  const maxW = width - cell * 2;
  let fs = Math.max(8, Math.floor(cell * 1.6));
  ctx.font = `${fs}px 'VT323', monospace`;
  while (ctx.measureText(fullText).width > maxW && fs > 8) {
    fs -= 1;
    ctx.font = `${fs}px 'VT323', monospace`;
  }
  ctx.fillStyle = colors.facePixel;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(fullText, x + width / 2, y + height - Math.floor(cell * 0.5));
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function drawPipes(
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

function drawBrickBuilding(
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

function drawStreet(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  baseline: number,
  cell: number,
  palette: Palette,
  elapsed: number,
  daytime: boolean,
) {
  const { sidewalkH, curbH, roadTop } = getStreetLevels(baseline, cell);

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

  // Curb face
  ctx.fillStyle = palette.curb;
  ctx.fillRect(0, baseline + sidewalkH, width, curbH);

  // Road
  ctx.fillStyle = palette.road;
  ctx.fillRect(0, roadTop, width, height - roadTop);

  // Scrolling center dashes
  const dashW = cell * 3;
  const dashGap = cell * 2;
  const cycle = dashW + dashGap;
  const dashY = roadTop + Math.floor((height - roadTop) * 0.42);
  const dashH = Math.max(1, Math.round(cell * 0.18));
  const dashOffset = (elapsed * 0.018) % cycle;
  ctx.fillStyle = daytime ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,160,0.45)';
  for (let dx = -cycle + dashOffset; dx < width + cycle; dx += cycle) {
    ctx.fillRect(Math.round(dx), dashY, dashW, dashH);
  }

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

function drawScanlines(
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

const SPRITE_SHEETS = [
  { src: '/sprites/rogues.png', cellCols: 7, cellRows: 7 },
  { src: '/sprites/animals.png', cellCols: 9, cellRows: 16 },
  { src: '/sprites/monsters.png', cellCols: 12, cellRows: 13 },
];

function findOccupiedCells(
  img: HTMLImageElement,
  cellCols: number,
  cellRows: number,
): [number, number][] {
  const tmp = document.createElement('canvas');
  tmp.width = img.naturalWidth;
  tmp.height = img.naturalHeight;
  const tmpCtx = tmp.getContext('2d');
  if (!tmpCtx) return [];
  tmpCtx.drawImage(img, 0, 0);
  const { data } = tmpCtx.getImageData(0, 0, tmp.width, tmp.height);
  const cells: [number, number][] = [];

  for (let row = 0; row < cellRows; row++) {
    for (let col = 0; col < cellCols; col++) {
      let found = false;
      outer: for (let sy = 0; sy < SPRITE_SIZE; sy++) {
        for (let sx = 0; sx < SPRITE_SIZE; sx++) {
          const idx =
            ((row * SPRITE_SIZE + sy) * tmp.width + (col * SPRITE_SIZE + sx)) *
            4;
          if (data[idx + 3] > 0) {
            found = true;
            break outer;
          }
        }
      }
      if (found) cells.push([col, row]);
    }
  }
  return cells;
}

async function pickRandomSprite(): Promise<SpriteInfo> {
  const sheet = SPRITE_SHEETS[Math.floor(Math.random() * SPRITE_SHEETS.length)];
  const img = new Image();
  img.src = sheet.src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${sheet.src}`));
  });
  const cells = findOccupiedCells(img, sheet.cellCols, sheet.cellRows);
  const [col, row] = cells[Math.floor(Math.random() * cells.length)];
  return { img, col, row };
}

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  elapsed: number,
  daytime: boolean,
) {
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);

  const baseline = height * 0.8;
  const cell = Math.max(3, Math.floor(height / 28));

  // Stars in the sky — night only, drawn before buildings
  if (!daytime) {
    drawStars(ctx, width, baseline, elapsed);
  }

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
  );
  // Near skyline — with windows, wide range: short squat blocks to tall towers
  drawSkyline(
    ctx,
    width,
    baseline,
    elapsed * 0.03,
    palette.skylineNear,
    cell * 5,
    height * 0.03,
    height * 0.5,
    47,
    height,
    palette.windowLit,
    palette.windowDark,
    cell,
    0.06,
    elapsed,
  );

  const bbWidth = cell * 13;
  const bbHeight = cell * 12;
  const bbX = width - cell * 16;
  const bbY = cell * 3;
  const bbFrameBottom = bbY + bbHeight + cell;

  // Support gap — thin strip of pipes separating the billboard frame from the brick below
  const pipeGap = cell * 2;
  const brickTop = bbFrameBottom + pipeGap;
  drawPipes(ctx, bbX, bbWidth, bbFrameBottom, brickTop, cell, palette.pipe);

  // Brick building — the pedestal the billboard sits on, filling the rest of the gap above the street
  const bbFw = cell * 1.5;
  drawBrickBuilding(
    ctx,
    bbX - bbFw,
    bbWidth + bbFw * 2,
    brickTop,
    baseline,
    cell,
    palette,
  );

  drawBillboard(
    ctx,
    { x: bbX, y: bbY },
    { width: bbWidth, height: bbHeight, cell },
    {
      frame: palette.frame,
      screen: palette.screen,
      glow: palette.glow,
      facePixel: palette.facePixel,
    },
    Math.floor(elapsed / 1400) % FACE_FRAMES.length,
    !daytime,
    elapsed,
  );

  drawStreet(ctx, width, height, baseline, cell, palette, elapsed, daytime);
}

interface SpriteDrawState {
  facing: 'left' | 'right';
  animState: 'idle' | 'walk';
  elapsed: number;
  squashed?: boolean;
}

/**
 * Draws the character sprite anchored by its horizontal center and the
 * y-position of its feet.
 */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: SpriteInfo,
  centerX: number,
  feetY: number,
  cell: number,
  state: SpriteDrawState,
) {
  const scale = Math.max(2, Math.ceil(cell / 8));
  let spriteW = SPRITE_SIZE * scale;
  let spriteH = SPRITE_SIZE * scale;

  let offsetX = 0;
  let offsetY = 0;

  if (state.animState === 'walk') {
    // Vertical position bob while walking
    offsetY =
      Math.floor(state.elapsed / WALK_BOB_PERIOD_MS) % 2 === 0 ? 0 : -scale;
  } else {
    // Slower horizontal sway while idle
    offsetX =
      Math.floor(state.elapsed / IDLE_SWAY_PERIOD_MS) % 2 === 0 ? 0 : scale;
  }

  if (state.squashed) {
    const squashedW = spriteW * 1.2;
    const squashedH = spriteH * 0.8;
    offsetY += spriteH - squashedH;
    spriteW = squashedW;
    spriteH = squashedH;
  }

  const dx = Math.round(centerX - spriteW / 2 + offsetX);
  const dy = Math.round(feetY - spriteH + offsetY);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  if (state.facing === 'right') {
    ctx.translate(dx + spriteW, dy);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(dx, dy);
  }
  ctx.drawImage(
    sprite.img,
    sprite.col * SPRITE_SIZE,
    sprite.row * SPRITE_SIZE,
    SPRITE_SIZE,
    SPRITE_SIZE,
    0,
    0,
    spriteW,
    spriteH,
  );
  ctx.restore();
}

const PROMPT_TEXT = '[ CLICK TO PLAY ]';

interface ButtonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws a button-like prompt (steady frame, blinking label) over the visible
 * (non-overlay) part of the canvas, and returns its bounds so clicks can be
 * restricted to the button area.
 */
function drawClickToPlayPrompt(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cell: number,
  elapsed: number,
  palette: Palette,
): ButtonRect {
  // Centered under the billboard/brick building from drawBackground
  // (bbX = width - cell*16, bbWidth = cell*13 → center = width - cell*9.5).
  const x = width - cell * 9.5;
  // Street band (below the baseline at height*0.8) — the only consistently
  // open strip in the visible game area; the billboard/skyline fill the rest.
  const y = height * 0.9;

  ctx.save();
  ctx.font = `${Math.max(10, Math.floor(cell * 0.85))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = cell * 0.8;
  const padY = cell * 0.6;
  const fontSize = Math.max(10, Math.floor(cell * 0.85));
  const textWidth = ctx.measureText(PROMPT_TEXT).width;
  const box: ButtonRect = {
    x: x - textWidth / 2 - padX,
    y: y - fontSize / 2 - padY,
    width: textWidth + padX * 2,
    height: fontSize + padY * 2,
  };

  ctx.fillStyle = hexToRgba(palette.frame, 0.75);
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.lineWidth = 2;
  ctx.strokeStyle = palette.glow;
  ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2);

  if (Math.floor(elapsed / PROMPT_BLINK_MS) % 2 === 0) {
    ctx.fillStyle = palette.glow;
    ctx.fillText(PROMPT_TEXT, Math.round(x), Math.round(y));
  }
  ctx.restore();
  return box;
}

type GameState = 'passive' | 'active';

export default function HeroGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<SpriteInfo | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    pickRandomSprite()
      .then((s) => {
        spriteRef.current = s;
      })
      .catch(() => {
        // sprite stays null — canvas renders without character
      });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const heroEl = canvas.closest<HTMLElement>('.hero');

    const daytime = isESTDaytime();
    const palette = getPalette(daytime);
    document.documentElement.dataset.heroTime = daytime ? 'day' : 'night';

    let width = canvas.clientWidth;
    let height = canvas.clientHeight;
    let elapsed = 0;
    let frameId = 0;
    let lastFrameTime = 0;
    let lastPhysicsTime = 0;
    let physicsAccumulator = 0;

    let state: GameState = 'passive';
    let facing: 'left' | 'right' = 'right';
    let inputLeft = false;
    let inputRight = false;
    let canJump = false;
    let squashUntil = 0;
    let playerLevel: 'sidewalk' | 'road' = 'sidewalk';
    let roadDropPx = 0;
    let sidewalkRestY = 0;
    let promptButtonRect: ButtonRect | null = null;

    let engine: Matter.Engine | null = null;
    let playerBody: Matter.Body | null = null;
    let sidewalkGround: Matter.Body | null = null;
    let roadGround: Matter.Body | null = null;

    const cellOf = (h: number) => Math.max(3, Math.floor(h / 28));

    const drawPassiveFrame = () => {
      const cell = cellOf(height);
      drawBackground(ctx, width, height, palette, elapsed, daytime);
      drawScanlines(ctx, width, height, palette.scanline);
      if (!prefersReducedMotion) {
        promptButtonRect = drawClickToPlayPrompt(
          ctx,
          width,
          height,
          cell,
          elapsed,
          palette,
        );
      }
    };

    const drawActiveFrame = (now: number) => {
      const cell = cellOf(height);
      drawBackground(ctx, width, height, palette, elapsed, daytime);
      if (spriteRef.current && playerBody) {
        const playerHeight = cell * 4;
        drawSprite(
          ctx,
          spriteRef.current,
          playerBody.position.x,
          playerBody.position.y + playerHeight / 2,
          cell,
          {
            facing,
            animState: inputLeft || inputRight ? 'walk' : 'idle',
            elapsed,
            squashed: now < squashUntil,
          },
        );
      }
      drawScanlines(ctx, width, height, palette.scanline);
    };

    const stepPhysics = (dt: number) => {
      if (!engine || !playerBody) return;
      const vx =
        inputRight === inputLeft
          ? 0
          : inputRight
            ? PLAYER_WALK_SPEED
            : -PLAYER_WALK_SPEED;
      if (vx !== 0) facing = vx > 0 ? 'right' : 'left';
      Body.setVelocity(playerBody, { x: vx, y: playerBody.velocity.y });

      // Jumping from the road and rising past sidewalk height: swap the
      // active platform so the player lands back on the sidewalk instead of
      // falling through to where the road platform used to be.
      if (
        playerLevel === 'road' &&
        sidewalkGround &&
        roadGround &&
        playerBody.position.y <= sidewalkRestY
      ) {
        Composite.remove(engine.world, roadGround);
        Composite.add(engine.world, sidewalkGround);
        playerLevel = 'sidewalk';
      }

      Engine.update(engine, dt);
    };

    const isGroundPair = (pair: Matter.Pair) => {
      const other =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      return other === sidewalkGround || other === roadGround;
    };

    const handleCollisionStart = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      for (const pair of event.pairs) {
        if (!isGroundPair(pair)) continue;
        if (!canJump) squashUntil = performance.now() + LANDING_SQUASH_MS;
        canJump = true;
      }
    };

    const handleCollisionEnd = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      for (const pair of event.pairs) {
        if (isGroundPair(pair)) canJump = false;
      }
    };

    const deactivate = () => {
      if (state !== 'active') return;
      state = 'passive';
      heroEl?.removeAttribute('data-game-active');

      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Events.off(engine, 'collisionEnd', handleCollisionEnd);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
      playerBody = null;
      sidewalkGround = null;
      roadGround = null;
      playerLevel = 'sidewalk';

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerdown', onDocumentPointerDown);

      inputLeft = false;
      inputRight = false;
      drawPassiveFrame();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          event.preventDefault();
          inputRight = true;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          event.preventDefault();
          inputLeft = true;
          break;
        case ' ':
          event.preventDefault();
          if (!event.repeat && canJump && playerBody) {
            Body.setVelocity(playerBody, {
              x: playerBody.velocity.x,
              y: -PLAYER_JUMP_VELOCITY,
            });
            canJump = false;
          }
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          if (
            !event.repeat &&
            playerLevel === 'sidewalk' &&
            canJump &&
            playerBody &&
            engine &&
            sidewalkGround &&
            roadGround
          ) {
            Composite.remove(engine.world, sidewalkGround);
            Composite.add(engine.world, roadGround);
            Body.setPosition(playerBody, {
              x: playerBody.position.x,
              y: playerBody.position.y + roadDropPx,
            });
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: 0 });
            playerLevel = 'road';
            squashUntil = performance.now() + LANDING_SQUASH_MS;
          }
          break;
        case 'ArrowUp':
        case 'w':
        case 'W':
          event.preventDefault();
          if (
            !event.repeat &&
            playerLevel === 'road' &&
            canJump &&
            playerBody &&
            engine &&
            sidewalkGround &&
            roadGround
          ) {
            Composite.remove(engine.world, roadGround);
            Composite.add(engine.world, sidewalkGround);
            Body.setPosition(playerBody, {
              x: playerBody.position.x,
              y: playerBody.position.y - roadDropPx,
            });
            Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: 0 });
            playerLevel = 'sidewalk';
            squashUntil = performance.now() + LANDING_SQUASH_MS;
          }
          break;
        case 'Escape':
          if (!event.repeat) deactivate();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          inputRight = false;
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          inputLeft = false;
          break;
        default:
          break;
      }
    };

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (event.target !== canvas) deactivate();
    };

    const activate = () => {
      if (state === 'active' || prefersReducedMotion) return;
      state = 'active';
      heroEl?.setAttribute('data-game-active', 'true');

      const cell = cellOf(height);
      const baseline = height * 0.8;
      const groundThickness = cell * 2;
      const wallThickness = cell;
      const playerWidth = cell * 2;
      const playerHeight = cell * 4;
      const { roadDrop } = getStreetLevels(baseline, cell);

      engine = Engine.create();

      sidewalkGround = Bodies.rectangle(
        width / 2,
        baseline + groundThickness / 2,
        width * 2,
        groundThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      roadGround = Bodies.rectangle(
        width / 2,
        baseline + roadDrop + groundThickness / 2,
        width * 2,
        groundThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      const leftWall = Bodies.rectangle(
        -wallThickness / 2,
        height / 2,
        wallThickness,
        height * 2,
        { isStatic: true },
      );
      const rightWall = Bodies.rectangle(
        width + wallThickness / 2,
        height / 2,
        wallThickness,
        height * 2,
        { isStatic: true },
      );

      playerBody = Bodies.rectangle(
        cell * PLAYER_SPAWN_X_CELLS,
        baseline - playerHeight / 2 - cell * SPAWN_DROP_CELLS,
        playerWidth,
        playerHeight,
        { friction: PLAYER_FRICTION },
      );
      Body.setInertia(playerBody, Infinity);

      Composite.add(engine.world, [
        sidewalkGround,
        leftWall,
        rightWall,
        playerBody,
      ]);
      Events.on(engine, 'collisionStart', handleCollisionStart);
      Events.on(engine, 'collisionEnd', handleCollisionEnd);

      facing = 'right';
      inputLeft = false;
      inputRight = false;
      canJump = false;
      playerLevel = 'sidewalk';
      roadDropPx = roadDrop;
      sidewalkRestY = baseline - playerHeight / 2;
      physicsAccumulator = 0;
      lastPhysicsTime = 0;
      squashUntil = 0;

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('pointerdown', onDocumentPointerDown);
    };

    const isWithinPromptButton = (event: MouseEvent | PointerEvent) => {
      if (!promptButtonRect) return false;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      return (
        x >= promptButtonRect.x &&
        x <= promptButtonRect.x + promptButtonRect.width &&
        y >= promptButtonRect.y &&
        y <= promptButtonRect.y + promptButtonRect.height
      );
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (state === 'passive' && isWithinPromptButton(event)) activate();
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      canvas.style.cursor =
        state === 'passive' && isWithinPromptButton(event) ? 'pointer' : '';
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (state === 'active') {
        // World geometry is sized off `width`/`height` — simplest to reset
        // rather than reposition every body on the fly.
        deactivate();
        return;
      }
      drawPassiveFrame();
    };

    resize();
    window.addEventListener('resize', resize);

    if (prefersReducedMotion) {
      return () => window.removeEventListener('resize', resize);
    }

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointermove', onCanvasPointerMove);

    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);

      if (state === 'active' && engine && playerBody) {
        if (lastPhysicsTime === 0) lastPhysicsTime = time;
        const frameDelta = Math.min(time - lastPhysicsTime, 250);
        lastPhysicsTime = time;
        physicsAccumulator += frameDelta;
        while (physicsAccumulator >= FIXED_PHYSICS_DT) {
          stepPhysics(FIXED_PHYSICS_DT);
          physicsAccumulator -= FIXED_PHYSICS_DT;
        }
      } else {
        lastPhysicsTime = 0;
      }

      const drawDelta = time - lastFrameTime;
      if (drawDelta < FRAME_DURATION) return;
      lastFrameTime = time - (drawDelta % FRAME_DURATION);
      elapsed += drawDelta;

      if (state === 'active') {
        drawActiveFrame(time);
      } else {
        drawPassiveFrame();
      }
    };

    const start = () => {
      if (frameId) return;
      lastFrameTime = performance.now();
      frameId = requestAnimationFrame(tick);
    };

    const stop = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) start();
        else stop();
      },
      { threshold: 0.1 },
    );
    observer.observe(canvas);

    return () => {
      stop();
      observer.disconnect();
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      deactivate();
    };
  }, [prefersReducedMotion]);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
