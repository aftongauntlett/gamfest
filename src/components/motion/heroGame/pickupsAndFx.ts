import type Matter from 'matter-js';
import {
  CLOUD_REPAIR_MS,
  CONFETTI_COLORS,
  CONFETTI_COUNT,
  FEEDBACK_MS,
  ITEM_SPRITE_SIZE,
} from './constants';
import type { RING_SPRITES } from './sprites';

export interface FloatingFeedback {
  text: string;
  tone: 'good' | 'bad' | 'warn';
  startedAt: number;
  yOffset: number;
}

/** A single falling square spawned for the post-clear celebration. */
export interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  angle: number;
  spin: number;
}

export function drawRingPickup(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  cell: number,
  color: string,
  daytime: boolean,
  collected: boolean,
  sheet: HTMLImageElement | null,
  sprite: (typeof RING_SPRITES)[keyof typeof RING_SPRITES],
) {
  if (collected) return;
  const bob = Math.sin(performance.now() * 0.006 + body.id) * cell * 0.12;
  const x = body.position.x;
  const y = body.position.y + bob;
  const size = Math.max(28, Math.round(cell * 2.25));

  ctx.save();
  ctx.translate(x, y);
  ctx.imageSmoothingEnabled = false;

  if (!daytime) {
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.fillRect(
      -size * 0.34,
      size * 0.36,
      size * 0.68,
      Math.max(2, cell * 0.18),
    );
    ctx.globalAlpha = 1;
  }

  if (sheet?.complete && sheet.naturalWidth > 0) {
    ctx.drawImage(
      sheet,
      sprite.col * ITEM_SPRITE_SIZE,
      sprite.row * ITEM_SPRITE_SIZE,
      ITEM_SPRITE_SIZE,
      ITEM_SPRITE_SIZE,
      -size / 2,
      -size / 2,
      size,
      size,
    );
  } else {
    ctx.lineWidth = Math.max(3, Math.floor(cell * 0.24));
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, size * 0.06, size * 0.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillRect(-size * 0.1, -size * 0.4, size * 0.2, size * 0.16);
  }

  if (daytime) {
    // Translucent orb/shadow read poorly against a bright sky — a bright
    // outline ring around the sprite gives contrast in any daytime palette.
    const ringRadius = size * 0.58;
    ctx.lineWidth = Math.max(4, Math.floor(cell * 0.3));
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(2, Math.floor(cell * 0.16));
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius * 0.92, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function snapToPixel(value: number, pixel: number) {
  return Math.round(value / pixel) * pixel;
}

function drawPixelCloudBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  pixel: number,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(
    snapToPixel(x, pixel),
    snapToPixel(y, pixel),
    snapToPixel(width, pixel),
    snapToPixel(height, pixel),
  );
}

/**
 * Renders a cloud platform around the physics body. The collision remains a
 * simple flat rectangle, but the art is made from chunky pixel blocks so it
 * reads like an 8-bit platform instead of anti-aliased circles.
 */
export function drawFlatCloudPlatform(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  cell: number,
  daytime: boolean,
  now = 0,
  brokenUntil = 0,
) {
  const { x, y } = body.position;
  const width = body.bounds.max.x - body.bounds.min.x;
  const height = body.bounds.max.y - body.bounds.min.y;
  const cloudColor = daytime ? '#ffffff' : '#c7c2e6';
  const puffShade = daytime ? '#eaf2fb' : '#aea7d4';
  const bellyShade = daytime ? '#cfe0ef' : '#8f88bf';
  const highlight = daytime ? '#f8fcff' : '#ded9ff';
  const broken = now < brokenUntil;
  const repairProgress =
    brokenUntil > 0
      ? Math.max(0, Math.min(1, 1 - (brokenUntil - now) / CLOUD_REPAIR_MS))
      : 1;
  const pixel = Math.max(3, Math.floor(cell * 0.22));
  const breakSpread = broken ? (1 - repairProgress) * cell * 1.5 : 0;
  const visualHeight = Math.max(cell * 1.9, height * 3);
  const baseY = visualHeight * 0.08;
  const blocks = [
    { x: -0.42, y: -0.02, w: 0.84, h: 0.36, c: cloudColor },
    { x: -0.36, y: 0.22, w: 0.74, h: 0.18, c: bellyShade },
    { x: -0.28, y: 0.34, w: 0.56, h: 0.12, c: bellyShade },
    { x: -0.5, y: 0.1, w: 0.18, h: 0.2, c: puffShade },
    { x: 0.34, y: 0.08, w: 0.2, h: 0.24, c: puffShade },
    { x: -0.34, y: -0.28, w: 0.22, h: 0.28, c: cloudColor },
    { x: -0.14, y: -0.4, w: 0.28, h: 0.4, c: highlight },
    { x: 0.1, y: -0.32, w: 0.24, h: 0.32, c: cloudColor },
    { x: 0.3, y: -0.22, w: 0.22, h: 0.28, c: cloudColor },
    { x: -0.2, y: 0.06, w: 0.22, h: 0.14, c: puffShade },
    { x: 0.04, y: 0.08, w: 0.28, h: 0.16, c: puffShade },
  ];

  ctx.save();
  ctx.translate(x, y);

  if (!broken) {
    for (const block of blocks) {
      drawPixelCloudBlock(
        ctx,
        block.x * width,
        baseY + block.y * visualHeight,
        block.w * width,
        block.h * visualHeight,
        block.c,
        pixel,
      );
    }
  } else {
    ctx.globalAlpha = 0.42 + repairProgress * 0.5;
    blocks.forEach((block, index) => {
      const side = block.x < 0 ? -1 : block.x > 0.12 ? 1 : index % 2 ? -1 : 1;
      const lift = Math.sin(now * 0.012 + body.id + index) * pixel;
      drawPixelCloudBlock(
        ctx,
        block.x * width + side * breakSpread * (0.35 + index * 0.06),
        baseY + block.y * visualHeight + lift + breakSpread * 0.12,
        block.w * width * (0.72 + repairProgress * 0.28),
        block.h * visualHeight,
        block.c,
        pixel,
      );
    });
    for (let i = 0; i < 14; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const distance = breakSpread * (0.65 + (i % 5) * 0.16);
      const drift = Math.sin(now * 0.016 + i + body.id) * pixel;
      drawPixelCloudBlock(
        ctx,
        side * distance + drift,
        baseY +
          ((i % 4) - 1.5) * pixel * 1.4 -
          breakSpread * (0.1 + (i % 3) * 0.08),
        pixel * (1 + (i % 2)),
        pixel,
        i % 3 === 0 ? highlight : i % 3 === 1 ? cloudColor : bellyShade,
        pixel,
      );
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

export function drawElevatedLedge(
  ctx: CanvasRenderingContext2D,
  body: Matter.Body,
  cell: number,
  daytime: boolean,
) {
  drawFlatCloudPlatform(ctx, body, cell, daytime);
}

/** How long the pop-in scale animation runs at the start of a feedback's life. */
const FEEDBACK_POP_MS = 180;

export function drawFeedback(
  ctx: CanvasRenderingContext2D,
  feedbacks: FloatingFeedback[],
  width: number,
  height: number,
  cell: number,
  now: number,
) {
  const active = feedbacks.filter(
    (feedback) => now - feedback.startedAt < FEEDBACK_MS,
  );
  if (active.length === 0) return;

  ctx.save();
  ctx.font = `${Math.max(11, Math.floor(cell * 0.85))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, Math.floor(cell * 0.22));
  for (const feedback of active) {
    const age = now - feedback.startedAt;
    const alpha =
      age < 160
        ? age / 160
        : age > FEEDBACK_MS - 420
          ? (FEEDBACK_MS - age) / 420
          : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    const fillColor =
      feedback.tone === 'good'
        ? '#39ff14'
        : feedback.tone === 'bad'
          ? '#ff4d5d'
          : '#ffb347';

    const popT = Math.min(1, age / FEEDBACK_POP_MS);
    const eased = 1 - (1 - popT) ** 3;
    const scale = 0.5 + 0.5 * eased;

    ctx.save();
    ctx.translate(width / 2, height / 2 + feedback.yOffset - age * 0.018);
    ctx.scale(scale, scale);
    ctx.strokeStyle = '#10141c';
    ctx.strokeText(feedback.text, 0, 0);
    ctx.fillStyle = fillColor;
    ctx.fillText(feedback.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function spawnConfetti(width: number, height: number): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, () => ({
    x: Math.random() * width,
    y: -Math.random() * height * 0.5 - 8,
    vx: (Math.random() - 0.5) * 1.6,
    vy: 1.2 + Math.random() * 2.2,
    size: 3 + Math.random() * 4,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    angle: Math.random() * Math.PI * 2,
    spin: (Math.random() - 0.5) * 0.2,
  }));
}

/** Drifts confetti down the screen and recycles pieces back to the top. */
export function drawConfetti(
  ctx: CanvasRenderingContext2D,
  confetti: ConfettiPiece[],
  width: number,
  height: number,
) {
  if (confetti.length === 0) return;
  for (const piece of confetti) {
    piece.x += piece.vx;
    piece.y += piece.vy;
    piece.angle += piece.spin;
    if (piece.y > height + 10) {
      piece.y = -10;
      piece.x = Math.random() * width;
    }
    if (piece.x < -10) piece.x = width + 10;
    else if (piece.x > width + 10) piece.x = -10;

    ctx.save();
    ctx.translate(piece.x, piece.y);
    ctx.rotate(piece.angle);
    ctx.fillStyle = piece.color;
    ctx.fillRect(-piece.size / 2, -piece.size / 2, piece.size, piece.size);
    ctx.restore();
  }
}
