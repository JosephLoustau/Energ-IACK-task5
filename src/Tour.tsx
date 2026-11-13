import { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { TOUR_STEPS } from './tourSteps';
import type { TourStep } from './tourSteps';

interface Props { open: boolean; onClose: () => void; onEnter: (action: NonNullable<TourStep['onEnter']>) => void; }

export default function Tour({ open, onClose, onEnter }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[index]!;

  useEffect(() => { if (open) setIndex(0); }, [open]);
  useEffect(() => { if (open && step.onEnter) onEnter(step.onEnter); }, [open, step, onEnter]);
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      const element = document.querySelector(`[data-tour="${step.target}"]`);
      element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      setRect(element ? element.getBoundingClientRect() : null);
    };
    const timer = setTimeout(measure, 60);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(timer); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [open, step]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const popoverStyle = rect
    ? { top: Math.min(Math.max(12, rect.top + 12), window.innerHeight - 230), left: Math.min(Math.max(12, rect.right + 14), window.innerWidth - 352) }
    : { top: 100, left: 20 };
  return <div className="tour-layer" role="dialog" aria-label="Visite guidée">
    {rect && <div className="tour-spotlight" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
    <div className="tour-popover" style={popoverStyle}>
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
