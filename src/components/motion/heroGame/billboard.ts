import { PROMPT_BLINK_MS } from './constants';
import { hexToRgba, pseudoRandom, type Palette } from './palette';

/** Pixel face — two expressions (open smile / blink) */
export const FACE_FRAMES: ReadonlyArray<
  ReadonlyArray<readonly [number, number]>
> = [
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

const BILLBOARD_ARROW_MARKER = '<- ';
const BILLBOARD_ARROW_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [0, 3],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 1],
  [2, 3],
  [2, 5],
  [3, 3],
  [4, 3],
  [5, 3],
];

export const BILLBOARD_TEXT = 'You made it up\nhere! Nice.';
export const BILLBOARD_MESSAGES = [
  'You made it up\nhere! Nice.',
  'Got the ring?\nDouble jump now!',
  '<- Climb the\nsigns up there',
  'Slam unlocked?\nSmash it all!',
  "You're crushing\nit. Literally.",
];

function drawBillboardArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
) {
  const px = Math.max(1, Math.floor(size / 6));
  const arrowWidth = px * 6;
  const arrowHeight = px * 7;
  const startX = x;
  const startY = y - arrowHeight / 2;

  for (const [col, row] of BILLBOARD_ARROW_PIXELS) {
    ctx.fillRect(startX + col * px, startY + row * px, px, px);
  }

  return arrowWidth;
}

export function getBillboardFrameWidth(cell: number): number {
  return Math.max(3, Math.floor(cell * 0.8));
}

export function getBillboardGeometry(width: number, cell: number) {
  const bbWidth = cell * 13;
  const bbHeight = cell * 12;
  const bbX = width - cell * 16;
  const bbY = cell * 3;
  const frameWidth = getBillboardFrameWidth(cell);
  const frameBottom = bbY + bbHeight + frameWidth;
  const pipeGap = cell * 3.35;
  const brickTop = frameBottom + pipeGap;
  const brickX = bbX - frameWidth;
  const brickWidth = bbWidth + frameWidth * 2;

  return {
    bbX,
    bbY,
    bbWidth,
    bbHeight,
    frameWidth,
    frameBottom,
    pipeGap,
    brickTop,
    brickX,
    brickWidth,
  };
}

export function drawBillboard(
  ctx: CanvasRenderingContext2D,
  origin: { x: number; y: number },
  size: { width: number; height: number; cell: number },
  colors: { frame: string; screen: string; glow: string; facePixel: string },
  frame: number,
  nightGlow = false,
  elapsed = 0,
  showMessage = true,
  options?: {
    message?: string;
    glitching?: boolean;
    noiseSeed?: number;
    showControls?: boolean;
    helpOpen?: boolean;
    screenBroken?: boolean;
  },
) {
  const { x, y } = origin;
  const { width, height, cell } = size;
  const fw = getBillboardFrameWidth(cell);
  const glitching = options?.glitching ?? false;

  ctx.fillStyle = colors.frame;
  ctx.fillRect(x - fw, y - fw, width + fw * 2, height + fw * 2);

  ctx.fillStyle = colors.screen;
  ctx.fillRect(x, y, width, height);
  if (options?.screenBroken) {
    const seedBase = Math.floor(elapsed / 70);
    for (let i = 0; i < 80; i++) {
      const px = x + pseudoRandom(seedBase + i * 4.7) * width;
      const py = y + pseudoRandom(seedBase + i * 8.3) * height;
      const size = 1 + Math.floor(pseudoRandom(seedBase + i * 2.1) * 3);
      ctx.globalAlpha = 0.2 + pseudoRandom(seedBase + i * 3.4) * 0.55;
      ctx.fillStyle =
        pseudoRandom(seedBase + i * 5.9) > 0.5 ? colors.glow : colors.frame;
      ctx.fillRect(px, py, size, size);
    }
    ctx.globalAlpha = 1;
  }

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

  if (options?.helpOpen) {
    drawBillboardHelp(ctx, x, y, width, height, cell, colors, nightGlow);
  } else if (options?.screenBroken) {
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = Math.max(1, Math.floor(cell * 0.12));
    ctx.beginPath();
    ctx.moveTo(x + width * 0.18, y + height * 0.2);
    ctx.lineTo(x + width * 0.42, y + height * 0.45);
    ctx.lineTo(x + width * 0.33, y + height * 0.72);
    ctx.lineTo(x + width * 0.58, y + height * 0.88);
    ctx.moveTo(x + width * 0.78, y + height * 0.18);
    ctx.lineTo(x + width * 0.62, y + height * 0.44);
    ctx.lineTo(x + width * 0.82, y + height * 0.68);
    ctx.stroke();
  } else {
    // Face — shifted into upper ~40% of screen to leave room for text below
    ctx.fillStyle = colors.facePixel;
    const px = Math.max(2, Math.floor(width / 10));
    const ox = x + (width - px * 8) / 2;
    const oy = y + Math.floor((height - px * 6) * 0.32);
    if (glitching || frame === 2) {
      const seedBase = Math.floor((options?.noiseSeed ?? elapsed) / 80);
      const noiseCount = glitching ? 18 : 14;
      for (let i = 0; i < noiseCount; i++) {
        const col = Math.floor(pseudoRandom(seedBase + i * 9.17) * 8);
        const row = Math.floor(pseudoRandom(seedBase + i * 5.31 + 2) * 6);
        ctx.globalAlpha = 0.55 + pseudoRandom(seedBase + i * 3.83) * 0.45;
        ctx.fillRect(ox + col * px, oy + row * px, px - 1, px - 1);
      }
      ctx.globalAlpha = 1;
    } else {
      FACE_FRAMES[frame].forEach(([col, row]) => {
        ctx.fillRect(ox + col * px, oy + row * px, px - 1, px - 1);
      });
    }
  }

  if (showMessage && !options?.helpOpen && !options?.screenBroken) {
    // Terminal text with blinking underscore cursor
    const cursor = Math.floor(elapsed / 530) % 2 === 0 ? '_' : ' ';
    const message = options?.message ?? BILLBOARD_TEXT;
    const lines = message.split('\n').slice(0, 2);
    if (lines.length > 0) lines[lines.length - 1] += cursor;
    const arrowSize = Math.max(8, cell * 0.9);
    const arrowGap = Math.max(3, cell * 0.28);
    const maxW = width - cell * 2;
    let fs = Math.max(8, Math.floor(cell * 1.35));
    ctx.font = `${fs}px 'VT323', monospace`;
    const getLineWidth = (line: string) => {
      if (!line.startsWith(BILLBOARD_ARROW_MARKER)) {
        return ctx.measureText(line).width;
      }
      return (
        arrowSize +
        arrowGap +
        ctx.measureText(line.slice(BILLBOARD_ARROW_MARKER.length)).width
      );
    };
    while (lines.some((line) => getLineWidth(line) > maxW) && fs > 8) {
      fs -= 1;
      ctx.font = `${fs}px 'VT323', monospace`;
    }
    ctx.fillStyle = colors.facePixel;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lineHeight = fs * 0.95;
    const startY =
      y +
      height -
      Math.floor(cell * 1.6) -
      ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      const lineY = startY + index * lineHeight;
      if (line.startsWith(BILLBOARD_ARROW_MARKER)) {
        const text = line.slice(BILLBOARD_ARROW_MARKER.length);
        const textWidth = ctx.measureText(text).width;
        const totalWidth = arrowSize + arrowGap + textWidth;
        const startX = x + width / 2 - totalWidth / 2;

        ctx.textAlign = 'left';
        const drawnArrowWidth = drawBillboardArrow(
          ctx,
          startX,
          lineY,
          arrowSize,
        );
        ctx.fillText(text, startX + drawnArrowWidth + arrowGap, lineY);
        ctx.textAlign = 'center';
        return;
      }
      ctx.fillText(line, x + width / 2, lineY);
    });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  if (options?.showControls) {
    const {
      x: chipX,
      y: chipY,
      size: chip,
    } = getBillboardHelpButtonBounds(x, y, width, cell);
    ctx.fillStyle = colors.frame;
    ctx.fillRect(chipX, chipY, chip, chip);
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = Math.max(1, Math.floor(cell * 0.1));
    ctx.strokeRect(chipX + 1, chipY + 1, chip - 2, chip - 2);
    ctx.fillStyle = colors.glow;
    ctx.font = `${Math.max(8, Math.floor(cell * 0.8))}px 'Press Start 2P', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      options.helpOpen ? 'X' : '?',
      chipX + chip / 2,
      chipY + chip / 2 + 1,
    );
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
}

export function getBillboardHelpButtonBounds(
  billboardX: number,
  billboardY: number,
  billboardWidth: number,
  cell: number,
) {
  const size = Math.max(10, cell * 1.25);
  return {
    x: billboardX + billboardWidth - size - cell * 0.45,
    y: billboardY + cell * 0.45,
    size,
  };
}

export function drawBillboardHelp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  cell: number,
  colors: { frame: string; screen: string; glow: string; facePixel: string },
  nightGlow: boolean,
) {
  const inset = Math.max(4, Math.floor(cell * 0.42));
  const px = Math.max(2, Math.floor(cell * 0.18));
  const panelX = x + inset;
  const panelY = y + inset;
  const panelW = width - inset * 2;
  const panelH = height - inset * 2;
  const lineColor = nightGlow ? colors.glow : '#0d7a32';
  const textColor = nightGlow ? '#b8ffb0' : '#12331b';

  ctx.fillStyle = nightGlow ? '#071807' : '#eaffdf';
  ctx.fillRect(panelX, panelY, panelW, panelH);

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = Math.max(1, Math.floor(cell * 0.1));
  ctx.strokeRect(panelX + 1, panelY + 1, panelW - 2, panelH - 2);

  ctx.fillStyle = colors.frame;
  ctx.fillRect(panelX + px, panelY + px, panelW - px * 2, cell * 1.25);
  ctx.fillStyle = colors.glow;
  ctx.font = `${Math.max(7, Math.floor(cell * 0.54))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('HELP', x + width / 2, panelY + px + cell * 0.65);

  const rows = [
    ['MOVE', 'A/D'],
    ['SPRINT', 'SHIFT'],
    ['JUMP', 'SPACE'],
    ['DOUBLE', 'SPACE'],
    ['SLAM', 'E'],
    ['EXIT', 'ESC'],
    ['RESET', 'R'],
  ];
  const rowFont = Math.max(6, Math.floor(cell * 0.42));
  const rowGap = Math.max(11, Math.floor(cell * 1.05));
  let rowY = panelY + cell * 2.25;

  ctx.font = `${rowFont}px 'Press Start 2P', monospace`;
  ctx.textBaseline = 'middle';
  for (const [label, key] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = textColor;
    ctx.fillText(label, panelX + cell * 0.55, rowY);

    const keyW = Math.min(
      panelW * 0.5,
      ctx.measureText(key).width + cell * 0.72,
    );
    const keyX = panelX + panelW - keyW - cell * 0.46;
    const keyH = Math.max(7, rowFont + cell * 0.34);
    ctx.fillStyle = colors.frame;
    ctx.fillRect(keyX, rowY - keyH / 2, keyW, keyH);
    ctx.strokeStyle = lineColor;
    ctx.strokeRect(keyX + 1, rowY - keyH / 2 + 1, keyW - 2, keyH - 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.glow;
    ctx.fillText(key, keyX + keyW / 2, rowY + 1);
    rowY += rowGap;
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

const PROMPT_TEXT = 'CLICK TO PLAY';

interface ButtonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws the passive play prompt on the billboard screen. The whole canvas is
 * clickable; the returned bounds only support a pointer cursor over the text.
 */
export function drawClickToPlayPrompt(
  ctx: CanvasRenderingContext2D,
  width: number,
  cell: number,
  elapsed: number,
  palette: Palette,
): ButtonRect {
  const billboard = getBillboardGeometry(width, cell);
  const x = billboard.bbX + billboard.bbWidth / 2;
  const y = billboard.bbY + billboard.bbHeight - cell * 1.35;

  ctx.save();
  ctx.font = `${Math.max(8, Math.floor(cell * 0.72))}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = cell * 0.55;
  const padY = cell * 0.45;
  const fontSize = Math.max(8, Math.floor(cell * 0.72));
  const textWidth = ctx.measureText(PROMPT_TEXT).width;
  const box: ButtonRect = {
    x: x - textWidth / 2 - padX,
    y: y - fontSize / 2 - padY,
    width: textWidth + padX * 2,
    height: fontSize + padY * 2,
  };

  ctx.fillStyle = hexToRgba(palette.frame, 0.68);
  ctx.fillRect(box.x, box.y, box.width, box.height);
  ctx.lineWidth = Math.max(1, Math.floor(cell * 0.1));
  ctx.strokeStyle = palette.glow;
  ctx.strokeRect(box.x + 1, box.y + 1, box.width - 2, box.height - 2);

  if (Math.floor(elapsed / PROMPT_BLINK_MS) % 2 === 0) {
    ctx.fillStyle = palette.glow;
    ctx.fillText(PROMPT_TEXT, Math.round(x), Math.round(y));
  }
  ctx.restore();
  return box;
}
