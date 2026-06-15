export const TARGET_FPS = 24;
export const FRAME_DURATION = 1000 / TARGET_FPS;
export const SPRITE_SIZE = 32;
export const ITEM_SPRITE_SIZE = 32;

// --- Hero mini-game tuning (Phase 1: core platformer) -----------------

/** Ground line as a fraction of canvas height — shared by background art and physics. */
export const HERO_BASELINE_RATIO = 0.85;
/** Physics steps run at a fixed 60Hz regardless of render FPS. */
export const FIXED_PHYSICS_DT = 1000 / 60;
/** Velocity is in px per physics step at 60Hz, so 2 ≈ 120px/s. */
export const PLAYER_WALK_SPEED = 2;
export const PLAYER_RUN_SPEED = 4;
/** Tuned so an unassisted jump reaches the brick-wall ledge, but not the hero text tier. */
export const PLAYER_JUMP_VELOCITY = 10.8;
export const PLAYER_DOUBLE_JUMP_VELOCITY = 12.4;
export const PLAYER_SLAM_VELOCITY = 18;
export const SLAM_IMPACT_MIN_VELOCITY = 10;
/** Low player friction keeps airborne side contacts from turning into sticky wall slides. */
export const PLAYER_FRICTION = 0.05;
export const PLAYER_FRICTION_STATIC = 0.02;
/** Platforms and settled debris can stay grippy without making the player cling to walls. */
export const SURFACE_FRICTION = 0.8;
export const SURFACE_FRICTION_STATIC = 0.5;
export const OBJECT_FRICTION = 0.55;
export const OBJECT_FRICTION_STATIC = 0.35;
export const WALK_PUSH_FORCE = 0.006;
export const RUN_PUSH_FORCE = 0.018;
export const LANDING_SQUASH_MS = 80;
export const SPAWN_DROP_CELLS = 8;
/** Player spawns near the left edge of the canvas, not dead-center. */
export const PLAYER_SPAWN_X_CELLS = 4;
export const BRICK_LEDGE_THICKNESS_CELLS = 0.7;
export const WALK_BOB_PERIOD_MS = 220;
export const IDLE_SWAY_PERIOD_MS = 600;
export const PROMPT_BLINK_MS = 600;
export const BILLBOARD_GLITCH_MS = 600;
export const BILLBOARD_DELETE_MS_PER_CHAR = 40;
export const BILLBOARD_TYPE_MS_PER_CHAR = 60;
export const BILLBOARD_HIT_COOLDOWN_MS = 900;
export const BILLBOARD_STUN_MS = 2400;
export const CAMERA_SHIFT_CELLS = 5;
/** Player's top edge (bounds.min.y) above this many cells triggers the shift back down. */
export const CAMERA_SHIFT_DOWN_TRIGGER_CELLS = 2;
/** Per-frame lerp factor for the camera follow easing. */
export const CAMERA_FOLLOW_EASE = 0.12;
export const FEEDBACK_MS = 1450;

// --- Hero mini-game tuning (Phase 2: interactive objects) --------------

/** Moderate bounce for buttons/badges/letters once they fall. */
export const OBJECT_RESTITUTION = 0.3;
/** How long the "damaged" shake/crack animation plays after a hit. */
export const DAMAGE_SHAKE_MS = 300;
/** Slam impact damage: one full normal-object health bar. */
export const SLAM_DAMAGE = 5;
/** Jump-bump damage from below: roughly one fifth of a slam. */
export const BUMP_DAMAGE = 1;
/** Minimum time between bump hits on the same object, so one jump arc doesn't multi-hit. */
export const BUMP_HIT_COOLDOWN_MS = 180;
/** Broken clouds reform quickly so slam-through feels temporary, not punitive. */
export const CLOUD_REPAIR_MS = 750;
/** Small spin imparted to objects when they start falling, so stacks tumble unevenly. */
export const FALL_ANGULAR_VELOCITY = 0.15;
/** Buttons are heavier than badges — both relative to player mass. */
export const BUTTON_MASS_MULTIPLIER = 4;
export const BADGE_MASS_MULTIPLIER = 1;

// --- Hero mini-game tuning (Phase 3: bracket shield & finale) ----------

/** Bracket letters wobble left/right for this long before falling. */
export const BRACKET_WOBBLE_MS = 400;
/** Peak rotation (radians) during the bracket wobble. */
export const BRACKET_WOBBLE_AMPLITUDE = 0.14;
/** Number of full left/right cycles during the wobble window. */
export const BRACKET_WOBBLE_CYCLES = 2;
/** Confetti pieces spawned once the finale triggers. */
export const CONFETTI_COUNT = 60;
export const CONFETTI_COLORS = [
  '#39ff14',
  '#ffb347',
  '#ff4fd8',
  '#4db5ff',
  '#ff4d5d',
  '#f4efe6',
] as const;
export const FINALE_TEXT = 'GAM[FEST] CLEARED!';
