/** Blason stylisé de la Ville de Genève : aigle impérial (demi) et clé d'or sur fond gueules. */
export default function Blason({ size = 40 }: { size?: number }) {
  return <svg width={size} height={size * 1.2} viewBox="0 0 100 120" role="img" aria-label="Blason de la Ville de Genève">
    <defs><clipPath id="shield"><path d="M4 4 H96 V58 C96 92 72 110 50 117 C28 110 4 92 4 58Z" /></clipPath></defs>
    <g clipPath="url(#shield)">
      <rect x="0" y="0" width="50" height="120" fill="#f6c51c" />
      <rect x="50" y="0" width="50" height="120" fill="#e30613" />
      {/* demi-aigle */}
      <g fill="#111">
        <path d="M50 14 C44 12 38 15 36 21 C33 20 30 22 30 26 L22 30 L28 33 L18 40 L30 41 L20 52 L34 50 L28 63 L42 58 L38 72 L50 66Z" />
        <path d="M50 66 L44 82 L50 80Z" />
      </g>
      <path d="M30 26 L20 29 L29 31Z" fill="#e30613" />
      <circle cx="39" cy="22" r="1.6" fill="#f6c51c" />
      {/* clé d'or */}
      <g fill="#f6c51c" stroke="#111" strokeWidth="1.2">
        <circle cx="75" cy="30" r="9" fill="none" strokeWidth="5" stroke="#f6c51c" />
        <rect x="72.5" y="39" width="5" height="46" />
        <rect x="77.5" y="72" width="9" height="5" />
        <rect x="77.5" y="80" width="9" height="5" />
      </g>
    </g>
    <path d="M4 4 H96 V58 C96 92 72 110 50 117 C28 110 4 92 4 58Z" fill="none" stroke="#111" strokeWidth="4" />
    <line x1="50" y1="4" x2="50" y2="117" stroke="#111" strokeWidth="1.5" />
  </svg>;
}
