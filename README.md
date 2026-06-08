# GAM[fest]

Source for [gamfest.org](https://gamfest.org/) — a static, single-page site for GAM[fest],
a Baltimore festival celebrating Games | Art | Music, built around playing classic
videogames live on a giant LED billboard.

## Stack

- [Astro](https://astro.build) (static output) with [React](https://react.dev) islands for
  interactive pieces
- [Framer Motion](https://motion.dev) for UI motion, a custom Canvas 2D piece for the hero
- CSS custom properties as design tokens — no hardcoded colors/spacing in components
- TypeScript, ESLint (`eslint-plugin-astro`, `eslint-plugin-jsx-a11y`), Prettier

## Project structure

```text
/
├── public/              # static assets served as-is (favicons, etc.)
├── src/
│   ├── assets/
│   │   └── images/      # content images, imported & optimized via astro:assets
│   ├── components/      # reusable Astro/React components
│   ├── pages/           # routes (index.astro is the single page)
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
