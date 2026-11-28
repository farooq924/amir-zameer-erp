import { cn } from '@/utils/cn';

/** Original line-art sewing machine used as the TailoringERP logo mark. */
export function SewingMachineMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" fill="none" className={cn('h-8 w-10', className)} aria-hidden>
      {/* spool */}
      <rect x="30" y="4" width="6" height="7" rx="1.2" fill="currentColor" />
      {/* arm, head and column */}
      <path d="M8 20a8 8 0 0 1 8-8h30a8 8 0 0 1 8 8v20H44V22H20v8h-4a8 8 0 0 1-8-8v-2Z" fill="currentColor" />
      {/* needle */}
      <path d="M14 30h2v6h-2z" fill="currentColor" />
      {/* hand wheel */}
      <circle cx="58" cy="22" r="5" stroke="currentColor" strokeWidth="2.5" />
      {/* base */}
      <rect x="4" y="38" width="56" height="5" rx="2" fill="currentColor" />
      <path d="M22 16h18" stroke="#0f1f3d" strokeOpacity=".35" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandLogo({ name = 'TailoringERP', subtitle = 'By Brandistan', size = 'md', className, stacked }: {
  name?: string; subtitle?: string; size?: 'sm' | 'md' | 'lg'; className?: string; stacked?: boolean;
}) {
  const mark = size === 'lg' ? 'h-16 w-20' : size === 'sm' ? 'h-7 w-9' : 'h-10 w-12';
  const title = size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-sm' : 'text-lg';
  return (
    <div className={cn('flex items-center gap-2.5', stacked && 'flex-col gap-1 text-center', className)}>
      <SewingMachineMark className={cn('text-gold', mark)} />
      <div className="min-w-0 leading-tight">
        <p className={cn('truncate font-bold tracking-wide', title)}>{name}</p>
        <p className={cn('truncate text-gold', size === 'lg' ? 'text-lg' : 'text-xs')}>{subtitle}</p>
      </div>
    </div>
  );
}

/** Decorative scissors and measuring tape (original artwork) for the sidebar foot and login screen. */
export function TailorArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 160" fill="none" className={className} aria-hidden>
      <defs>
        <linearGradient id="az-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e7c873" /><stop offset=".55" stopColor="#c49a38" /><stop offset="1" stopColor="#8e6a1f" />
        </linearGradient>
      </defs>
      {/* measuring tape */}
      <path d="M-10 132c40-30 90-38 140-26s80 8 120-20" stroke="url(#az-gold)" strokeWidth="14" strokeLinecap="round" opacity=".9" />
      <path d="M-10 132c40-30 90-38 140-26s80 8 120-20" stroke="#5c4413" strokeWidth="14" strokeDasharray="1.5 7" opacity=".55" />
      {/* scissors */}
      <g transform="rotate(-28 150 70)">
        <path d="M150 70 230 52" stroke="url(#az-gold)" strokeWidth="7" strokeLinecap="round" />
        <path d="M150 70 228 84" stroke="url(#az-gold)" strokeWidth="7" strokeLinecap="round" />
        <circle cx="128" cy="56" r="17" stroke="url(#az-gold)" strokeWidth="7" />
        <circle cx="128" cy="88" r="17" stroke="url(#az-gold)" strokeWidth="7" />
        <circle cx="150" cy="70" r="4" fill="#5c4413" />
      </g>
    </svg>
  );
}

/** Suit on a mannequin, used beside the dashboard greeting (original artwork). */
export function SuitArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 96" fill="none" className={className} aria-hidden>
      <rect x="37" y="2" width="6" height="8" rx="2" fill="#8e6a1f" />
      <path d="M18 18c6-6 14-8 22-8s16 2 22 8l6 54H12l6-54Z" fill="#3a3027" />
      <path d="M30 12h20l-10 26-10-26Z" fill="#f4f1ea" />
      <path d="M37 18h6l-1 18h-4l-1-18Z" fill="#7a2331" />
      <path d="M18 18c6-6 12-6 12-6l10 26-12 34H12l6-54Z" fill="#4a3d31" />
      <path d="M62 18c-6-6-12-6-12-6L40 38l12 34h16l-6-54Z" fill="#43372c" />
      <circle cx="40" cy="50" r="1.6" fill="#c49a38" /><circle cx="40" cy="58" r="1.6" fill="#c49a38" />
      <path d="M38 72h4v14h-4z" fill="#8e6a1f" />
      <path d="M26 92c4-4 24-4 28 0" stroke="#8e6a1f" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
