import Matter from 'matter-js';
import {
  CLOUD_REPAIR_MS,
  SURFACE_FRICTION,
  SURFACE_FRICTION_STATIC,
} from './constants';
import { drawFlatCloudPlatform } from './pickupsAndFx';

const { Bodies, Body, Composite } = Matter;

export interface CloudPlatform {
  body: Matter.Body;
  brokenUntil: number;
  passthroughUntil: number;
  inWorld: boolean;
}

export function createCloudPlatform(
  x: number,
  y: number,
  width: number,
  height: number,
): CloudPlatform {
  return {
    body: Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      friction: SURFACE_FRICTION,
      frictionStatic: SURFACE_FRICTION_STATIC,
      label: 'cloud-platform',
    }),
    brokenUntil: 0,
    passthroughUntil: 0,
    inWorld: true,
  };
}

export function drawCloudPlatform(
  ctx: CanvasRenderingContext2D,
  cloud: CloudPlatform,
  cell: number,
  daytime: boolean,
  now: number,
) {
  drawFlatCloudPlatform(ctx, cloud.body, cell, daytime, now, cloud.brokenUntil);
}

export function breakCloudPlatform(cloud: CloudPlatform, now: number) {
  cloud.brokenUntil = now + CLOUD_REPAIR_MS;
  Body.set(cloud.body, 'isSensor', true);
}

export function dropThroughCloudPlatform(
  cloud: CloudPlatform,
  now: number,
  durationMs: number,
) {
  cloud.passthroughUntil = Math.max(cloud.passthroughUntil, now + durationMs);
  Body.set(cloud.body, 'isSensor', true);
}

export function updateCloudPlatform(
  cloud: CloudPlatform,
  engine: Matter.Engine,
  playerBody: Matter.Body,
  now: number,
  cell: number,
) {
  const temporarilyPassable =
    now < cloud.brokenUntil || now < cloud.passthroughUntil;
  if (temporarilyPassable) {
    Body.set(cloud.body, 'isSensor', true);
    if (cloud.inWorld) {
      Composite.remove(engine.world, cloud.body);
      cloud.inWorld = false;
    }
    return;
  }

  if (cloud.brokenUntil !== 0) {
    cloud.brokenUntil = 0;
  }
  if (cloud.passthroughUntil !== 0) {
    cloud.passthroughUntil = 0;
  }

  const horizontalOverlap =
    playerBody.bounds.max.x > cloud.body.bounds.min.x + cell * 0.15 &&
    playerBody.bounds.min.x < cloud.body.bounds.max.x - cell * 0.15;
  if (!horizontalOverlap) {
    Body.set(cloud.body, 'isSensor', false);
    if (!cloud.inWorld) {
      Composite.add(engine.world, cloud.body);
      cloud.inWorld = true;
    }
    return;
  }

  const playerSafelyAbove =
    playerBody.position.y < cloud.body.position.y &&
    playerBody.velocity.y >= -0.5;

  Body.set(cloud.body, 'isSensor', !playerSafelyAbove);
  if (!cloud.inWorld) {
    Composite.add(engine.world, cloud.body);
    cloud.inWorld = true;
  }
}

export function findCloudPlatform(clouds: CloudPlatform[], body: Matter.Body) {
  return clouds.find((cloud) => cloud.body === body) ?? null;
}
