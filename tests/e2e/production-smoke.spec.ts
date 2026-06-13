import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

const require = createRequire(import.meta.url);
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

interface AxeViolation {
  id: string;
  impact: string | null;
  description: string;
  nodes: Array<{
    target: string[];
    failureSummary?: string;
  }>;
}

interface AxeResults {
  violations: AxeViolation[];
}

function formatAxeViolations(violations: AxeViolation[]) {
  return violations
    .map((violation) => {
      const targets = violation.nodes
        .map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`)
        .join('\n');
      return `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.description}\n${targets}`;
    })
    .join('\n\n');
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test('homepage has core landmarks and no axe smoke violations', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Section' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: /GAM\[fest\]/i, level: 1 }),
  ).toBeVisible();

  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => {
    const axe = (
      window as unknown as {
        axe: { run: (context: Document) => Promise<AxeResults> };
      }
    ).axe;
    return axe.run(document);
  });

  expect(results.violations, formatAxeViolations(results.violations)).toEqual(
    [],
  );
});

test('top nav tracks section navigation', async ({ page }) => {
  await page.goto('/');

  const faqLink = page.getByRole('link', { name: 'FAQ' });
  await faqLink.click();

  await expect(page).toHaveURL(/#faq$/);
  await expect(faqLink).toHaveAttribute('aria-current', 'true');
});

test('FAQ and gallery controls work from keyboard-visible UI', async ({
  page,
}) => {
  await page.goto('/');

  const firstFaq = page
    .locator('details')
    .filter({ hasText: 'Is this a real event?' })
    .first();
  await firstFaq.getByText('Is this a real event?').click();
  await expect(firstFaq).toHaveJSProperty('open', true);

  const firstPhoto = page.getByRole('button', {
    name: /View full photo: The billboard/i,
  });
  await firstPhoto.click();

  const dialog = page.getByRole('dialog', {
    name: /The billboard: The Legend of Zelda/i,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Close' })).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('audio and video controls expose independent buttons', async ({
  page,
}) => {
  await page.goto('/');

  const heroAudio = page.getByRole('button', {
    name: 'Unmute hero game sound',
  });
  await expect(heroAudio).toHaveAttribute('aria-pressed', 'false');
  await heroAudio.click();
  await expect(heroAudio).toHaveAttribute('aria-pressed', 'true');
  await expect(heroAudio).toHaveAccessibleName('Mute hero game sound');

  const lineup = page.locator('#lineup');
  await lineup.scrollIntoViewIfNeeded();

  const videoSurface = lineup.getByRole('button', { name: 'Play video' });
  await videoSurface.focus();
  await expect(lineup.locator('.video-player__controls')).toHaveCSS(
    'opacity',
    '1',
  );
  await expect(lineup.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(lineup.getByRole('button', { name: 'Unmute' })).toBeVisible();
});

test('reduced motion keeps the hero content accessible and blocks game activation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');

  const hero = page.locator('.hero');
  const canvas = page.locator('canvas.hero-canvas');

  await expect(
    hero.getByRole('heading', { name: /GAM\[fest\]/i }),
  ).toBeVisible();
  await expect(canvas).toBeVisible();

  await canvas.click({ position: { x: 20, y: 20 } });
  await expect(hero).not.toHaveAttribute('data-game-active', 'true');
  await expect(
    hero.getByRole('heading', { name: /GAM\[fest\]/i }),
  ).toBeVisible();
});
