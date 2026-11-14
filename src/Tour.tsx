import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TOUR_STEPS } from './tourSteps';
import type { TourStep } from './tourSteps';

interface Props { open: boolean; onClose: () => void; onEnter: (action: NonNullable<TourStep['onEnter']>) => void; }

export default function Tour({ open, onClose, onEnter }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const popover = useRef<HTMLDivElement>(null);
  const step = TOUR_STEPS[index]!;

  useEffect(() => { if (open) setIndex(0); }, [open]);
  useLayoutEffect(() => { if (open && step.onEnter) onEnter(step.onEnter); }, [open, step, onEnter]);
  useLayoutEffect(() => {
    if (!open) return;
    let element: HTMLElement | null = null;
    let frame = 0;
    let previousFocus: HTMLElement | null = null;
    let originalTabIndex: string | null = null;
    const measure = () => {
      setRect(element ? element.getBoundingClientRect() : null);
    };
    const focusTarget = () => {
      element ??= document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!element) return;
      const margin = 24;
      const headerBottom = document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0;
      const width = popover.current?.offsetWidth ?? 340;
      const height = popover.current?.offsetHeight ?? 220;
      const beside = window.innerWidth - element.getBoundingClientRect().width >= width + margin * 3;
      const available = Math.max(120, window.innerHeight - headerBottom - margin * 2 - (beside ? 0 : height + margin));
      element.style.setProperty('--tour-available-height', `${available}px`);
      element.style.setProperty('--tour-view-header-height', `${element.querySelector('.view-header')?.getBoundingClientRect().height ?? 0}px`);
      element.classList.add('tour-focus-target');
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const bounds = element.getBoundingClientRect();
      const top = headerBottom + margin;
      const bottom = window.innerHeight - margin;
      const adjustment = !beside || bounds.top < top ? bounds.top - top : bounds.bottom > bottom ? bounds.bottom - bottom : 0;
      if (adjustment) window.scrollBy({ top: adjustment, behavior: 'instant' });
      measure();
    };
    frame = requestAnimationFrame(() => {
      element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!element) return;
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      originalTabIndex = element.getAttribute('tabindex');
      element.setAttribute('tabindex', '-1');
      element.scrollTop = 0;
      focusTarget();
      element.focus({ preventScroll: true });
    });
    const observer = new ResizeObserver(measure);
    if (popover.current) observer.observe(popover.current);
    const resize = () => { focusTarget(); };
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', measure, true);
      if (!element) return;
      element.classList.remove('tour-focus-target');
      element.style.removeProperty('--tour-available-height');
      element.style.removeProperty('--tour-view-header-height');
      if (originalTabIndex === null) element.removeAttribute('tabindex');
      else element.setAttribute('tabindex', originalTabIndex);
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open, step]);
  // Place la fenêtre d'explication sans recouvrir l'élément mis en avant : à droite, à gauche, dessous, dessus, puis dans un coin.
  useLayoutEffect(() => {
    if (!open) return;
    const width = popover.current?.offsetWidth ?? 340, height = popover.current?.offsetHeight ?? 220, margin = 14;
    const vw = window.innerWidth, vh = window.innerHeight;
    const clamp = (value: number, max: number) => Math.max(12, Math.min(value, max - 12));
    if (!rect) { setPosition({ top: 100, left: 20 }); return; }
    const target = { left: Math.max(0, rect.left - 6), top: Math.max(0, rect.top - 6), right: Math.min(vw, rect.right + 6), bottom: Math.min(vh, rect.bottom + 6) };
    const midY = clamp(target.top + 12, vh - height + 12), midX = clamp(target.left, vw - width + 12);
    const candidates = [
      { left: target.right + margin, top: midY }, { left: target.left - width - margin, top: midY },
      { left: midX, top: target.bottom + margin }, { left: midX, top: target.top - height - margin },
      { left: vw - width - 12, top: vh - height - 12 }, { left: 12, top: vh - height - 12 },
      { left: vw - width - 12, top: 80 }, { left: 12, top: 80 },
    ];
    const overlap = (c: { left: number; top: number }) => {
      const w = Math.min(c.left + width, target.right) - Math.max(c.left, target.left);
      const h = Math.min(c.top + height, target.bottom) - Math.max(c.top, target.top);
      return w > 0 && h > 0 ? w * h : 0;
    };
    const fits = (c: { left: number; top: number }) => c.left >= 12 && c.top >= 12 && c.left + width <= vw - 12 && c.top + height <= vh - 12;
    const free = candidates.find((c) => fits(c) && overlap(c) === 0);
    const best = free ?? candidates.filter(fits).sort((a, b) => overlap(a) - overlap(b))[0] ?? candidates[0]!;
    setPosition({ left: clamp(best.left, vw - width + 12), top: clamp(best.top, vh - height + 12) });
  }, [open, rect, index]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const popoverStyle = position ?? { top: 100, left: 20 };
  return <div className="tour-layer" role="dialog" aria-label="Visite guidée">
    {rect && <div className="tour-spotlight" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
    <div className="tour-popover" ref={popover} style={popoverStyle}>
      <button className="icon-button tour-close" onClick={onClose} aria-label="Fermer la visite"><X size={16} /></button>
      <small>Étape {index + 1} / {TOUR_STEPS.length}</small>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="tour-actions">
        <button className="text-button" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={14} /> Précédent</button>
        {index < TOUR_STEPS.length - 1
          ? <button className="primary-button" onClick={() => setIndex(index + 1)}>Suivant <ChevronRight size={14} /></button>
          : <button className="primary-button" onClick={onClose}>Terminer</button>}
      </div>
    </div>
  </div>;
}
