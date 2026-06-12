import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  drawBackground,
  drawScanlines,
  drawStars,
  getStreetLevels,
} from './heroGame/background';
import {
  BADGE_MASS_MULTIPLIER,
  BILLBOARD_DELETE_MS_PER_CHAR,
  BILLBOARD_GLITCH_MS,
  BILLBOARD_HIT_COOLDOWN_MS,
  BILLBOARD_TYPE_MS_PER_CHAR,
  BRACKET_WOBBLE_AMPLITUDE,
  BRACKET_WOBBLE_CYCLES,
  BRACKET_WOBBLE_MS,
  BRICK_LEDGE_THICKNESS_CELLS,
  BUMP_DAMAGE,
  BUMP_HIT_COOLDOWN_MS,
  BUTTON_MASS_MULTIPLIER,
  CAMERA_FOLLOW_EASE,
  CAMERA_SHIFT_CELLS,
  CAMERA_SHIFT_DOWN_TRIGGER_CELLS,
  FALL_ANGULAR_VELOCITY,
  FEEDBACK_MS,
  FINALE_TEXT,
  FIXED_PHYSICS_DT,
  FRAME_DURATION,
  HERO_BASELINE_RATIO,
  LANDING_SQUASH_MS,
  PLAYER_DOUBLE_JUMP_VELOCITY,
  PLAYER_FRICTION,
  PLAYER_FRICTION_STATIC,
  PLAYER_JUMP_VELOCITY,
  PLAYER_RUN_SPEED,
  PLAYER_SLAM_VELOCITY,
  PLAYER_SPAWN_X_CELLS,
  PLAYER_WALK_SPEED,
  RUN_PUSH_FORCE,
  SLAM_DAMAGE,
  SLAM_IMPACT_MIN_VELOCITY,
  SPAWN_DROP_CELLS,
  SURFACE_FRICTION,
  SURFACE_FRICTION_STATIC,
  WALK_PUSH_FORCE,
} from './heroGame/constants';
import {
  BILLBOARD_MESSAGES,
  drawClickToPlayPrompt,
  drawBillboardHelp,
  FACE_FRAMES,
  getBillboardGeometry,
  getBillboardHelpButtonBounds,
  getHelpCloseButtonBounds,
  getHelpMusicToggleBounds,
  getHelpSongSelectorBounds,
  getHelpVolumeBarBounds,
} from './heroGame/billboard';
import { getHeroAudio } from './heroGame/audio';
import {
  BRACKET_CHARS,
  BRACKET_SHIELDED_CHARS,
  computeHeroLayout,
  createInteractiveObject,
  drawInteractiveObject,
  drawTaglineSeparators,
  type InteractiveObject,
} from './heroGame/interactiveObjects';
import { getPalette, isESTDaytime } from './heroGame/palette';
import {
  drawConfetti,
  drawFeedback,
  drawRingPickup,
  spawnConfetti,
  type ConfettiPiece,
  type FloatingFeedback,
} from './heroGame/pickupsAndFx';
import {
  breakCloudPlatform,
  createCloudPlatform,
  drawCloudPlatform,
  dropThroughCloudPlatform,
  findCloudPlatform,
  updateCloudPlatform,
  type CloudPlatform,
} from './heroGame/clouds';
import {
  drawSprite,
  pickRandomSprite,
  RING_SPRITES,
  type SpriteInfo,
} from './heroGame/sprites';

const { Engine, Bodies, Body, Composite, Events } = Matter;

type GameState = 'passive' | 'active';

export default function HeroGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<SpriteInfo | null>(null);
  const itemSheetRef = useRef<HTMLImageElement | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      itemSheetRef.current = img;
    };
    img.src = '/sprites/items.png';

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
    const heroContentEl = heroEl?.querySelector<HTMLElement>('.hero__content');

    let daytime = isESTDaytime();
    let palette = getPalette(daytime);
    document.documentElement.dataset.heroTime = daytime ? 'day' : 'night';
    const audio = getHeroAudio();

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
    let inputRun = false;
    let canJump = false;
    let hasDoubleJump = false;
    let hasSlam = false;
    let doubleJumpAvailable = false;
    let isSlamming = false;
    let squashUntil = 0;
    let playerLevel: 'sidewalk' | 'road' = 'sidewalk';
    let roadDropPx = 0;
    let sidewalkRestY = 0;
    let brickLedgeDropUntil = 0;
    let brickLedgeRemoved = false;

    let engine: Matter.Engine | null = null;
    let playerBody: Matter.Body | null = null;
    let sidewalkGround: Matter.Body | null = null;
    let roadGround: Matter.Body | null = null;
    let brickLedge: Matter.Body | null = null;
    let elevatedLedge: Matter.Body | null = null;
    let cloudPlatforms: CloudPlatform[] = [];
    let billboardTop: Matter.Body | null = null;
    let billboardHitbox: Matter.Body | null = null;
    let blueRing: Matter.Body | null = null;
    let redRing: Matter.Body | null = null;
    let blueRingCollected = false;
    let redRingCollected = false;
    let cameraOffsetY = 0;
    let cameraTarget = 0;
    let floatingFeedbacks: FloatingFeedback[] = [];
    let interactiveObjects: InteractiveObject[] = [];
    const supportContacts = new Set<number>();
    const objectsById = new Map<number, InteractiveObject>();
    let billboardHitCount = 0;
    let billboardPhase: 'idle' | 'transition' = 'idle';
    let billboardPhaseStartedAt = 0;
    let billboardCurrentText = BILLBOARD_MESSAGES[0];
    let billboardPreviousText = BILLBOARD_MESSAGES[0];
    let billboardTargetText = BILLBOARD_MESSAGES[0];
    let billboardFaceFrame = 0;
    let billboardHelpOpen = false;
    let billboardScreenBroken = false;
    let lastBillboardHitAt = -Infinity;
    let billboardScrambleUntil = 0;
    let billboardTypedChars = 0;
    let doubleJumpHintAt = Infinity;
    let finaleTriggered = false;
    let finaleStartedAt = 0;
    let confetti: ConfettiPiece[] = [];
    let helpOpenedAt = 0;

    const cellOf = (h: number) => Math.max(3, Math.floor(h / 28));
    const BILLBOARD_HIT_SCRAMBLE_MS = 240;
    const DOUBLE_JUMP_HINT_DELAY_MS = 2800;
    const BILLBOARD_DOUBLE_JUMP_MESSAGE = 1;
    const BILLBOARD_ARROW_MESSAGE = 2;
    const BILLBOARD_SLAM_MESSAGE = 3;
    const BRICK_LEDGE_DROP_MS = 360;
    const CLOUD_DROP_THROUGH_MS = 700;
    const WORDMARK_PLATE_UNLOCK_DELAY_MS = 420;
    const testSpawn = new URLSearchParams(window.location.search).get(
      'heroSpawn',
    );

    const addFeedback = (
      text: string,
      tone: FloatingFeedback['tone'],
      yOffset = 0,
    ) => {
      floatingFeedbacks.push({
        text,
        tone,
        startedAt: performance.now(),
        yOffset,
      });
    };

    /**
     * Continuous follow camera: shifts down to reveal the sky once the
     * player climbs above the wordmark/tagline tier, and shifts back up to
     * the street view once they drop back toward the badges/buttons/ground.
     * Hysteresis (two thresholds) keeps it from flickering near the boundary.
     */
    const updateCameraOffset = (cell: number) => {
      if (!playerBody) return;
      const skyFollowTrigger = elevatedLedge
        ? elevatedLedge.bounds.max.y + cell * 8
        : 0;
      const playerTop = playerBody.bounds.min.y;
      const playerNearSkyRoute =
        playerTop < skyFollowTrigger ||
        (elevatedLedge &&
          playerBody.position.y < elevatedLedge.bounds.max.y + cell * 4);
      if (playerNearSkyRoute) {
        const minimumSkyShift = cell * CAMERA_SHIFT_CELLS;
        const headroomShift = cell * 2.8 - playerTop;
        const highestCloudTop =
          cloudPlatforms.length > 0
            ? Math.min(
                ...cloudPlatforms.map((cloud) => cloud.body.bounds.min.y),
              )
            : playerTop;
        const skyRouteMaxShift = Math.max(
          minimumSkyShift,
          -highestCloudTop + cell * 6,
        );
        cameraTarget = Math.min(
          skyRouteMaxShift,
          Math.max(minimumSkyShift, headroomShift),
        );
      } else if (playerTop > cell * CAMERA_SHIFT_DOWN_TRIGGER_CELLS) {
        cameraTarget = 0;
      }
      cameraOffsetY += (cameraTarget - cameraOffsetY) * CAMERA_FOLLOW_EASE;
      if (Math.abs(cameraTarget - cameraOffsetY) < 0.5) {
        cameraOffsetY = cameraTarget;
      }
    };

    const getBillboardRenderOptions = (now: number) => {
      if (billboardPhase === 'idle') {
        const glitching = now < billboardScrambleUntil;
        return {
          message: billboardCurrentText,
          glitching,
          noiseSeed: now,
          showControls: state === 'active',
          helpOpen: billboardHelpOpen,
          screenBroken: billboardScreenBroken,
          faceFrame: glitching ? 2 : billboardFaceFrame,
          volume: audio.getVolume(),
          musicMuted: audio.isMusicMuted(),
          musicTrackIndex: audio.getMusicTrackIndex(),
          musicTrackCount: audio.getMusicTrackCount(),
        };
      }

      const t = now - billboardPhaseStartedAt;
      const deletingAt = Math.max(0, t - BILLBOARD_GLITCH_MS);
      const deleteChars = Math.min(
        billboardPreviousText.length,
        Math.floor(deletingAt / BILLBOARD_DELETE_MS_PER_CHAR),
      );
      const typingAt =
        deletingAt -
        billboardPreviousText.length * BILLBOARD_DELETE_MS_PER_CHAR;
      const typeChars = Math.max(
        0,
        Math.min(
          billboardTargetText.length,
          Math.floor(typingAt / BILLBOARD_TYPE_MS_PER_CHAR),
        ),
      );
      if (typeChars > billboardTypedChars) {
        billboardTypedChars = typeChars;
        audio.playSfx('billboardTalk');
      }
      const message =
        deleteChars < billboardPreviousText.length
          ? billboardPreviousText.slice(
              0,
              billboardPreviousText.length - deleteChars,
            )
          : billboardTargetText.slice(0, typeChars);

      if (
        deleteChars >= billboardPreviousText.length &&
        typeChars >= billboardTargetText.length
      ) {
        billboardPhase = 'idle';
        billboardCurrentText = billboardTargetText;
        billboardFaceFrame =
          billboardHitCount >= BILLBOARD_MESSAGES.length - 1
            ? 2
            : billboardHitCount % FACE_FRAMES.length;
      }

      return {
        message,
        glitching: t < BILLBOARD_GLITCH_MS,
        noiseSeed: now,
        showControls: state === 'active',
        helpOpen: billboardHelpOpen,
        screenBroken: billboardScreenBroken,
        faceFrame:
          t < BILLBOARD_GLITCH_MS
            ? 2
            : billboardHitCount >= BILLBOARD_MESSAGES.length - 1
              ? 2
              : billboardHitCount % FACE_FRAMES.length,
        volume: audio.getVolume(),
        musicMuted: audio.isMusicMuted(),
        musicTrackIndex: audio.getMusicTrackIndex(),
        musicTrackCount: audio.getMusicTrackCount(),
      };
    };

    const drawHelpOverlay = () => {
      const cell = cellOf(height);
      const billboard = getBillboardGeometry(width, cell);

      ctx.save();
      ctx.fillStyle = daytime ? 'rgba(8, 18, 28, 0.42)' : 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      drawBillboardHelp(
        ctx,
        billboard.bbX,
        billboard.bbY + cameraOffsetY,
        billboard.bbWidth,
        billboard.bbHeight,
        cell,
        {
          frame: palette.frame,
          screen: palette.screen,
          glow: palette.glow,
          facePixel: palette.facePixel,
        },
        !daytime,
        audio.getVolume(),
        audio.isMusicMuted(),
        audio.getMusicTrackIndex(),
        audio.getMusicTrackCount(),
      );
    };

    const triggerBillboardHit = (now: number) => {
      if (now - lastBillboardHitAt < BILLBOARD_HIT_COOLDOWN_MS) return;
      lastBillboardHitAt = now;

      if (!hasDoubleJump || !hasSlam) {
        billboardScrambleUntil = now + BILLBOARD_HIT_SCRAMBLE_MS;
        audio.playSfx('billboardGlitch');
        return;
      }

      if (billboardHitCount >= BILLBOARD_MESSAGES.length - 1) return;

      billboardHitCount += 1;
      billboardPreviousText = billboardCurrentText;
      billboardTargetText = BILLBOARD_MESSAGES[billboardHitCount];
      billboardPhase = 'transition';
      billboardPhaseStartedAt = now;
      billboardFaceFrame = 2;
      billboardTypedChars = 0;
      audio.playSfx('billboardGlitch');
    };

    const showBillboardMessage = (messageIndex: number, now: number) => {
      if (
        billboardHitCount === messageIndex &&
        billboardCurrentText === BILLBOARD_MESSAGES[messageIndex]
      ) {
        return;
      }

      billboardHitCount = messageIndex;
      billboardPreviousText = billboardCurrentText;
      billboardTargetText = BILLBOARD_MESSAGES[messageIndex];
      billboardPhase = 'transition';
      billboardPhaseStartedAt = now;
      billboardFaceFrame = 2;
      billboardScrambleUntil = 0;
      billboardTypedChars = 0;
      audio.playSfx('billboardGlitch');
    };

    const updateBillboardTimedHints = (now: number) => {
      if (
        hasDoubleJump &&
        !hasSlam &&
        now >= doubleJumpHintAt &&
        billboardHitCount < BILLBOARD_ARROW_MESSAGE
      ) {
        showBillboardMessage(BILLBOARD_ARROW_MESSAGE, now);
        doubleJumpHintAt = Infinity;
      }
    };

    const drawPassiveFrame = () => {
      const cell = cellOf(height);
      drawBackground(ctx, width, height, palette, elapsed, daytime, false);
      drawScanlines(ctx, width, height, palette.scanline);
      if (!prefersReducedMotion) {
        drawClickToPlayPrompt(ctx, width, cell, elapsed, palette);
      }
    };

    const drawActiveFrame = (now: number) => {
      const cell = cellOf(height);
      if (!billboardHelpOpen) {
        updateCameraOffset(cell);
        updateBillboardTimedHints(now);
      }
      if (cameraOffsetY > 0) {
        ctx.fillStyle = palette.sky;
        ctx.fillRect(0, 0, width, height);
        if (!daytime) drawStars(ctx, width, height, elapsed);
      }
      ctx.save();
      if (cameraOffsetY > 0) ctx.translate(0, cameraOffsetY);
      drawBackground(
        ctx,
        width,
        height,
        palette,
        elapsed,
        daytime,
        true,
        getBillboardRenderOptions(now),
      );
      for (const cloud of cloudPlatforms) {
        drawCloudPlatform(ctx, cloud, cell, daytime, now);
      }
      for (const obj of interactiveObjects) {
        drawInteractiveObject(ctx, obj, palette, daytime, cell, now);
      }
      drawTaglineSeparators(ctx, interactiveObjects, daytime);
      if (blueRing) {
        drawRingPickup(
          ctx,
          blueRing,
          cell,
          '#4db5ff',
          daytime,
          blueRingCollected,
          itemSheetRef.current,
          RING_SPRITES.blue,
        );
      }
      if (redRing) {
        drawRingPickup(
          ctx,
          redRing,
          cell,
          '#ff8a3d',
          daytime,
          redRingCollected,
          itemSheetRef.current,
          RING_SPRITES.red,
        );
      }
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
      ctx.restore();
      floatingFeedbacks = floatingFeedbacks.filter(
        (feedback) => now - feedback.startedAt < FEEDBACK_MS,
      );
      drawFeedback(ctx, floatingFeedbacks, width, height, cell, now);
      drawConfetti(ctx, confetti, width, height);
      drawFinaleBanner(now);
      if (billboardHelpOpen) drawHelpOverlay();
      drawScanlines(ctx, width, height, palette.scanline);
    };

    const stepPhysics = (dt: number) => {
      if (!engine || !playerBody || billboardHelpOpen) return;
      const speed = inputRun ? PLAYER_RUN_SPEED : PLAYER_WALK_SPEED;
      const vx = inputRight === inputLeft ? 0 : inputRight ? speed : -speed;
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

      updateBrickLedgeCollision();
      updateCloudPlatforms(performance.now());
      updateWobblingObjects(performance.now());
      updateUndersideBumps(performance.now());
      Engine.update(engine, dt);
    };

    const updateCloudPlatforms = (now: number) => {
      if (!engine || !playerBody) return;
      const cell = cellOf(height);
      for (const cloud of cloudPlatforms) {
        updateCloudPlatform(cloud, engine, playerBody, now, cell);
        if (cloud.body.isSensor) supportContacts.delete(cloud.body.id);
      }
      canJump = supportContacts.size > 0;
    };

    const updateBrickLedgeCollision = () => {
      if (!playerBody || !brickLedge || !engine) return;

      const droppingThrough = performance.now() < brickLedgeDropUntil;

      if (brickLedgeRemoved) {
        if (droppingThrough) return;
        Composite.add(engine.world, brickLedge);
        brickLedgeRemoved = false;
      }

      const cell = cellOf(height);
      const horizontallyNear =
        playerBody.bounds.max.x > brickLedge.bounds.min.x - cell &&
        playerBody.bounds.min.x < brickLedge.bounds.max.x + cell;
      const landingFromAbove =
        !droppingThrough &&
        horizontallyNear &&
        playerBody.position.y < brickLedge.position.y &&
        playerBody.velocity.y >= -0.5;

      brickLedge.isSensor = horizontallyNear && !landingFromAbove;
    };

    const isPlayerOnBrickLedge = () => {
      if (!playerBody || !brickLedge) return false;

      const cell = cellOf(height);
      const horizontallyOverlapping =
        playerBody.bounds.max.x > brickLedge.bounds.min.x + cell * 0.15 &&
        playerBody.bounds.min.x < brickLedge.bounds.max.x - cell * 0.15;
      const bodyAboveLedge = playerBody.position.y < brickLedge.position.y;

      return (
        horizontallyOverlapping &&
        bodyAboveLedge &&
        playerBody.velocity.y >= -0.5
      );
    };

    const getPlayerCloudSupport = () => {
      if (!playerBody) return null;

      const body = playerBody;
      const cell = cellOf(height);
      return (
        cloudPlatforms.find((cloud) => {
          if (cloud.body.isSensor) return false;
          const horizontallyOverlapping =
            body.bounds.max.x > cloud.body.bounds.min.x + cell * 0.15 &&
            body.bounds.min.x < cloud.body.bounds.max.x - cell * 0.15;
          const bodyAboveCloud = body.position.y < cloud.body.position.y;

          return (
            horizontallyOverlapping && bodyAboveCloud && body.velocity.y >= -0.5
          );
        }) ?? null
      );
    };

    const getWordmarkPlate = () =>
      interactiveObjects.find((obj) => obj.kind === 'wordmarkPlate') ?? null;

    const areWordmarkLettersUnlocked = (now: number) => {
      const plate = getWordmarkPlate();
      return (
        plate?.state === 'offline' &&
        now - plate.hitAt >= WORDMARK_PLATE_UNLOCK_DELAY_MS
      );
    };

    const isSupportBody = (body: Matter.Body) =>
      body === sidewalkGround ||
      body === roadGround ||
      (body === brickLedge && !body.isSensor) ||
      (findCloudPlatform(cloudPlatforms, body) !== null && !body.isSensor) ||
      body === billboardTop ||
      (objectsById.has(body.id) && !body.isSensor);

    const getPlayerSupportBody = (pair: Matter.Pair) => {
      if (!playerBody) return null;
      const other =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      if (!other || !isSupportBody(other)) return null;

      const playerBottom = playerBody.bounds.max.y;
      const supportTop = other.bounds.min.y;
      const topContactSlop = Math.max(8, cellOf(height) * 0.9);
      const playerIsAboveSupportCenter =
        playerBody.position.y < other.position.y ||
        other === sidewalkGround ||
        other === roadGround;

      if (
        playerIsAboveSupportCenter &&
        playerBottom <= supportTop + topContactSlop
      ) {
        return other;
      }

      return null;
    };

    const addSupportContact = (pair: Matter.Pair, now: number) => {
      const support = getPlayerSupportBody(pair);
      if (!support) return;
      if (!canJump && playerBody && playerBody.velocity.y >= -0.5) {
        squashUntil = now + LANDING_SQUASH_MS;
      }
      supportContacts.add(support.id);
      canJump = true;
      doubleJumpAvailable = hasDoubleJump;
      const cloudSupport = findCloudPlatform(cloudPlatforms, support);
      const playerVelocityY = playerBody?.velocity.y ?? 0;
      if (!cloudSupport || playerVelocityY < SLAM_IMPACT_MIN_VELOCITY) {
        isSlamming = false;
      }
      const supportObj = objectsById.get(support.id);

      // Once the neon plate is off and its letters have fallen, landing on a
      // bracket starts its wobble-then-fall.
      if (
        supportObj?.bracket &&
        supportObj.state === 'pinned' &&
        areWordmarkLettersUnlocked(now) &&
        areShieldedLettersCleared()
      ) {
        supportObj.state = 'wobbling';
        supportObj.hitAt = now;
      }
    };

    const removeSupportContact = (pair: Matter.Pair) => {
      if (!playerBody) return;
      const other =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      if (!other || !isSupportBody(other)) return;
      supportContacts.delete(other.id);
      canJump = supportContacts.size > 0;
    };

    const areShieldedLettersCleared = () =>
      interactiveObjects
        .filter((obj) => obj.shielded)
        .every((obj) => obj.state === 'fallen');

    /**
     * PRD "crumble every button, badge, wordmark letter, and tagline chunk
     * off the screen, triggering a celebratory finale": each object counts
     * as cleared the moment it lands in `fallen` (settled debris), so the
     * finale fires as soon as the last of the 18 required objects crumbles.
     */
    const checkFinale = (now: number) => {
      if (finaleTriggered) return;
      const required = interactiveObjects.filter(
        (obj) =>
          obj.kind === 'button' ||
          obj.kind === 'badge' ||
          obj.kind === 'wordmark' ||
          obj.kind === 'tagline',
      );
      if (
        required.length === 0 ||
        !required.every((obj) => obj.state === 'fallen')
      ) {
        return;
      }
      finaleTriggered = true;
      finaleStartedAt = now;
      confetti = spawnConfetti(width, height);
    };

    /** Pulsing "cleared" banner that fades in and stays for the rest of the run. */
    const drawFinaleBanner = (now: number) => {
      if (!finaleTriggered) return;
      const cell = cellOf(height);
      const fadeIn = Math.min(1, (now - finaleStartedAt) / 400);
      const pulse = 0.85 + Math.sin(now * 0.005) * 0.15;
      ctx.save();
      ctx.globalAlpha = fadeIn * pulse;
      ctx.font = `${Math.max(14, Math.floor(cell * 1.1))}px 'Press Start 2P', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = palette.glow;
      ctx.fillText(FINALE_TEXT, width / 2, cell * 3);
      ctx.restore();
    };

    /** Bracket letters oscillate briefly, then become dynamic and fall. */
    const updateWobblingObjects = (now: number) => {
      for (const obj of interactiveObjects) {
        if (obj.state !== 'wobbling') continue;
        const t = now - obj.hitAt;
        if (t < BRACKET_WOBBLE_MS) {
          const wobble =
            Math.sin(
              (t / BRACKET_WOBBLE_MS) * Math.PI * 2 * BRACKET_WOBBLE_CYCLES,
            ) * BRACKET_WOBBLE_AMPLITUDE;
          Body.setAngle(obj.body, wobble);
          continue;
        }
        Body.setAngle(obj.body, 0);
        obj.state = 'fallen';
        obj.hitAt = now;
        Body.setStatic(obj.body, false);
        Body.setVelocity(obj.body, { x: (Math.random() - 0.5) * 4, y: 1 });
        Body.setAngularVelocity(
          obj.body,
          (Math.random() - 0.5) * FALL_ANGULAR_VELOCITY * 2,
        );
        checkFinale(now);
      }
    };

    const crumbleObject = (
      obj: InteractiveObject,
      playerVelocityY: number,
      now: number,
    ) => {
      if (obj.kind === 'wordmarkPlate') {
        obj.state = 'offline';
        obj.hitAt = now;
        obj.destructible = false;
        obj.body.isSensor = true;
        supportContacts.delete(obj.body.id);
        canJump = supportContacts.size > 0;
        return;
      }

      obj.state = 'fallen';
      obj.hitAt = now;
      Body.setStatic(obj.body, false);
      Body.setVelocity(obj.body, {
        x: (Math.random() - 0.5) * 5,
        y: Math.max(2, playerVelocityY * 0.35),
      });
      Body.setAngularVelocity(
        obj.body,
        (Math.random() - 0.5) * FALL_ANGULAR_VELOCITY * 2.5,
      );
      checkFinale(now);
    };

    const damageObject = (
      obj: InteractiveObject,
      damage: number,
      playerVelocityY: number,
      now: number,
    ) => {
      obj.health = Math.max(0, obj.health - damage);
      obj.hitAt = now;
      obj.hitCount += 1;
      audio.playSfx(damage >= SLAM_DAMAGE ? 'hitHeavy' : 'hit');

      if (obj.health <= 0) {
        crumbleObject(obj, playerVelocityY, now);
        return;
      }

      if (obj.health < obj.maxHealth) {
        obj.state = 'damaged';
      }
    };

    /**
     * Underside bumps are checked every physics step (not just on
     * `collisionStart`) so a jump-into-underside hit always registers,
     * regardless of which exact step Matter's broad/narrow-phase first
     * reports contact on. `playerBody.velocity.y < 0` (any upward motion)
     * plus the geometry checks below identify "is this a bump right now";
     * `lastBumpAt`/`BUMP_HIT_COOLDOWN_MS` stop one jump arc from applying
     * damage on every step while overlapping — though in practice the bonk
     * impulse below sends the player back downward on the very next step,
     * making `velocity.y < 0` false before the cooldown would even matter.
     */
    const updateUndersideBumps = (now: number) => {
      if (!playerBody || playerBody.velocity.y >= 0) return;

      const cell = cellOf(height);
      const playerTop = playerBody.bounds.min.y;
      const undersideSlop = Math.max(6, cell * 0.65);

      for (const obj of interactiveObjects) {
        if (!obj.destructible) continue;
        if (obj.state !== 'pinned' && obj.state !== 'damaged') continue;
        if (
          obj.kind === 'wordmark' &&
          (obj.shielded || obj.bracket) &&
          !areWordmarkLettersUnlocked(now)
        ) {
          continue;
        }

        const target = obj.body;
        const horizontalOverlap =
          target.bounds.max.x > playerBody.bounds.min.x + cell * 0.12 &&
          target.bounds.min.x < playerBody.bounds.max.x - cell * 0.12;
        if (!horizontalOverlap) continue;

        const targetBottom = target.bounds.max.y;
        const undersideContact =
          targetBottom >= playerTop - undersideSlop &&
          targetBottom <= playerTop + undersideSlop;
        if (!undersideContact || playerBody.position.y <= target.position.y) {
          continue;
        }

        if (now - obj.lastBumpAt < BUMP_HIT_COOLDOWN_MS) continue;

        obj.lastBumpAt = now;
        damageObject(obj, BUMP_DAMAGE, playerBody.velocity.y, now);
        Body.setVelocity(playerBody, {
          x: playerBody.velocity.x,
          y: Math.max(playerBody.velocity.y, 2),
        });
      }
    };

    /**
     * Slam impacts are the only collision-event-driven object damage left —
     * a deliberate one-shot downward action. Passive "jumped into the
     * underside" damage is handled per-step by `updateUndersideBumps`
     * instead, since relying on the single `collisionStart` step proved
     * unreliable (see docs/milestone-5-cont.md).
     *
     * `playerVelocityY` is a snapshot taken once per collision step (see
     * `handleCollisionStart`), not a live read of `playerBody.velocity.y`,
     * so an earlier pair's `Body.setVelocity` response in the same step
     * can't mask a later pair's slam.
     */
    const handleObjectImpact = (
      impactor: Matter.Body,
      target: Matter.Body,
      now: number,
      playerVelocityY: number,
    ) => {
      const obj = objectsById.get(target.id);
      if (
        !obj ||
        !obj.destructible ||
        obj.state === 'offline' ||
        obj.state === 'fallen' ||
        obj.state === 'wobbling' ||
        impactor !== playerBody ||
        !playerBody
      ) {
        return;
      }

      if (
        obj.kind === 'wordmark' &&
        (obj.shielded || obj.bracket) &&
        !areWordmarkLettersUnlocked(now)
      ) {
        return;
      }

      if (isSlamming && playerVelocityY >= SLAM_IMPACT_MIN_VELOCITY) {
        damageObject(obj, SLAM_DAMAGE, playerVelocityY, now);
        Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
        isSlamming = false;
      }
    };

    const handleCloudImpact = (
      impactor: Matter.Body,
      target: Matter.Body,
      now: number,
      playerVelocityY: number,
    ) => {
      if (impactor !== playerBody || !playerBody) return;
      const cloud = findCloudPlatform(cloudPlatforms, target);
      if (!cloud) return;
      if (!isSlamming || playerVelocityY < SLAM_IMPACT_MIN_VELOCITY) return;

      breakCloudPlatform(cloud, now);
      supportContacts.delete(cloud.body.id);
      canJump = supportContacts.size > 0;
      Body.setVelocity(playerBody, {
        x: playerBody.velocity.x,
        y: Math.max(playerVelocityY, PLAYER_SLAM_VELOCITY * 0.75),
      });
      audio.playSfx('hitHeavy');
    };

    const handleFallenObjectSidePush = (pair: Matter.Pair) => {
      if (!playerBody) return;
      const target =
        pair.bodyA === playerBody
          ? pair.bodyB
          : pair.bodyB === playerBody
            ? pair.bodyA
            : null;
      if (!target || target.isStatic) return;

      const obj = objectsById.get(target.id);
      if (!obj || obj.state !== 'fallen') return;

      const verticalOverlap =
        Math.min(playerBody.bounds.max.y, target.bounds.max.y) -
        Math.max(playerBody.bounds.min.y, target.bounds.min.y);
      const horizontalOverlap =
        Math.min(playerBody.bounds.max.x, target.bounds.max.x) -
        Math.max(playerBody.bounds.min.x, target.bounds.min.x);
      const playerHeight = playerBody.bounds.max.y - playerBody.bounds.min.y;
      const targetHeight = target.bounds.max.y - target.bounds.min.y;
      const sideContact =
        verticalOverlap > Math.min(playerHeight, targetHeight) * 0.28 &&
        horizontalOverlap > 0 &&
        horizontalOverlap < verticalOverlap * 0.9;
      if (!sideContact) return;

      const velocityDirection =
        Math.abs(playerBody.velocity.x) > 0.2
          ? Math.sign(playerBody.velocity.x)
          : 0;
      const direction =
        velocityDirection ||
        (target.position.x >= playerBody.position.x ? 1 : -1);
      const speedRatio = Math.min(
        1,
        Math.abs(playerBody.velocity.x) / PLAYER_RUN_SPEED,
      );
      const runBoost = inputRun || speedRatio > 0.75;
      const force = (runBoost ? RUN_PUSH_FORCE : WALK_PUSH_FORCE) * target.mass;

      Body.applyForce(target, target.position, {
        x: direction * force,
        y: -force * 0.12,
      });
      Body.setAngularVelocity(
        target,
        target.angularVelocity + direction * (runBoost ? 0.08 : 0.035),
      );
    };

    const handleRingPickup = (pair: Matter.Pair) => {
      if (!playerBody) return;
      const bodies = [pair.bodyA, pair.bodyB];
      if (
        blueRing &&
        !blueRingCollected &&
        bodies.includes(playerBody) &&
        bodies.includes(blueRing)
      ) {
        blueRingCollected = true;
        hasDoubleJump = true;
        doubleJumpAvailable = true;
        addFeedback('+ Double Jump', 'good');
        audio.playSfx('pickup');
        showBillboardMessage(BILLBOARD_DOUBLE_JUMP_MESSAGE, performance.now());
        doubleJumpHintAt = performance.now() + DOUBLE_JUMP_HINT_DELAY_MS;
      }
      if (
        redRing &&
        !redRingCollected &&
        bodies.includes(playerBody) &&
        bodies.includes(redRing)
      ) {
        redRingCollected = true;
        hasSlam = true;
        addFeedback('+ Slam', 'good', cellOf(height) * 1.15);
        audio.playSfx('pickup');
        doubleJumpHintAt = Infinity;
        showBillboardMessage(BILLBOARD_SLAM_MESSAGE, performance.now());
      }
    };

    const handleBillboardImpact = (
      pair: Matter.Pair,
      now: number,
      playerVelocityY: number,
    ) => {
      if (!playerBody || !billboardHitbox) return;
      const hitBillboard =
        (pair.bodyA === playerBody && pair.bodyB === billboardHitbox) ||
        (pair.bodyB === playerBody && pair.bodyA === billboardHitbox);
      if (!hitBillboard) return;

      if (
        isSlamming &&
        playerVelocityY >= SLAM_IMPACT_MIN_VELOCITY &&
        !billboardScreenBroken
      ) {
        billboardScreenBroken = true;
        billboardPhase = 'idle';
        billboardCurrentText = '';
        billboardTargetText = '';
        billboardFaceFrame = 2;
        billboardHelpOpen = false;
        helpOpenedAt = 0;
        Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
        isSlamming = false;
        audio.playSfx('hitHeavy');
        return;
      }

      const cell = cellOf(height);
      const billboard = getBillboardGeometry(width, cell);
      const fromBrickLedge =
        playerBody.position.y > billboard.bbY + billboard.bbHeight * 0.35 &&
        playerBody.position.y < billboard.brickTop + cell * 2;
      if (fromBrickLedge) triggerBillboardHit(now);
    };

    const handleCollisionStart = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      const now = performance.now();
      // Snapshot once: a single step can produce multiple collision pairs,
      // and per-pair handlers below call `Body.setVelocity` on the player as
      // an impact response. Reading `playerBody.velocity.y` live would let an
      // earlier pair's response mask a later pair's impact in this same step.
      const playerVelocityY = playerBody?.velocity.y ?? 0;
      for (const pair of event.pairs) {
        addSupportContact(pair, now);
        handleBillboardImpact(pair, now, playerVelocityY);
        handleRingPickup(pair);
        handleFallenObjectSidePush(pair);
        handleCloudImpact(pair.bodyA, pair.bodyB, now, playerVelocityY);
        handleCloudImpact(pair.bodyB, pair.bodyA, now, playerVelocityY);
        handleObjectImpact(pair.bodyA, pair.bodyB, now, playerVelocityY);
        handleObjectImpact(pair.bodyB, pair.bodyA, now, playerVelocityY);
      }
    };

    const handleCollisionActive = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      const now = performance.now();
      for (const pair of event.pairs) addSupportContact(pair, now);
    };

    const handleCollisionEnd = (
      event: Matter.IEventCollision<Matter.Engine>,
    ) => {
      for (const pair of event.pairs) {
        removeSupportContact(pair);
      }
    };

    const deactivate = () => {
      if (state !== 'active') return;
      state = 'passive';
      heroEl?.removeAttribute('data-game-active');
      heroContentEl?.removeAttribute('inert');
      heroContentEl?.removeAttribute('aria-hidden');
      audio.stopMusic();

      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Events.off(engine, 'collisionActive', handleCollisionActive);
        Events.off(engine, 'collisionEnd', handleCollisionEnd);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }
      engine = null;
      playerBody = null;
      sidewalkGround = null;
      roadGround = null;
      brickLedge = null;
      elevatedLedge = null;
      cloudPlatforms = [];
      billboardTop = null;
      billboardHitbox = null;
      blueRing = null;
      redRing = null;
      blueRingCollected = false;
      redRingCollected = false;
      hasDoubleJump = false;
      hasSlam = false;
      doubleJumpAvailable = false;
      isSlamming = false;
      cameraOffsetY = 0;
      cameraTarget = 0;
      brickLedgeDropUntil = 0;
      brickLedgeRemoved = false;
      floatingFeedbacks = [];
      interactiveObjects = [];
      supportContacts.clear();
      objectsById.clear();
      billboardHitCount = 0;
      billboardPhase = 'idle';
      billboardPhaseStartedAt = 0;
      billboardCurrentText = BILLBOARD_MESSAGES[0];
      billboardPreviousText = BILLBOARD_MESSAGES[0];
      billboardTargetText = BILLBOARD_MESSAGES[0];
      billboardFaceFrame = 0;
      billboardHelpOpen = false;
      helpOpenedAt = 0;
      billboardScreenBroken = false;
      lastBillboardHitAt = -Infinity;
      billboardScrambleUntil = 0;
      billboardTypedChars = 0;
      doubleJumpHintAt = Infinity;
      finaleTriggered = false;
      finaleStartedAt = 0;
      confetti = [];
      playerLevel = 'sidewalk';

      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('pointerdown', onDocumentPointerDown);

      inputLeft = false;
      inputRight = false;
      inputRun = false;
      drawPassiveFrame();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (billboardHelpOpen) {
        switch (event.key) {
          case 'Escape':
            event.preventDefault();
            if (!event.repeat) closeBillboardHelp(performance.now());
            break;
          case 'ArrowLeft':
          case 'a':
          case 'A':
            event.preventDefault();
            if (!event.repeat) audio.changeMusicTrack(-1);
            break;
          case 'ArrowRight':
          case 'd':
          case 'D':
            event.preventDefault();
            if (!event.repeat) audio.changeMusicTrack(1);
            break;
          case 'Shift':
          case ' ':
          case 'e':
          case 'E':
          case 'ArrowDown':
          case 's':
          case 'S':
          case 'ArrowUp':
          case 'w':
          case 'W':
          case 'r':
          case 'R':
            event.preventDefault();
            break;
          default:
            break;
        }
        return;
      }

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
          if (!event.repeat && playerBody) {
            if (canJump) {
              Body.setVelocity(playerBody, {
                x: playerBody.velocity.x,
                y: -PLAYER_JUMP_VELOCITY,
              });
              bumpObjectsAbovePlayer();
              supportContacts.clear();
              canJump = false;
              doubleJumpAvailable = hasDoubleJump;
              isSlamming = false;
              audio.playSfx('jump');
            } else if (hasDoubleJump && doubleJumpAvailable) {
              Body.setVelocity(playerBody, {
                x: playerBody.velocity.x,
                y: -PLAYER_DOUBLE_JUMP_VELOCITY,
              });
              doubleJumpAvailable = false;
              audio.playSfx('doubleJump');
            }
          }
          break;
        case 'e':
        case 'E':
          event.preventDefault();
          if (
            !event.repeat &&
            playerBody &&
            hasSlam &&
            !isSlamming &&
            !canJump
          ) {
            Body.setVelocity(playerBody, {
              x: playerBody.velocity.x,
              y: PLAYER_SLAM_VELOCITY,
            });
            isSlamming = true;
            audio.playSfx('slam');
          }
          break;
        case 'Shift':
          event.preventDefault();
          inputRun = true;
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          event.preventDefault();
          if (!event.repeat && playerBody) {
            const cloud = getPlayerCloudSupport();
            if (cloud) {
              const now = performance.now();
              dropThroughCloudPlatform(cloud, now, CLOUD_DROP_THROUGH_MS);
              supportContacts.delete(cloud.body.id);
              canJump = supportContacts.size > 0;
              Body.setVelocity(playerBody, {
                x: playerBody.velocity.x,
                y: Math.max(playerBody.velocity.y, 4),
              });
              audio.playSfx('hopDown');
              break;
            }
          }
          if (
            !event.repeat &&
            playerBody &&
            brickLedge &&
            engine &&
            isPlayerOnBrickLedge()
          ) {
            brickLedgeDropUntil = performance.now() + BRICK_LEDGE_DROP_MS;
            Composite.remove(engine.world, brickLedge);
            brickLedgeRemoved = true;
            supportContacts.delete(brickLedge.id);
            canJump = supportContacts.size > 0;
            Body.setVelocity(playerBody, {
              x: playerBody.velocity.x,
              y: Math.max(playerBody.velocity.y, 4),
            });
            audio.playSfx('hopDown');
            break;
          }
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
            supportContacts.clear();
            supportContacts.add(roadGround.id);
            canJump = true;
            squashUntil = performance.now() + LANDING_SQUASH_MS;
            audio.playSfx('hopDown');
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
            supportContacts.clear();
            supportContacts.add(sidewalkGround.id);
            canJump = true;
            squashUntil = performance.now() + LANDING_SQUASH_MS;
            audio.playSfx('hopUp');
          }
          break;
        case 'Escape':
          if (!event.repeat) {
            deactivate();
          }
          break;
        case 'r':
        case 'R':
          event.preventDefault();
          if (!event.repeat) resetGame();
          break;
        default:
          break;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (billboardHelpOpen) return;
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
        case 'Shift':
          inputRun = false;
          break;
        default:
          break;
      }
    };

    const onDocumentPointerDown = (event: PointerEvent) => {
      if (event.target === canvas) return;
      // Don't exit the game when clicking the mute/day-night controls that
      // float over the canvas — only an actual outside-click should restore
      // the hero content.
      const target = event.target as HTMLElement | null;
      if (target?.closest('.hero-bottom-left-controls')) return;
      deactivate();
    };

    const bumpObjectsAbovePlayer = () => {
      if (!playerBody) return;
      const cell = cellOf(height);
      for (const obj of interactiveObjects) {
        if (obj.body.isStatic) continue;
        const horizontallyClose =
          obj.body.bounds.max.x > playerBody.bounds.min.x - cell * 0.4 &&
          obj.body.bounds.min.x < playerBody.bounds.max.x + cell * 0.4;
        const justAbove =
          obj.body.bounds.max.y >= playerBody.bounds.min.y - cell * 0.7 &&
          obj.body.position.y < playerBody.position.y;
        if (!horizontallyClose || !justAbove) continue;
        Body.applyForce(obj.body, obj.body.position, {
          x: (obj.body.position.x - playerBody.position.x) * 0.0007,
          y: -0.035 * obj.body.mass,
        });
        Body.setAngularVelocity(
          obj.body,
          (obj.body.position.x >= playerBody.position.x ? 1 : -1) * 0.08,
        );
      }
    };

    /**
     * Builds (or rebuilds) the Matter world and resets all run state. Used
     * both for the initial activation and for the `R` reset, which tears
     * down the existing engine first so crumbled objects, pickups, the
     * billboard, and the finale all return to their starting state.
     */
    const setupWorld = () => {
      if (engine) {
        Events.off(engine, 'collisionStart', handleCollisionStart);
        Events.off(engine, 'collisionActive', handleCollisionActive);
        Events.off(engine, 'collisionEnd', handleCollisionEnd);
        Composite.clear(engine.world, false);
        Engine.clear(engine);
      }

      const cell = cellOf(height);
      const baseline = height * HERO_BASELINE_RATIO;
      const groundThickness = cell * 2;
      const wallThickness = cell;
      const playerWidth = cell * 2;
      const playerHeight = cell * 4;
      const { roadDrop } = getStreetLevels(baseline, cell);
      const billboard = getBillboardGeometry(width, cell);
      const brickLedgeThickness = Math.max(
        4,
        cell * BRICK_LEDGE_THICKNESS_CELLS,
      );

      engine = Engine.create();

      sidewalkGround = Bodies.rectangle(
        width / 2,
        baseline + groundThickness / 2,
        width * 2,
        groundThickness,
        {
          isStatic: true,
          friction: SURFACE_FRICTION,
          frictionStatic: SURFACE_FRICTION_STATIC,
        },
      );
      roadGround = Bodies.rectangle(
        width / 2,
        baseline + roadDrop + groundThickness / 2,
        width * 2,
        groundThickness,
        {
          isStatic: true,
          friction: SURFACE_FRICTION,
          frictionStatic: SURFACE_FRICTION_STATIC,
        },
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
      brickLedge = Bodies.rectangle(
        billboard.brickX + billboard.brickWidth / 2,
        billboard.brickTop + brickLedgeThickness / 2,
        billboard.brickWidth,
        brickLedgeThickness,
        {
          isStatic: true,
          friction: SURFACE_FRICTION,
          frictionStatic: SURFACE_FRICTION_STATIC,
        },
      );
      const heroLayout = computeHeroLayout(ctx);
      const elevatedLedgeHeight = Math.max(5, cell * 0.8);
      const elevatedLedgeClearance = cell * 0.5;
      const elevatedCloud = createCloudPlatform(
        Math.max(cell * 15, width * 0.3),
        heroLayout.tagline[0].y -
          playerHeight -
          elevatedLedgeClearance -
          elevatedLedgeHeight / 2,
        cell * 13,
        elevatedLedgeHeight,
      );
      elevatedLedge = elevatedCloud.body;
      const clampCloudX = (x: number, cloudWidth: number) =>
        Math.max(
          cloudWidth / 2 + cell,
          Math.min(width - cloudWidth / 2 - cell, x),
        );
      const cloudHeight = elevatedLedgeHeight;
      const skyCloudSpecs = [
        {
          x: width * 0.58,
          y: elevatedLedge.position.y - cell * 7.2,
          w: cell * 10,
        },
        {
          x: width * 0.76,
          y: elevatedLedge.position.y - cell * 14.2,
          w: cell * 8.5,
        },
        {
          x: width * 0.42,
          y: elevatedLedge.position.y - cell * 21,
          w: cell * 10.5,
        },
        {
          x: width * 0.64,
          y: elevatedLedge.position.y - cell * 28.1,
          w: cell * 9.5,
        },
        {
          x: width * 0.3,
          y: elevatedLedge.position.y - cell * 35.2,
          w: cell * 10,
        },
        {
          x: width * 0.73,
          y: elevatedLedge.position.y - cell * 42,
          w: cell * 8.8,
        },
        {
          x: width * 0.47,
          y: elevatedLedge.position.y - cell * 49.3,
          w: cell * 9.8,
        },
        {
          x: width * 0.24,
          y: elevatedLedge.position.y - cell * 56.1,
          w: cell * 8.6,
        },
        {
          x: width * 0.58,
          y: elevatedLedge.position.y - cell * 63.2,
          w: cell * 10.4,
        },
      ];
      cloudPlatforms = [
        elevatedCloud,
        ...skyCloudSpecs.map((spec) =>
          createCloudPlatform(
            clampCloudX(spec.x, spec.w),
            spec.y,
            spec.w,
            cloudHeight,
          ),
        ),
      ];
      billboardTop = Bodies.rectangle(
        billboard.bbX + billboard.bbWidth / 2,
        billboard.bbY - billboard.frameWidth / 2,
        billboard.bbWidth + billboard.frameWidth * 2,
        Math.max(5, billboard.frameWidth),
        {
          isStatic: true,
          friction: SURFACE_FRICTION,
          frictionStatic: SURFACE_FRICTION_STATIC,
        },
      );
      billboardHitbox = Bodies.rectangle(
        billboard.bbX + billboard.bbWidth / 2,
        billboard.bbY + billboard.bbHeight / 2,
        billboard.bbWidth,
        billboard.bbHeight,
        {
          isStatic: true,
          isSensor: true,
          label: 'billboard-screen',
        },
      );
      blueRing = Bodies.circle(
        billboard.brickX + billboard.brickWidth - cell * 1.6,
        billboard.brickTop - cell * 1.1,
        Math.max(6, cell * 0.55),
        {
          isStatic: true,
          isSensor: true,
          label: 'blue-ring',
        },
      );
      redRing = Bodies.circle(
        elevatedLedge.position.x + cell * 4.5,
        elevatedLedge.position.y - cell * 1.1,
        Math.max(6, cell * 0.55),
        {
          isStatic: true,
          isSensor: true,
          label: 'red-ring',
        },
      );

      playerBody = Bodies.rectangle(
        cell * PLAYER_SPAWN_X_CELLS,
        baseline - playerHeight / 2 - cell * SPAWN_DROP_CELLS,
        playerWidth,
        playerHeight,
        { friction: PLAYER_FRICTION, frictionStatic: PLAYER_FRICTION_STATIC },
      );
      Body.setInertia(playerBody, Infinity);

      const playerMass = playerBody.mass;
      interactiveObjects = [
        ...heroLayout.tagline.map((layout) =>
          createInteractiveObject(layout, 'tagline', playerMass),
        ),
        createInteractiveObject(
          heroLayout.wordmarkPlate,
          'wordmarkPlate',
          playerMass * 2,
        ),
        ...heroLayout.wordmark.map((layout) =>
          createInteractiveObject(layout, 'wordmark', playerMass * 2, {
            destructible: !BRACKET_CHARS.has(layout.text),
            shielded: BRACKET_SHIELDED_CHARS.has(layout.text),
            bracket: BRACKET_CHARS.has(layout.text),
          }),
        ),
        ...heroLayout.badges.map((layout) =>
          createInteractiveObject(
            layout,
            'badge',
            playerMass * BADGE_MASS_MULTIPLIER,
          ),
        ),
        ...heroLayout.buttons.map((layout) =>
          createInteractiveObject(
            layout,
            'button',
            playerMass * BUTTON_MASS_MULTIPLIER,
          ),
        ),
      ];
      objectsById.clear();
      for (const obj of interactiveObjects) objectsById.set(obj.body.id, obj);

      Composite.add(engine.world, [
        sidewalkGround,
        leftWall,
        rightWall,
        brickLedge,
        ...cloudPlatforms.map((cloud) => cloud.body),
        billboardTop,
        billboardHitbox,
        blueRing,
        redRing,
        playerBody,
        ...interactiveObjects.map((obj) => obj.body),
      ]);
      Events.on(engine, 'collisionStart', handleCollisionStart);
      Events.on(engine, 'collisionActive', handleCollisionActive);
      Events.on(engine, 'collisionEnd', handleCollisionEnd);

      facing = 'right';
      inputLeft = false;
      inputRight = false;
      inputRun = false;
      canJump = false;
      hasDoubleJump = false;
      hasSlam = false;
      doubleJumpAvailable = false;
      isSlamming = false;
      blueRingCollected = false;
      redRingCollected = false;
      cameraOffsetY = 0;
      cameraTarget = 0;
      brickLedgeDropUntil = 0;
      brickLedgeRemoved = false;
      floatingFeedbacks = [];
      billboardHitCount = 0;
      billboardPhase = 'idle';
      billboardPhaseStartedAt = 0;
      billboardCurrentText = BILLBOARD_MESSAGES[0];
      billboardPreviousText = BILLBOARD_MESSAGES[0];
      billboardTargetText = BILLBOARD_MESSAGES[0];
      billboardFaceFrame = 0;
      billboardScreenBroken = false;
      lastBillboardHitAt = -Infinity;
      billboardScrambleUntil = 0;
      billboardTypedChars = 0;
      doubleJumpHintAt = Infinity;
      finaleTriggered = false;
      finaleStartedAt = 0;
      confetti = [];
      supportContacts.clear();
      playerLevel = 'sidewalk';
      roadDropPx = roadDrop;
      sidewalkRestY = baseline - playerHeight / 2;
      if (testSpawn === 'cloud' && playerBody) {
        const spawnCloud =
          cloudPlatforms[Math.min(4, cloudPlatforms.length - 1)] ??
          elevatedCloud;
        Body.setPosition(playerBody, {
          x: spawnCloud.body.position.x,
          y: spawnCloud.body.bounds.min.y - playerHeight / 2 - cell * 0.25,
        });
        Body.setVelocity(playerBody, { x: 0, y: 0 });
        hasDoubleJump = true;
        hasSlam = true;
        doubleJumpAvailable = true;
        blueRingCollected = true;
        redRingCollected = true;
        cameraTarget = Math.max(
          cell * CAMERA_SHIFT_CELLS,
          cell * 2.8 - playerBody.bounds.min.y,
        );
        cameraOffsetY = cameraTarget;
      }
      physicsAccumulator = 0;
      lastPhysicsTime = 0;
      squashUntil = 0;
      billboardHelpOpen = false;
      helpOpenedAt = 0;
    };

    const activate = () => {
      if (state === 'active' || prefersReducedMotion) return;
      state = 'active';
      heroEl?.setAttribute('data-game-active', 'true');
      heroContentEl?.setAttribute('inert', '');
      heroContentEl?.setAttribute('aria-hidden', 'true');

      setupWorld();
      audio.playMusic();

      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      document.addEventListener('pointerdown', onDocumentPointerDown);
    };

    /**
     * `R` (PRD "Resolved Design Decisions → Sprite Randomization"): rebuilds
     * the world with a freshly randomized sprite, undoing crumble/pickup/
     * billboard/finale progress without exiting the game.
     */
    const resetGame = () => {
      if (state !== 'active') return;
      pickRandomSprite()
        .then((s) => {
          spriteRef.current = s;
        })
        .catch(() => {
          // keep the current sprite on failure
        });
      setupWorld();
      audio.playSfx('respawn');
    };

    const openBillboardHelp = (now: number) => {
      if (billboardHelpOpen) return;
      billboardHelpOpen = true;
      helpOpenedAt = now;
      inputLeft = false;
      inputRight = false;
      inputRun = false;
      if (playerBody) {
        Body.setVelocity(playerBody, { x: 0, y: playerBody.velocity.y });
      }
    };

    const closeBillboardHelp = (now: number) => {
      if (!billboardHelpOpen) return;
      const pausedFor = Math.max(0, now - helpOpenedAt);
      billboardHelpOpen = false;
      helpOpenedAt = 0;

      if (billboardPhase === 'transition') {
        billboardPhaseStartedAt += pausedFor;
      }
      if (Number.isFinite(lastBillboardHitAt)) {
        lastBillboardHitAt += pausedFor;
      }
      if (Number.isFinite(doubleJumpHintAt)) {
        doubleJumpHintAt += pausedFor;
      }
    };

    const onCanvasClick = (event: MouseEvent) => {
      if (state === 'active') {
        const rect = canvas.getBoundingClientRect();
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - cameraOffsetY,
        };
        const cell = cellOf(height);
        const billboard = getBillboardGeometry(width, cell);

        if (!billboardHelpOpen) {
          const helpButton = getBillboardHelpButtonBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            cell,
          );
          if (
            point.x >= helpButton.x &&
            point.x <= helpButton.x + helpButton.size &&
            point.y >= helpButton.y &&
            point.y <= helpButton.y + helpButton.size
          ) {
            event.preventDefault();
            openBillboardHelp(performance.now());
          }
          return;
        }

        const closeButton = getHelpCloseButtonBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          billboard.bbHeight,
          cell,
        );
        if (
          point.x >= closeButton.x &&
          point.x <= closeButton.x + closeButton.size &&
          point.y >= closeButton.y &&
          point.y <= closeButton.y + closeButton.size
        ) {
          event.preventDefault();
          closeBillboardHelp(performance.now());
          return;
        }

        const volumeBar = getHelpVolumeBarBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          billboard.bbHeight,
          cell,
        );
        const segmentIndex = volumeBar.segments.findIndex(
          (segment) =>
            point.x >= segment.x &&
            point.x <= segment.x + segment.width &&
            point.y >= segment.y &&
            point.y <= segment.y + segment.height,
        );
        if (segmentIndex !== -1) {
          event.preventDefault();
          audio.setVolume((segmentIndex + 1) / volumeBar.segments.length);
          return;
        }

        const musicToggle = getHelpMusicToggleBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          billboard.bbHeight,
          cell,
        );
        if (
          point.x >= musicToggle.x &&
          point.x <= musicToggle.x + musicToggle.width &&
          point.y >= musicToggle.y &&
          point.y <= musicToggle.y + musicToggle.height
        ) {
          event.preventDefault();
          audio.toggleMusicMuted();
          return;
        }

        const songSelector = getHelpSongSelectorBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          billboard.bbHeight,
          cell,
          `< ${audio.getMusicTrackIndex() + 1}/${audio.getMusicTrackCount()} >`,
        );
        if (
          point.x >= songSelector.x &&
          point.x <= songSelector.x + songSelector.width &&
          point.y >= songSelector.y &&
          point.y <= songSelector.y + songSelector.height
        ) {
          event.preventDefault();
          const direction =
            point.x < songSelector.x + songSelector.width / 2 ? -1 : 1;
          audio.changeMusicTrack(direction);
        }
        return;
      }

      if (state === 'passive') {
        event.preventDefault();
        activate();
      }
    };

    const onCanvasPointerMove = (event: PointerEvent) => {
      if (state === 'active') {
        const rect = canvas.getBoundingClientRect();
        const point = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top - cameraOffsetY,
        };
        const cell = cellOf(height);
        const billboard = getBillboardGeometry(width, cell);

        let isInteractive = false;
        if (!billboardHelpOpen) {
          const helpButton = getBillboardHelpButtonBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            cell,
          );
          isInteractive =
            point.x >= helpButton.x &&
            point.x <= helpButton.x + helpButton.size &&
            point.y >= helpButton.y &&
            point.y <= helpButton.y + helpButton.size;
        } else {
          const closeButton = getHelpCloseButtonBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            billboard.bbHeight,
            cell,
          );
          const isCloseButton =
            point.x >= closeButton.x &&
            point.x <= closeButton.x + closeButton.size &&
            point.y >= closeButton.y &&
            point.y <= closeButton.y + closeButton.size;

          const volumeBar = getHelpVolumeBarBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            billboard.bbHeight,
            cell,
          );
          const isVolumeSegment = volumeBar.segments.some(
            (segment) =>
              point.x >= segment.x &&
              point.x <= segment.x + segment.width &&
              point.y >= segment.y &&
              point.y <= segment.y + segment.height,
          );

          const musicToggle = getHelpMusicToggleBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            billboard.bbHeight,
            cell,
          );
          const isMusicToggle =
            point.x >= musicToggle.x &&
            point.x <= musicToggle.x + musicToggle.width &&
            point.y >= musicToggle.y &&
            point.y <= musicToggle.y + musicToggle.height;

          const songSelector = getHelpSongSelectorBounds(
            billboard.bbX,
            billboard.bbY,
            billboard.bbWidth,
            billboard.bbHeight,
            cell,
            `< ${audio.getMusicTrackIndex() + 1}/${audio.getMusicTrackCount()} >`,
          );
          const isSongSelector =
            point.x >= songSelector.x &&
            point.x <= songSelector.x + songSelector.width &&
            point.y >= songSelector.y &&
            point.y <= songSelector.y + songSelector.height;

          isInteractive =
            isCloseButton || isVolumeSegment || isMusicToggle || isSongSelector;
        }

        canvas.style.cursor = isInteractive ? 'pointer' : '';
        return;
      }

      canvas.style.cursor = state === 'passive' ? 'pointer' : '';
    };

    const onHeroTimeChange = (event: Event) => {
      const next = (event as CustomEvent<{ heroTime?: string }>).detail
        ?.heroTime;
      daytime = next === 'day';
      palette = getPalette(daytime);
      document.documentElement.dataset.heroTime = daytime ? 'day' : 'night';
      if (state === 'passive') drawPassiveFrame();
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
    window.addEventListener('hero-time-change', onHeroTimeChange);

    if (prefersReducedMotion) {
      return () => {
        window.removeEventListener('resize', resize);
        window.removeEventListener('hero-time-change', onHeroTimeChange);
      };
    }

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('pointermove', onCanvasPointerMove);

    const tick = (time: number) => {
      frameId = requestAnimationFrame(tick);

      if (state === 'active' && engine && playerBody && !billboardHelpOpen) {
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
      if (!billboardHelpOpen) elapsed += drawDelta;

      if (state === 'active') {
        drawActiveFrame(billboardHelpOpen ? helpOpenedAt : time);
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
      window.removeEventListener('hero-time-change', onHeroTimeChange);
      canvas.removeEventListener('click', onCanvasClick);
      canvas.removeEventListener('pointermove', onCanvasPointerMove);
      deactivate();
    };
  }, [prefersReducedMotion]);

  return <canvas ref={canvasRef} className="hero-canvas" aria-hidden="true" />;
}
