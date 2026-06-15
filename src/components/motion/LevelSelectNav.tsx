import { useEffect, useRef, useState } from 'react';

export interface NavLevel {
  href: string;
  label: string;
}

export interface LevelSelectNavProps {
  levels: NavLevel[];
}

/**
 * "Level select" nav with scroll-tracked active-section highlighting.
 * Renders the same
 * `nav-link` markup server-side so it works with no JS, then layers in an
 * `IntersectionObserver` to mark whichever section is crossing the viewport's
 * "now playing" band as `aria-current`.
 *
 * Below the `48rem` breakpoint the list collapses behind a hamburger toggle.
 * `menuOpen` starts as `null` (the server-rendered/no-JS state) so the list
 * renders in its normal wrapped layout instead of being stuck hidden behind
 * a toggle that has no JS to open it; the first effect flips it to `false`
 * once hydrated.
 */
export default function LevelSelectNav({ levels }: LevelSelectNavProps) {
  const [activeHref, setActiveHref] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState<boolean | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, []);

  useEffect(() => {
    const sections = levels
      .map((level) => document.querySelector(level.href))
      .filter((el): el is Element => el !== null);

    if (sections.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting);
        if (visible.length === 0) return;

        const topmost = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b,
        );
        setActiveHref(`#${topmost.target.id}`);
      },
      // a thin horizontal band near the vertical center counts as "now playing"
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [levels]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        listRef.current?.contains(target) ||
        toggleRef.current?.contains(target)
      ) {
        return;
      }
      setMenuOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="level-select__toggle"
        hidden={menuOpen === null}
        aria-expanded={menuOpen ?? false}
        aria-controls="level-select-list"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span className="visually-hidden">Menu</span>
        <span className="level-select__toggle-bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>
      <ul
        id="level-select-list"
        className="level-select__list"
        ref={listRef}
        {...(menuOpen === null
          ? {}
          : { 'data-open': menuOpen ? 'true' : 'false' })}
      >
        {levels.map((level) => (
          <li key={level.href}>
            <a
              className="nav-link"
              href={level.href}
              aria-current={activeHref === level.href ? 'true' : undefined}
              onClick={() => setMenuOpen(false)}
            >
              {level.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
