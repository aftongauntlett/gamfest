import { CONFETTI_COLORS } from './constants';

interface FireworkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  age: number;
  color: string;
  size: number;
}

export interface FireworkBurst {
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  launchedAt: number;
  explodeAt: number;
  particles: FireworkParticle[];
  exploded: boolean;
  color: string;
}

export interface FireworkShow {
  bursts: FireworkBurst[];
  nextLaunchAt: number;
}

const FIREWORK_COLORS = [
  ...CONFETTI_COLORS,
  '#fff27a',
  '#7afff2',
  '#ff7ad9',
] as const;

const LAUNCH_MS = 560;

export function createFireworkShow(): FireworkShow {
  return {
    bursts: [],
    nextLaunchAt: 0,
  };
}

function pickColor(indexOffset = 0) {
  return FIREWORK_COLORS[
    (Math.floor(Math.random() * FIREWORK_COLORS.length) + indexOffset) %
      FIREWORK_COLORS.length
  ];
}

function spawnFirework(width: number, height: number, now: number) {
  const targetX = width * (0.14 + Math.random() * 0.72);
  const targetY = height * (0.12 + Math.random() * 0.5);
  const startX = targetX + (Math.random() - 0.5) * width * 0.16;
  const startY = height * (0.9 + Math.random() * 0.18);
  const color = pickColor();
  const particleCount = 18 + Math.floor(Math.random() * 12);
  const particles = Array.from({ length: particleCount }, (_, index) => {
    const angle =
      (index / particleCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.24;
    const speed = 0.9 + Math.random() * 2.4;
    return {
      x: targetX,
      y: targetY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 720 + Math.random() * 520,
      age: 0,
      color: pickColor(index % 3),
      size: 2 + Math.random() * 3,
    };
  });

  return {
    startX,
    startY,
    targetX,
    targetY,
    launchedAt: now,
    explodeAt: now + LAUNCH_MS * (0.82 + Math.random() * 0.28),
    particles,
    exploded: false,
    color,
  };
}

function drawLaunchStreak(
  ctx: CanvasRenderingContext2D,
  burst: FireworkBurst,
  now: number,
) {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (now - burst.launchedAt) / (burst.explodeAt - burst.launchedAt),
    ),
  );
  const eased = 1 - (1 - progress) ** 2;
  const x = burst.startX + (burst.targetX - burst.startX) * eased;
  const y = burst.startY + (burst.targetY - burst.startY) * eased;
  const tailX =
    burst.startX + (burst.targetX - burst.startX) * Math.max(0, eased - 0.08);
  const tailY =
    burst.startY + (burst.targetY - burst.startY) * Math.max(0, eased - 0.08);

  ctx.save();
  ctx.globalAlpha = 0.45 + progress * 0.45;
  ctx.strokeStyle = burst.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x - 2, y - 2, 4, 4);
  ctx.restore();
}

function drawBurstParticles(
  ctx: CanvasRenderingContext2D,
  burst: FireworkBurst,
  deltaMs: number,
) {
  for (const particle of burst.particles) {
    particle.age += deltaMs;
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.018;
    const alpha = Math.max(0, 1 - particle.age / particle.life);
    if (alpha <= 0) continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = particle.color;
    ctx.fillRect(
      particle.x - particle.size / 2,
      particle.y - particle.size / 2,
      particle.size,
      particle.size,
    );
    ctx.globalAlpha = alpha * 0.38;
    ctx.fillRect(
      particle.x - particle.vx * 2,
      particle.y - particle.vy * 2,
      particle.size,
      particle.size,
    );
    ctx.restore();
  }
}

export function updateAndDrawFireworks(
  ctx: CanvasRenderingContext2D,
  show: FireworkShow,
  width: number,
  height: number,
  now: number,
  deltaMs: number,
) {
  if (show.nextLaunchAt === 0 || now >= show.nextLaunchAt) {
    show.bursts.push(spawnFirework(width, height, now));
    show.nextLaunchAt = now + 520 + Math.random() * 760;
  }

  for (const burst of show.bursts) {
    if (now < burst.explodeAt) {
      drawLaunchStreak(ctx, burst, now);
      continue;
    }
    burst.exploded = true;
    drawBurstParticles(ctx, burst, deltaMs);
  }

  show.bursts = show.bursts.filter(
    (burst) =>
      !burst.exploded ||
      burst.particles.some((particle) => particle.age < particle.life),
  );
}
