import { motion, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { usePrefersReducedMotion } from '../../lib/usePrefersReducedMotion';

export interface RevealProps {
  children: ReactNode;
  /** Stagger offset in seconds — lets sibling Reveals cascade like a "level intro" */
  delay?: number;
  className?: string;
}

const DESKTOP_QUERY = '(min-width: 48rem)';

const variants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

const staticVariants: Variants = {
  hidden: { opacity: 1, y: 0 },
  visible: { opacity: 1, y: 0 },
};

/**
 * Restrained scroll-reveal wrapper — fades/slides content into place once,
 * the first time it scrolls into view ("level intro" cards). Renders
 * a single static frame with no transform/opacity animation under
 * `prefers-reduced-motion`, so content stays immediately readable.
 */
export default function Reveal({
  children,
  delay = 0,
  className,
}: RevealProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setIsDesktop(mql.matches);

    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const shouldAnimate = isDesktop && !prefersReducedMotion;
  const revealDelay = Math.min(delay * 0.6, 0.16);

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={shouldAnimate ? variants : staticVariants}
      transition={{
        duration: shouldAnimate ? 0.38 : 0,
        delay: shouldAnimate ? revealDelay : 0,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
