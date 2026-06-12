import { useEffect, useRef } from 'react';
import Matter from 'matter-js';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';
import {
  drawBackground,
  drawScanlines,
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
  PLAYER_JUMP_VELOCITY,
  PLAYER_RUN_SPEED,
  PLAYER_SLAM_VELOCITY,
  PLAYER_SPAWN_X_CELLS,
  PLAYER_WALK_SPEED,
  SLAM_IMPACT_MIN_VELOCITY,
  SPAWN_DROP_CELLS,
} from './heroGame/constants';
import {
  BILLBOARD_MESSAGES,
  drawClickToPlayPrompt,
  FACE_FRAMES,
  getBillboardGeometry,
  getBillboardHelpButtonBounds,
} from './heroGame/billboard';
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
  drawElevatedLedge,
  drawFeedback,
  drawRingPickup,
  spawnConfetti,
  type ConfettiPiece,
  type FloatingFeedback,
} from './heroGame/pickupsAndFx';
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

    let engine: Matter.Engine | null = null;
    let playerBody: Matter.Body | null = null;
    let sidewalkGround: Matter.Body | null = null;
    let roadGround: Matter.Body | null = null;
    let brickLedge: Matter.Body | null = null;
    let elevatedLedge: Matter.Body | null = null;
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
    let finaleTriggered = false;
    let finaleStartedAt = 0;
    let confetti: ConfettiPiece[] = [];

    const cellOf = (h: number) => Math.max(3, Math.floor(h / 28));

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
      const playerTop = playerBody.bounds.min.y;
      if (playerTop < 0) {
        cameraTarget = cell * CAMERA_SHIFT_CELLS;
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
        return {
          message: billboardCurrentText,
          glitching: false,
          noiseSeed: now,
          showControls: state === 'active',
          helpOpen: billboardHelpOpen,
          screenBroken: billboardScreenBroken,
          faceFrame: billboardFaceFrame,
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
      };
    };

    const triggerBillboardHit = (now: number) => {
      if (billboardHitCount >= BILLBOARD_MESSAGES.length - 1) return;
      if (now - lastBillboardHitAt < BILLBOARD_HIT_COOLDOWN_MS) return;

      billboardHitCount += 1;
      billboardPreviousText = billboardCurrentText;
      billboardTargetText = BILLBOARD_MESSAGES[billboardHitCount];
      billboardPhase = 'transition';
      billboardPhaseStartedAt = now;
      lastBillboardHitAt = now;
      billboardFaceFrame = 2;
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
      updateCameraOffset(cell);
      if (cameraOffsetY > 0) {
        ctx.fillStyle = palette.sky;
        ctx.fillRect(0, 0, width, height);
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
      if (elevatedLedge) {
        drawElevatedLedge(ctx, elevatedLedge, cell, daytime);
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
      drawScanlines(ctx, width, height, palette.scanline);
    };

    const stepPhysics = (dt: number) => {
      if (!engine || !playerBody) return;
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

      updateWobblingObjects(performance.now());
      Engine.update(engine, dt);
    };

    const isSupportBody = (body: Matter.Body) =>
      body === sidewalkGround ||
      body === roadGround ||
      body === brickLedge ||
      body === elevatedLedge ||
      body === billboardTop ||
      objectsById.has(body.id);

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
      isSlamming = false;
      const supportObj = objectsById.get(support.id);

      // Bracket shield (PRD "Resolved Design Decisions → Bracket Shield"):
      // once all four shielded letters have crumbled, landing on top of a
      // bracket — and only landing on top — starts its wobble-then-fall.
      if (
        supportObj?.bracket &&
        supportObj.state === 'pinned' &&
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

    /**
     * Crumbles a target only when struck by a slam-speed player impact.
     * Ordinary walking, landing, and object cascades remain safe for the
     * climb route; the endgame destruction is deliberately ability-gated.
     */
    const handleObjectImpact = (
      impactor: Matter.Body,
      target: Matter.Body,
      now: number,
    ) => {
      const obj = objectsById.get(target.id);
      if (
        !obj ||
        !obj.destructible ||
        obj.state === 'fallen' ||
        obj.state === 'wobbling'
      ) {
        return;
      }

      const isPlayerImpact = impactor === playerBody;
      if (
        !isPlayerImpact ||
        !playerBody ||
        !isSlamming ||
        playerBody.velocity.y < SLAM_IMPACT_MIN_VELOCITY
      ) {
        return;
      }

      if (obj.kind === 'wordmarkPlate') {
        obj.state = 'fallen';
        obj.hitAt = now;
        if (engine) Composite.remove(engine.world, obj.body);
        objectsById.delete(obj.body.id);
        Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
        isSlamming = false;
        return;
      }

      // Bracket shield, first hit: crack the shield instead of crumbling.
      if (obj.shielded && obj.state === 'pinned') {
        obj.state = 'shielded';
        obj.hitAt = now;
        Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
        isSlamming = false;
        return;
      }

      obj.state = 'fallen';
      obj.hitAt = now;
      Body.setStatic(obj.body, false);
      Body.setVelocity(obj.body, {
        x: (Math.random() - 0.5) * 5,
        y: Math.max(2, playerBody.velocity.y * 0.35),
      });
      Body.setAngularVelocity(
        obj.body,
        (Math.random() - 0.5) * FALL_ANGULAR_VELOCITY * 2.5,
      );
      Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
      isSlamming = false;
      checkFinale(now);
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
      }
    };

    const handleBillboardImpact = (pair: Matter.Pair, now: number) => {
      if (!playerBody || !billboardHitbox) return;
      const hitBillboard =
        (pair.bodyA === playerBody && pair.bodyB === billboardHitbox) ||
        (pair.bodyB === playerBody && pair.bodyA === billboardHitbox);
      if (!hitBillboard) return;

      if (
        isSlamming &&
        playerBody.velocity.y >= SLAM_IMPACT_MIN_VELOCITY &&
        !billboardScreenBroken
      ) {
        billboardScreenBroken = true;
        billboardPhase = 'idle';
        billboardCurrentText = '';
        billboardTargetText = '';
        billboardFaceFrame = 2;
        billboardHelpOpen = false;
        Body.setVelocity(playerBody, { x: playerBody.velocity.x, y: -4 });
        isSlamming = false;
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
      for (const pair of event.pairs) {
        addSupportContact(pair, now);
        handleBillboardImpact(pair, now);
        handleRingPickup(pair);
        handleObjectImpact(pair.bodyA, pair.bodyB, now);
        handleObjectImpact(pair.bodyB, pair.bodyA, now);
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
      billboardScreenBroken = false;
      lastBillboardHitAt = -Infinity;
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
            } else if (hasDoubleJump && doubleJumpAvailable) {
              Body.setVelocity(playerBody, {
                x: playerBody.velocity.x,
                y: -PLAYER_DOUBLE_JUMP_VELOCITY,
              });
              doubleJumpAvailable = false;
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
          }
          break;
        case 'Escape':
          if (!event.repeat) deactivate();
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
      if (event.target !== canvas) deactivate();
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
      brickLedge = Bodies.rectangle(
        billboard.brickX + billboard.brickWidth / 2,
        billboard.brickTop + brickLedgeThickness / 2,
        billboard.brickWidth,
        brickLedgeThickness,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      const heroLayout = computeHeroLayout(ctx);
      const elevatedLedgeHeight = Math.max(5, cell * 0.8);
      const elevatedLedgeClearance = cell * 0.5;
      elevatedLedge = Bodies.rectangle(
        Math.max(cell * 15, width * 0.3),
        heroLayout.tagline[0].y -
          playerHeight -
          elevatedLedgeClearance -
          elevatedLedgeHeight / 2,
        cell * 13,
        elevatedLedgeHeight,
        { isStatic: true, friction: PLAYER_FRICTION },
      );
      billboardTop = Bodies.rectangle(
        billboard.bbX + billboard.bbWidth / 2,
        billboard.bbY - billboard.frameWidth / 2,
        billboard.bbWidth + billboard.frameWidth * 2,
        Math.max(5, billboard.frameWidth),
        { isStatic: true, friction: PLAYER_FRICTION },
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
        { friction: PLAYER_FRICTION },
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
        elevatedLedge,
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
      finaleTriggered = false;
      finaleStartedAt = 0;
      confetti = [];
      supportContacts.clear();
      playerLevel = 'sidewalk';
      roadDropPx = roadDrop;
      sidewalkRestY = baseline - playerHeight / 2;
      physicsAccumulator = 0;
      lastPhysicsTime = 0;
      squashUntil = 0;
      billboardHelpOpen = false;
    };

    const activate = () => {
      if (state === 'active' || prefersReducedMotion) return;
      state = 'active';
      heroEl?.setAttribute('data-game-active', 'true');
      heroContentEl?.setAttribute('inert', '');
      heroContentEl?.setAttribute('aria-hidden', 'true');

      setupWorld();

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
        const helpButton = getBillboardHelpButtonBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          cell,
        );
        const isHelpButton =
          point.x >= helpButton.x &&
          point.x <= helpButton.x + helpButton.size &&
          point.y >= helpButton.y &&
          point.y <= helpButton.y + helpButton.size;

        if (isHelpButton) {
          event.preventDefault();
          billboardHelpOpen = !billboardHelpOpen;
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
        const helpButton = getBillboardHelpButtonBounds(
          billboard.bbX,
          billboard.bbY,
          billboard.bbWidth,
          cell,
        );
        const isHelpButton =
          point.x >= helpButton.x &&
          point.x <= helpButton.x + helpButton.size &&
          point.y >= helpButton.y &&
          point.y <= helpButton.y + helpButton.size;
        canvas.style.cursor = isHelpButton ? 'pointer' : '';
        return;
      }

      canvas.style.cursor = state === 'passive' ? 'pointer' : '';
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
