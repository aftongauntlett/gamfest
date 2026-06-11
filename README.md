# GAM[fest]

Source for [gamfest.org](https://gamfest.org/) — the recap site for GAM[fest], a Baltimore
community festival celebrating Games | Art | Music, built around playing classic videogames
live on a giant LED billboard. A freelance build for the event organizer: recap GAM[fest] #1
with some personality, and point people to Discord/Facebook for the next one (TBD).

## Highlights

- Retro arcade "loading screen" theme — pixel type, scanlines, neon-on-black palette
- Hero canvas renders a parallax skyline + billboard scene that switches between day/night
  palettes based on time of day (`?heroTime=day|night` to override)
- The hero canvas doubles as a hidden mini-game (desktop only): click it to drop a sprite
  into a small [Matter.js](https://brm.io/matter-js/) physics world and walk/jump around the
  scene — `Esc` to exit
- A couple of audio easter eggs tucked into the FAQ (dial-up modem sound, 8-bit coin pickup)
- Lightbox gallery, Framer Motion scroll reveals, and a sticky "level select" nav that
  highlights the current section as you scroll
- Mobile-first and accessibility-minded: full keyboard nav, `prefers-reduced-motion`
  fallbacks, alt text throughout

## Stack

- [Astro](https://astro.build) (static output) with [React](https://react.dev) islands for
  interactive pieces
- [Framer Motion](https://motion.dev) for UI motion; Canvas 2D + Matter.js for the hero
  scene/mini-game
- CSS custom properties as design tokens — no hardcoded colors/spacing in components
- TypeScript, ESLint (`eslint-plugin-astro`, `eslint-plugin-jsx-a11y`), Prettier

## Project structure

```text
/
├── public/              # static assets served as-is (favicons, sprite sheets)
├── src/
│   ├── assets/          # images, audio, sprites — imported & optimized via astro:assets
│   ├── components/      # shared UI (Button, Card, Badge, Section, ...)
│   │   ├── islands/      # interactive React bits (gallery modal, FAQ audio gags, copy button)
│   │   └── motion/        # Framer Motion helpers + the hero canvas/mini-game
│   ├── data/            # site config (external links, contact info)
│   ├── layouts/         # base page layout & global nav
│   ├── lib/             # shared hooks
│   ├── pages/           # routes (index.astro composes the sections below)
│   ├── sections/        # one component per page section (hero, recap, lineup, gallery, ...)
│   └── styles/          # global styles & design tokens
└── docs/                # planning docs (PRD, source copy) — local only, gitignored
```

## Commands

All commands are run from the project root:

| Command                | Action                                         |
| :--------------------- | :--------------------------------------------- |
| `npm install`          | Install dependencies                           |
| `npm run dev`          | Start the local dev server at `localhost:4321` |
| `npm run build`        | Build the production site to `./dist/`         |
| `npm run preview`      | Preview the production build locally           |
| `npm run typecheck`    | Type-check the project (`astro check`)         |
| `npm run lint`         | Lint with ESLint                               |
| `npm run lint:fix`     | Lint and auto-fix with ESLint                  |
| `npm run format`       | Format the project with Prettier               |
| `npm run format:check` | Check formatting without writing changes       |
