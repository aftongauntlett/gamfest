import Matter from 'matter-js';
import {
  DAMAGE_SHAKE_MS,
  OBJECT_FRICTION,
  OBJECT_FRICTION_STATIC,
  OBJECT_RESTITUTION,
  SLAM_DAMAGE,
} from './constants';
import { hexToRgba, type Palette } from './palette';

const { Bodies, Body } = Matter;

// --- Interactive objects: CTA buttons & badges (Phase 2) ---------------

export type ObjectVariant =
  | 'primary'
  | 'secondary'
  | 'green'
  | 'amber'
  | 'magenta'
  | 'wordmark'
  | 'wordmarkAccent'
  | 'wordmarkPlate'
  | 'tagline';

/**
 * `pinned` → `fallen` is the lifecycle for most objects.
 * `fallen` covers both the falling and settled-"obstacle" states — both are
 * the same dynamic body, just at different points in its physics journey.
 *
 * The `[fest]` plate uses `offline` once its neon shield is powered down:
 * it keeps rendering as a dim background fixture, but its body no longer
 * blocks the player and the letters inside can be knocked loose.
 */
export type ObjectState =
  | 'pinned'
  | 'damaged'
  | 'offline'
  | 'wobbling'
  | 'fallen';

export interface InteractiveObject {
  body: Matter.Body;
  kind: 'button' | 'badge' | 'wordmark' | 'wordmarkPlate' | 'tagline';
  variant: ObjectVariant;
  label: string;
  width: number;
  height: number;
  state: ObjectState;
  destructible: boolean;
  /** `f`, `e`, `s`, `t` — locked until the neon plate is powered down. */
  shielded: boolean;
  /** `[` and `]` — immune to slam impacts; only fall when stood on post-shield. */
  bracket: boolean;
  /** Remaining durability. */
  health: number;
  /** Starting durability, used to derive damage state. */
  maxHealth: number;
  /** `performance.now()` of the last state change — drives the damage shake. */
  hitAt: number;
  /** Number of hits landed so far — drives the flicker count on each hit. */
  hitCount: number;
  /** `performance.now()` of the last underside-bump hit — debounces the per-step poll. */
  lastBumpAt: number;
}

export interface ObjectLayout {
  text: string;
  variant: ObjectVariant;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HeroLayout {
  tagline: ObjectLayout[];
  wordmarkPlate: ObjectLayout;
  wordmark: ObjectLayout[];
  badges: ObjectLayout[];
  buttons: ObjectLayout[];
}

export const BADGE_DEFS: ReadonlyArray<{
  text: string;
  variant: ObjectVariant;
}> = [
  { text: 'FREE', variant: 'green' },
  { text: 'IRL', variant: 'amber' },
  { text: 'TBD 2027', variant: 'magenta' },
];

export const BUTTON_DEFS: ReadonlyArray<{
  text: string;
  variant: ObjectVariant;
}> = [
  { text: 'JOIN DISCORD', variant: 'primary' },
  { text: 'FOLLOW ON FACEBOOK', variant: 'secondary' },
];

/** Square footprint of the brand glyph drawn beside each CTA button's label. */
const BUTTON_ICON_SIZE = 18;
/** Gap between the brand glyph and the label, matching `--space-2` in `Button.astro`. */
const BUTTON_ICON_GAP = 8;

/** Letters held by the `[fest]` neon plate until it is powered down. */
export const BRACKET_SHIELDED_CHARS = new Set(['f', 'e', 's', 't']);
/** The brackets themselves — immune to slam, fall only when stood on post-shield. */
export const BRACKET_CHARS = new Set(['[', ']']);

function measureTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  tracking: number,
): number {
  if (text.length <= 1) return ctx.measureText(text).width;
  return ctx.measureText(text).width + (text.length - 1) * tracking;
}

function drawTrackedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
) {
  const totalW = measureTrackedText(ctx, text, tracking);
  let cursorX = x - totalW / 2;

  for (const char of text) {
    const charW = ctx.measureText(char).width;
    ctx.fillText(char, cursorX + charW / 2, y);
    cursorX += charW + tracking;
  }
}

/** `viewBox` size of the brand glyphs in `Icon.astro`, replicated here for canvas. */
const SOCIAL_ICON_VIEWBOX = 24;
/** Matches `stroke-width="1.75"` on the shared `.icon` SVGs. */
const SOCIAL_ICON_STROKE_WIDTH = 1.75;

/**
 * Discord glyph — mirrors the `discord` case in `Icon.astro` (rounded
 * controller body, headband, two eyes), scaled to `size` px and centered on
 * the current origin.
 */
function drawDiscordIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
) {
  const scale = size / SOCIAL_ICON_VIEWBOX;
  ctx.save();
  ctx.translate(-size / 2, -size / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = SOCIAL_ICON_STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;

  ctx.beginPath();
  ctx.roundRect(4, 7, 16, 11, 5.5);
  ctx.stroke();
  ctx.stroke(new Path2D('M8.5 7 9.5 4.5h5L15.5 7'));
  for (const eyeX of [9.5, 14.5]) {
    ctx.beginPath();
    ctx.arc(eyeX, 13, 1.25, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Facebook glyph — mirrors the `facebook` case in `Icon.astro` (outlined "f"
 * mark), scaled to `size` px and centered on the current origin.
 */
function drawFacebookIcon(
  ctx: CanvasRenderingContext2D,
  size: number,
  color: string,
) {
  const scale = size / SOCIAL_ICON_VIEWBOX;
  ctx.save();
  ctx.translate(-size / 2, -size / 2);
  ctx.scale(scale, scale);
  ctx.lineWidth = SOCIAL_ICON_STROKE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke(
    new Path2D(
      'M15 8.5h2.25V5.5h-2.25c-2.07 0-3.75 1.68-3.75 3.75V11H9v3h2.25v6.5h3V14H17l.5-3h-3.25V9.25c0-.41.34-.75.75-.75Z',
    ),
  );
  ctx.restore();
}

/**
 * Lays out the badge row and CTA button row in a left-aligned column,
 * mirroring `.hero__badges` / `.hero__actions` from the passive layout
 * (badges at `y ≈ cell*6`, buttons at `y ≈ cell*10`).
 * Sizes are measured from the same pixel font the objects are drawn with, so
 * physics bodies match their visuals exactly.
 */
export function computeHeroLayout(ctx: CanvasRenderingContext2D): HeroLayout {
  const marginX = 64;
  const rowGap = 16;

  const taglineFont = 14;
  const taglinePadX = 2;
  const taglineHeight = taglineFont * 1.6;
  const taglineY = 48;
  const taglineChunks = ['GAMES', 'ART', 'MUSIC', 'FEST'];
  ctx.font = `700 ${taglineFont}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  let taglineX = marginX;
  const tagline = taglineChunks.map((text, index) => {
    const width = ctx.measureText(text).width + taglinePadX * 2;
    const layout: ObjectLayout = {
      text,
      variant: 'tagline',
      x: taglineX,
      y: taglineY,
      width,
      height: taglineHeight,
    };
    taglineX +=
      width +
      (index === taglineChunks.length - 1 ? 0 : ctx.measureText(' | ').width);
    return layout;
  });

  const wordmarkFont = 72;
  const wordmarkHeight = wordmarkFont * 1.1;
  const wordmarkY = taglineY + taglineHeight + rowGap;
  const wordmarkChars = Array.from('GAM[fest]');
  const wordmarkTracking = wordmarkFont * 0.04;
  const wordmarkAccentGap = wordmarkFont * 0.18;
  ctx.font = `${wordmarkFont}px 'VT323', monospace`;
  let wordmarkX = marginX;
  let accentLeft = 0;
  let accentRight = 0;
  const wordmark = wordmarkChars.map((text, index) => {
    const isAccent = index >= 3;
    const width = ctx.measureText(text).width;
    if (index === 3) accentLeft = wordmarkX;
    const layout: ObjectLayout = {
      text,
      variant: isAccent ? 'wordmarkAccent' : 'wordmark',
      x: wordmarkX,
      y: wordmarkY,
      width,
      height: wordmarkHeight,
    };
    wordmarkX += width + (index === 2 ? wordmarkAccentGap : wordmarkTracking);
    if (isAccent) accentRight = wordmarkX - wordmarkTracking;
    return layout;
  });
  const wordmarkPlateHeight = wordmarkFont;
  const wordmarkPlatePadX = wordmarkFont * 0.15;
  const wordmarkPlate: ObjectLayout = {
    text: '[fest] plate',
    variant: 'wordmarkPlate',
    x: accentLeft - wordmarkPlatePadX,
    y: wordmarkY + (wordmarkHeight - wordmarkPlateHeight) / 2,
    width: accentRight - accentLeft + wordmarkPlatePadX * 2,
    height: wordmarkPlateHeight,
  };

  const badgeFont = 12;
  const badgePadX = 8;
  const badgePadY = 4;
  const badgeGap = 12;
  const badgeHeight = badgeFont * 1.4 + badgePadY * 2 + 4;
  const badgeY = wordmarkY + wordmarkHeight + rowGap;

  ctx.font = `${badgeFont}px 'Press Start 2P', monospace`;
  let badgeX = marginX;
  const badges = BADGE_DEFS.map(({ text, variant }) => {
    const width = ctx.measureText(text).width + badgePadX * 2;
    const layout: ObjectLayout = {
      text,
      variant,
      x: badgeX,
      y: badgeY,
      width,
      height: badgeHeight,
    };
    badgeX += width + badgeGap;
    return layout;
  });

  const buttonFont = 14;
  const buttonPadX = 24;
  const buttonGap = 12;
  const buttonHeight = 42;
  const buttonY = badgeY + badgeHeight + rowGap;

  ctx.font = `700 ${buttonFont}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  let buttonX = marginX;
  const buttons = BUTTON_DEFS.map(({ text, variant }) => {
    const tracking = buttonFont * 0.16;
    const width =
      measureTrackedText(ctx, text, tracking) +
      buttonPadX * 2 +
      4 +
      BUTTON_ICON_SIZE +
      BUTTON_ICON_GAP;
    const layout: ObjectLayout = {
      text,
      variant,
      x: buttonX,
      y: buttonY,
      width,
      height: buttonHeight,
    };
    buttonX += width + buttonGap;
    return layout;
  });

  return { tagline, wordmarkPlate, wordmark, badges, buttons };
}

/**
 * Creates a body that starts dynamic (so `restitution`/`mass` apply
 * normally), then pins it static. `Body.setStatic` caches these as the
 * "original" values and restores them when a hit later flips the body back
 * to dynamic — setting them in this order is what makes that restore work.
 */
export function createPinnedBody(
  layout: ObjectLayout,
  mass: number,
): Matter.Body {
  const body = Bodies.rectangle(
    layout.x + layout.width / 2,
    layout.y + layout.height / 2,
    layout.width,
    layout.height,
    {
      friction: OBJECT_FRICTION,
      frictionStatic: OBJECT_FRICTION_STATIC,
      restitution: OBJECT_RESTITUTION,
    },
  );
  Body.setMass(body, mass);
  Body.setStatic(body, true);
  return body;
}

export function createInteractiveObject(
  layout: ObjectLayout,
  kind: InteractiveObject['kind'],
  mass: number,
  options: {
    destructible?: boolean;
    shielded?: boolean;
    bracket?: boolean;
  } = {},
): InteractiveObject {
  const maxHealth = SLAM_DAMAGE;
  return {
    body: createPinnedBody(layout, mass),
    kind,
    variant: layout.variant,
    label: layout.text,
    width: layout.width,
    height: layout.height,
    state: 'pinned',
    destructible: options.destructible ?? true,
    shielded: options.shielded ?? false,
    bracket: options.bracket ?? false,
    health: maxHealth,
    maxHealth,
    hitAt: 0,
    hitCount: 0,
    lastBumpAt: 0,
  };
}

export function getAccentColor(
  variant: ObjectVariant,
  palette: Palette,
): string {
  switch (variant) {
    case 'amber':
    case 'secondary':
      return palette.accentAmber;
    case 'magenta':
      return palette.accentMagenta;
    default:
      return palette.glow;
  }
}

/** Duration of one flicker beat (one "on" or "off" half-cycle) in ms. */
const FLICKER_INTERVAL_MS = 70;
/** Caps how many on/off blinks a single hit's flicker plays. */
const MAX_FLICKER_BLINKS = 3;
/** Overlay alpha once a `fallen` object has settled — the "lights are out" look. */
const POWERED_DOWN_OVERLAY_ALPHA = 0.7;
/** Overlay alpha during a flicker's "off" beat — the light cutting out briefly. */
const FLICKER_OFF_OVERLAY_ALPHA = 0.92;

/**
 * Drives the "lights flickering, then going dark" damage feedback: each hit
 * plays `hitCount` on/off blinks (capped), then `damaged` objects return to
 * normal while `fallen` objects stay dark — replacing the old crack overlay.
 */
function getPowerOverlayAlpha(
  state: ObjectState,
  hitAge: number,
  hitCount: number,
): number {
  if (state !== 'damaged' && state !== 'fallen') return 0;

  const blinks = Math.min(Math.max(1, hitCount), MAX_FLICKER_BLINKS);
  const totalCycles = blinks * 2;
  const cycle = Math.floor(hitAge / FLICKER_INTERVAL_MS);

  if (hitAge >= 0 && cycle < totalCycles) {
    return cycle % 2 === 1 ? FLICKER_OFF_OVERLAY_ALPHA : 0;
  }

  return state === 'fallen' ? POWERED_DOWN_OVERLAY_ALPHA : 0;
}

/** Dark overlay used for the flicker/powered-down damage feedback. */
function drawPowerOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha: number,
  daytime: boolean,
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = daytime ? alpha * 0.62 : alpha;
  ctx.fillStyle = daytime ? '#e7f4fa' : '#0a0a12';
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.restore();
}

function drawHitFlash(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
  daytime: boolean,
  amount: number,
) {
  if (amount <= 0) return;

  ctx.save();
  ctx.globalAlpha = 0.12 + amount * 0.32;
  ctx.fillStyle = daytime ? '#fff4b8' : palette.glow;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.globalAlpha = 0.35 + amount * 0.45;
  ctx.strokeStyle = daytime ? palette.accentAmber : palette.accentMagenta;
  ctx.lineWidth = Math.max(1, Math.min(width, height) * 0.08);
  ctx.strokeRect(
    -width / 2 + ctx.lineWidth / 2,
    -height / 2 + ctx.lineWidth / 2,
    width - ctx.lineWidth,
    height - ctx.lineWidth,
  );
  ctx.restore();
}

/**
 * Draws a CTA button or badge at its physics body's current position/angle.
 * `damaged` objects jitter briefly and flicker; `fallen` objects render the
 * same way but follow the body's rotation as they tumble, then settle dark.
 */
export function drawInteractiveObject(
  ctx: CanvasRenderingContext2D,
  obj: InteractiveObject,
  palette: Palette,
  daytime: boolean,
  cell: number,
  now: number,
) {
  const { body, width, height, variant, label, state, hitAt } = obj;
  const { y } = body.position;
  let { x } = body.position;
  const hitAge = now - hitAt;
  const recentlyHit = hitAge >= 0 && hitAge < DAMAGE_SHAKE_MS;
  const hitFlash =
    recentlyHit && state !== 'fallen' ? 1 - hitAge / DAMAGE_SHAKE_MS : 0;
  const overlayAlpha = getPowerOverlayAlpha(state, hitAge, obj.hitCount);

  if (recentlyHit && state !== 'fallen') {
    const decay = 1 - hitAge / DAMAGE_SHAKE_MS;
    x += Math.sin(hitAge * 0.09) * cell * 0.15 * decay;
  }

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(body.angle);

  if (obj.kind === 'wordmarkPlate') {
    if (state === 'offline') {
      const offlineAge = now - hitAt;
      const settling = Math.min(1, Math.max(0, offlineAge / 520));
      const flicker =
        offlineAge < 420 && Math.floor(offlineAge / 70) % 2 === 0 ? 0.18 : 0;

      ctx.globalAlpha = 0.24 + flicker * (1 - settling);
      ctx.fillStyle = daytime ? '#6b7280' : '#9ca3af';
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.globalAlpha = 0.32;
      ctx.strokeStyle = daytime ? '#4b5563' : '#d1d5db';
      ctx.lineWidth = Math.max(1, Math.round(cell * 0.08));
      ctx.strokeRect(
        -width / 2 + ctx.lineWidth / 2,
        -height / 2 + ctx.lineWidth / 2,
        width - ctx.lineWidth,
        height - ctx.lineWidth,
      );
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }

    const pulse = state === 'damaged' ? 0.65 + Math.sin(now * 0.035) * 0.25 : 1;
    ctx.globalAlpha = pulse;
    ctx.fillStyle =
      state === 'damaged' && Math.floor((now - hitAt) / 85) % 2 === 0
        ? '#ffffff'
        : palette.glow;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    ctx.globalAlpha = 1;
    drawHitFlash(ctx, width, height, palette, daytime, hitFlash);
    ctx.restore();
    return;
  }

  if (obj.kind === 'wordmark') {
    const fontSize = 72;
    ctx.font = `${fontSize}px 'VT323', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (variant === 'wordmarkAccent') {
      ctx.fillStyle = palette.frame;
    } else {
      ctx.fillStyle = daytime ? '#1a2030' : '#f4efe6';
    }
    ctx.fillText(label, 0, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return;
  }

  if (obj.kind === 'tagline') {
    const fontSize = 14;
    ctx.font = `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = daytime ? '#0d7a32' : '#8fe39a';
    ctx.fillText(label, 0, 0);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
    return;
  }

  let textColor: string;
  if (obj.kind === 'button' && variant === 'primary') {
    ctx.fillStyle = palette.glow;
    ctx.fillRect(-width / 2, -height / 2, width, height);
    textColor = palette.frame;
  } else {
    const accent = getAccentColor(variant, palette);
    if (daytime) {
      ctx.fillStyle = hexToRgba(palette.frame, 0.8);
      ctx.fillRect(-width / 2, -height / 2, width, height);
    }
    const lineWidth = Math.max(1, Math.round(cell * 0.12));
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = accent;
    ctx.strokeRect(
      -width / 2 + lineWidth / 2,
      -height / 2 + lineWidth / 2,
      width - lineWidth,
      height - lineWidth,
    );
    textColor = accent;
  }
  ctx.fillStyle = textColor;

  const fontSize = obj.kind === 'button' ? 14 : 12;
  ctx.font =
    obj.kind === 'button'
      ? `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`
      : `${fontSize}px 'Press Start 2P', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (obj.kind === 'button') {
    const tracking = fontSize * 0.16;
    const textWidth = measureTrackedText(ctx, label, tracking);
    const groupWidth = BUTTON_ICON_SIZE + BUTTON_ICON_GAP + textWidth;
    const iconCenterX = -groupWidth / 2 + BUTTON_ICON_SIZE / 2;
    const textCenterX = groupWidth / 2 - textWidth / 2;

    ctx.save();
    ctx.translate(iconCenterX, 0);
    if (variant === 'primary') {
      drawDiscordIcon(ctx, BUTTON_ICON_SIZE, textColor);
    } else {
      drawFacebookIcon(ctx, BUTTON_ICON_SIZE, textColor);
    }
    ctx.restore();

    drawTrackedText(ctx, label, textCenterX, 0, tracking);
  } else {
    ctx.fillText(label, 0, 0);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  drawHitFlash(ctx, width, height, palette, daytime, hitFlash);
  drawPowerOverlay(ctx, width, height, overlayAlpha, daytime);

  ctx.restore();
}

export function drawTaglineSeparators(
  ctx: CanvasRenderingContext2D,
  objects: InteractiveObject[],
  daytime: boolean,
) {
  const chunks = objects.filter((obj) => obj.kind === 'tagline');
  if (chunks.length < 2) return;

  ctx.save();
  const fontSize = 14;
  ctx.font = `700 ${fontSize}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = daytime ? '#0d7a32' : '#8fe39a';

  for (let i = 0; i < chunks.length - 1; i++) {
    const left = chunks[i];
    const right = chunks[i + 1];
    const bothStillAnchored =
      (left.state === 'pinned' || left.state === 'damaged') &&
      (right.state === 'pinned' || right.state === 'damaged');
    if (!bothStillAnchored) continue;

    const x =
      left.body.position.x +
      left.width / 2 +
      (right.body.position.x -
        right.width / 2 -
        (left.body.position.x + left.width / 2)) /
        2;
    const y = (left.body.position.y + right.body.position.y) / 2;
    ctx.fillText('|', x, y);
  }

  ctx.restore();
}
