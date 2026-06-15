# Handoff Notes

Deployment config, hero mini-game internals, a pre-release manual test checklist, and known limitations for whoever is deploying, testing, or maintaining GAM[fest].

## Deployment & Social Preview

The site builds as static output. Set `PUBLIC_SITE_URL` in the deployment environment to the production origin, without a trailing slash, so canonical and Open Graph URLs point at the real site. If unset, `astro.config.mjs` falls back to `https://gamfest-demo.vercel.app`.

Social cards use the stable public asset `public/gamfest-og.png`. After deployment, test a shared URL in Discord/Facebook/social debuggers to confirm the Open Graph image, title, description, and canonical URL are fetched from the production domain.

## Hero Mini-Game Notes

The hero canvas lives in `src/components/motion/HeroGame.tsx`. The supporting modules under `src/components/motion/heroGame/` split out the game-specific drawing and helpers.

The mini-game is intentionally a mouse/pointer-only easter egg. The `<canvas>` is `aria-hidden`, mobile shows a static hero backdrop, and `prefers-reduced-motion` users keep the normal hero content instead of activating gameplay.
