import {
  IDLE_SWAY_PERIOD_MS,
  SPRITE_SIZE,
  WALK_BOB_PERIOD_MS,
} from './constants';

export const RING_SPRITES = {
  blue: { col: 4, row: 17 },
  red: { col: 3, row: 17 },
} as const;

export interface SpriteInfo {
  img: HTMLImageElement;
  col: number;
  row: number;
}

export interface SpriteDrawState {
  facing: 'left' | 'right';
  animState: 'idle' | 'walk';
  elapsed: number;
  squashed?: boolean;
}

interface SpriteSheetDef {
  src: string;
  cellCols: number;
  cellRows: number;
  /** Occupied [col, row] cells to exclude from spawning. */
  excluded?: [number, number][];
}

const SPRITE_SHEETS: SpriteSheetDef[] = [
  { src: '/sprites/rogues.png', cellCols: 7, cellRows: 7 },
  { src: '/sprites/animals.png', cellCols: 9, cellRows: 16 },
  {
    src: '/sprites/monsters.png',
    cellCols: 12,
    cellRows: 13,
    excluded: [
      [2, 7], // stone golem
      // bugs, bats, and wolves row
      [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
      [6, 6], [7, 6], [8, 6], [9, 6], [10, 6], [11, 6],
      // dragons and wyrm row
      [0, 8], [1, 8], [2, 8], [3, 8], [4, 8],
      // tangle/tentacle creatures
      [0, 12], [1, 12], [2, 12],
    ],
  },
];

export function findOccupiedCells(
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

export async function pickRandomSprite(): Promise<SpriteInfo> {
  const sheet = SPRITE_SHEETS[Math.floor(Math.random() * SPRITE_SHEETS.length)];
  const img = new Image();
  img.src = sheet.src;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${sheet.src}`));
  });
  let cells = findOccupiedCells(img, sheet.cellCols, sheet.cellRows);
  if (sheet.excluded) {
    const excluded = new Set(sheet.excluded.map(([c, r]) => `${c},${r}`));
    cells = cells.filter(([c, r]) => !excluded.has(`${c},${r}`));
  }
  const [col, row] = cells[Math.floor(Math.random() * cells.length)];
  return { img, col, row };
}

/**
 * Draws the character sprite anchored by its horizontal center and the
 * y-position of its feet.
 */
export function drawSprite(
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
