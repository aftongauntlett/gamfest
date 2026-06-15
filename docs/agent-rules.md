# Agent Rules

Fast-orientation notes for an AI coding agent (or new developer) picking up GAM[fest].

## Site config & content

- [src/data/config.ts](../src/data/config.ts) — single source of truth for external links (Discord, Facebook, contact email, Formspree form URL, Google Maps URLs). Update links here, not inline in components.
- [src/styles/tokens.css](../src/styles/tokens.css) — design tokens (colors, spacing, type scale, radii). Components must consume these CSS custom properties; never hardcode hex codes or pixel values in component styles.
- Site copy (event details, lineup bios, FAQ text) lives directly in [src/sections/](../src/sections/) and [src/data/config.ts](../src/data/config.ts) — there is no separate source-copy doc.

## Hero mini-game — orientation

The hero canvas is a Canvas 2D scene with a [Matter.js](https://brm.io/matter-js/) physics world running headlessly behind the draw loop (no Three.js/WebGL).

- [src/components/motion/HeroGame.tsx](../src/components/motion/HeroGame.tsx) is the orchestrator (~2300 lines, the largest file in the repo: state, physics stepping, input, world setup/reset, render flow). The `src/components/motion/heroGame/*.ts` modules (see table in [HANDOFF.md](../HANDOFF.md)) split out render/data helpers — keep extending that split rather than growing `HeroGame.tsx` further.
- Controls: move `A/D/W/S`, jump `Space` (double-jump once unlocked), slam `E` (separate from jump, so double-jump and slam can stack), `R` reset/new sprite, `Esc` exit.
- Physics steps at a fixed 60Hz independent of the ~24fps render loop — don't couple these.
- `localStorage` only persists the audio mute preference; there is no other save state.
- Sprite sheets (`rogues`/`animals`/`monsters`) are single-frame-per-character — there's no walk-cycle; walking/idle motion is synthesized via sway/bob, not sprite animation. Sprites load from `public/sprites/*.png` via `heroGame/sprites.ts`.
- The `[fest]` wordmark plate has an interactive "offline" state, toggled via the underside bump mechanic below.

### Known gotchas — don't re-break these

- **Camera follow** must stay a continuous two-way lerp (`CAMERA_FOLLOW_EASE = 0.12` with hysteresis on the player body's `bounds.min.y`). A one-shot animation that never reverses will get the camera stuck on the sky view.
- **Matter.js friction footgun**: a collision pair's `friction` uses the _lower_ of the two bodies' values, but `frictionStatic` uses the _higher_. Player and surfaces use separate constants (`PLAYER_FRICTION`/`PLAYER_FRICTION_STATIC` low, `SURFACE_*`/`OBJECT_*` higher) — don't collapse these back into one shared value or surfaces get "sticky."
- **Underside-bump damage** runs every physics step via `updateUndersideBumps(now)`, gated on `velocity.y < 0` (any upward motion) plus `BUMP_HIT_COOLDOWN_MS = 180`. It must NOT be driven from `collisionStart` — one-shot collision events miss edge cases.
- **`setupWorld()`** is the single source of truth for world build/reset; both `activate()` and `resetGame()`/`R` call it. Any new game state (one of ~45 closure-scoped `let`s in `HeroGame.tsx`) must be wired into both the init path and the reset/`deactivate()` path.
- **Cloud platforms** (`heroGame/clouds.ts`) are one-way: sensors from below, solid when landed on from above, and slamming breaks them (`CLOUD_REPAIR_MS = 750`). The billboard top reuses this same mechanism for jump-through-from-below.
- **Activation hot-zone**: `.hero__content` sits above the canvas (`z-index 1` vs `0`) and only gets `pointer-events: none` once `data-game-active='true'`. Only the right ~42% of the canvas is actually clickable to start the game (the left ~58% is under the overlay). This is a known, accepted quirk — not a bug to fix — but it matters for Playwright clicks and `page.emulateMedia({ reducedMotion: 'no-preference' })` must be set before `goto()`.

## Accessibility & motion — non-negotiable

- WCAG AA contrast for all text/background pairs.
- Full keyboard nav with visible focus states; semantic HTML first, ARIA only for real gaps.
- Alt text on every image.
- `prefers-reduced-motion` gates both Framer Motion variants and the Canvas hero — reduced-motion users never see the mini-game activation hint and keep static hero content.
- The hero mini-game itself is intentionally desktop/pointer-only and **not** keyboard or AT-accessible — it's a decorative easter egg layered behind the accessible hero content, not a regression to fix.
- Audio is muted by default with a single always-visible mute control; never autoplay with sound.

## Testing posture

- Before calling a change done: `npm run typecheck`, `npm run lint`, `npm run format:check` (`lint:fix`/`format` to auto-fix).
- `npm run test:e2e` runs the Playwright suite ([tests/e2e/production-smoke.spec.ts](../tests/e2e/production-smoke.spec.ts)) — only run this (or any browser automation) when explicitly asked, e.g. before a release. The user tests UI/gameplay manually otherwise.
- If you need a dev server: `npm run dev -- --host 127.0.0.1 --port 4322` (avoids colliding with other local projects on Astro's default `4321`).
- `format:check` has known pre-existing noise (e.g. in `heroGame/sprites.ts` and some section files, plus local-only files like `.claude/settings.local.json`). Don't drive-by "fix" unrelated formatting in feature commits.
