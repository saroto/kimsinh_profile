import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SECTIONS, type SectionMeta } from '../../lib/three/SectionTransitionScene';

export default function SectionHUD() {
  const [activeSection, setActiveSection] = useState<SectionMeta>(SECTIONS[0]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showToast, setShowToast] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let toastTimeout: NodeJS.Timeout | null = null;

    const handleSectionSwitch = (e: CustomEvent) => {
      if (e.detail?.section) {
        setActiveSection(e.detail.section);
        setActiveIndex(e.detail.index);

        // Flash transition toast for 2.2 seconds
        setShowToast(true);
        if (toastTimeout) clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
          setShowToast(false);
        }, 2200);
      }
    };

    const handleScroll = () => {
      const totalScroll =
        document.documentElement.scrollHeight - window.innerHeight;
      if (totalScroll > 0) {
        setScrollProgress(
          Math.min(1, Math.max(0, window.scrollY / totalScroll))
        );
      }
    };

    window.addEventListener(
      'section-switch-active',
      handleSectionSwitch as EventListener
    );
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener(
        'section-switch-active',
        handleSectionSwitch as EventListener
      );
      window.removeEventListener('scroll', handleScroll);
      if (toastTimeout) clearTimeout(toastTimeout);
    };
  }, []);

  const scrollToSection = (sec: SectionMeta, idx: number) => {
    const el = document.getElementById(sec.id);
    if (el) {
      const dir = idx > activeIndex ? 'down' : 'up';
      window.dispatchEvent(
        new CustomEvent('trigger-section-transition', {
          detail: { toIndex: idx, direction: dir },
        })
      );
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <>
      {/* ── Top Micro Reading Progress Line ──────────────── */}
      <div
        className="fixed top-0 left-0 right-0 h-[2px] z-50 pointer-events-none bg-rule/30"
        aria-hidden="true"
      >
        <motion.div
          className="h-full bg-brand origin-left"
          style={{ transform: `scaleX(${scrollProgress})` }}
          transition={{ ease: 'linear', duration: 0.1 }}
        />
      </div>

      {/* ── Temporary Section Switch Toast (Frame Motion) ─── */}
      <div className="fixed top-20 right-6 z-40 pointer-events-none hidden sm:block">
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
              className="flex items-center gap-3 px-3.5 py-1.5 rounded-full border border-rule/70 bg-background/90 shadow-md backdrop-blur-md font-mono text-[11px]"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand"></span>
              </span>
              <span className="text-muted-foreground uppercase text-[10px] tracking-wider">
                Section:
              </span>
              <span className="font-semibold text-foreground tracking-widest uppercase">
                {activeSection.num} {activeSection.title}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Right-Edge Editorial Waypoint Rail ────────────── */}
      <nav
        aria-label="Section Navigation"
        className="fixed right-3 sm:right-6 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-4 pointer-events-auto select-none"
      >
        {SECTIONS.map((sec, idx) => {
          const isActive = idx === activeIndex;
          return (
            <button
              key={sec.id}
              onClick={() => scrollToSection(sec, idx)}
              className="group flex items-center justify-end gap-2.5 py-1 text-right focus:outline-hidden cursor-pointer"
              title={`${sec.num} ${sec.title}`}
            >
              <span
                className={`text-[10px] font-mono tracking-widest uppercase transition-all duration-300 ${
                  isActive
                    ? 'opacity-100 text-brand translate-x-0 font-semibold'
                    : 'opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 text-muted-foreground'
                }`}
              >
                {sec.num} {sec.title}
              </span>
              <span
                className={`relative h-2 rounded-full transition-all duration-300 ${
                  isActive
                    ? 'w-6 bg-brand shadow-xs'
                    : 'w-2 bg-rule-strong/60 group-hover:bg-foreground'
                }`}
              />
            </button>
          );
        })}
      </nav>
    </>
  );
}
