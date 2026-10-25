/** The mark: a play triangle cut into a film frame, rose into violet. */
export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="dt-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff4f6d" />
          <stop offset="1" stopColor="#9b7bff" />
        </linearGradient>
      </defs>
      <rect x="2" y="5" width="28" height="22" rx="6" fill="url(#dt-mark)" />
      <g fill="#0e0e11" opacity="0.55">
        <rect x="5" y="7.5" width="2.2" height="2.2" rx="0.6" />
        <rect x="5" y="14.9" width="2.2" height="2.2" rx="0.6" />
        <rect x="5" y="22.3" width="2.2" height="2.2" rx="0.6" />
        <rect x="24.8" y="7.5" width="2.2" height="2.2" rx="0.6" />
        <rect x="24.8" y="14.9" width="2.2" height="2.2" rx="0.6" />
        <rect x="24.8" y="22.3" width="2.2" height="2.2" rx="0.6" />
      </g>
      <path d="M13 11.2v9.6c0 .8.9 1.3 1.6.8l7-4.8c.6-.4.6-1.2 0-1.6l-7-4.8c-.7-.5-1.6 0-1.6.8z" fill="#fff" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-1.5">
      <LogoMark />
      <span className="text-lg font-semibold tracking-tight text-text">
        Drama<span className="text-brand">Tube</span>
      </span>
    </span>
  );
}
