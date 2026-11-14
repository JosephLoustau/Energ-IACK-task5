import { useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

const WIDTH = 280;
const GAP = 8;

/** Info icon showing its text on hover or focus. The bubble goes to <body> so scrolling or filtered panels do not clip it. */
export default function Hint({ children, label = 'Explication', size = 13 }: { children: ReactNode; label?: string; size?: number }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  function show() {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    const left = Math.max(GAP, Math.min(box.left + box.width / 2 - WIDTH / 2, window.innerWidth - WIDTH - GAP));
    const below = box.top < window.innerHeight / 2;
    setStyle(below ? { left, top: box.bottom + GAP } : { left, bottom: window.innerHeight - box.top + GAP });
  }
  const hide = () => setStyle(null);
  return <span className="hint" ref={anchor} tabIndex={0} role="button" aria-label={label} aria-describedby={id}
    onClick={(event) => event.preventDefault()} onMouseEnter={show} onFocus={show} onMouseLeave={hide} onBlur={hide}>
    <Info size={size} aria-hidden="true" />
    <span id={id} className="visually-hidden">{children}</span>
    {style && createPortal(<span className="hint-bubble" aria-hidden="true" style={style}>{children}</span>, document.body)}
  </span>;
}
