import type { PublicPerson } from '../shared/types';

type PortraitProps = { kind?: PublicPerson['illustration']; className?: string; color?: string };
export function FlowerMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <g fill="currentColor">
        <ellipse cx="24" cy="24" rx="6.2" ry="21" />
        <ellipse cx="24" cy="24" rx="6.2" ry="21" transform="rotate(60 24 24)" />
        <ellipse cx="24" cy="24" rx="6.2" ry="21" transform="rotate(120 24 24)" />
      </g>
      <circle cx="24" cy="24" r="5.2" fill="var(--paper)" />
    </svg>
  );
}

export default function Portrait({ kind = 'flower', className = '', color }: PortraitProps) {
  const fill =
    kind === 'sun' || kind === 'spark'
      ? '#f4d773'
      : kind === 'moon' || kind === 'waves'
        ? '#c5c0e7'
        : '#edb39b';
  return (
    <svg
      className={className}
      viewBox="0 0 260 240"
      role="img"
      aria-label={`Abstract ${kind} character illustration`}
      style={{ background: color || fill }}
    >
      <defs>
        <pattern id={`dots-${kind}`} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1" fill="#35263a" opacity=".1" />
        </pattern>
      </defs>
      <rect width="260" height="240" fill={`url(#dots-${kind})`} />
      {kind === 'flower' || kind === 'mountain' ? (
        <>
          <path d="M46 252c10-59 37-86 85-86s77 27 85 86" fill="#775c88" />
          <path
            d="M87 150c-30-3-46-34-29-55-17-29 3-50 29-48 5-35 44-43 61-18 30-12 54 15 47 37 30 8 36 42 12 56 15 30-12 56-41 47-20 30-52 19-58-5-10 5-17 2-21-14"
            fill="#f5edcb"
          />
          <ellipse cx="130" cy="102" rx="42" ry="47" fill="#b45a3f" />
          <path d="M106 83c10-17 20-20 26-19 17 1 29 11 39 27" fill="#35263a" />
          <path d="M113 108h1m31 0h1" stroke="#35263a" strokeWidth="6" strokeLinecap="round" />
          <path
            d="M119 128q12 10 24-3"
            fill="none"
            stroke="#35263a"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path
            d="M123 108l-3 12h7"
            fill="none"
            stroke="#873f2c"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="40" cy="47" r="9" fill="#f5edcb" />
          <path d="M206 191l7 4-7 4-4 7-4-7-7-4 7-4 4-7z" fill="#f5edcb" />
        </>
      ) : kind === 'sun' || kind === 'spark' ? (
        <>
          <path d="M45 251c7-58 37-84 86-84 43 0 73 31 86 84" fill="#e86543" />
          <path d="M92 191l32 23 29-24" fill="none" stroke="#35263a" strokeWidth="3" />
          <g fill="#35263a">
            <circle cx="130" cy="67" r="52" />
            <circle cx="90" cy="97" r="21" />
            <circle cx="172" cy="92" r="21" />
          </g>
          <path
            d="M91 83c3-6 11-12 19-17 8 22 36 13 59 21v37c0 26-17 48-39 48s-39-22-39-48z"
            fill="#f6bc79"
          />
          <path d="M107 110h2m30 0h2" stroke="#35263a" strokeWidth="6" strokeLinecap="round" />
          <path
            d="M114 140q13 10 27-3"
            fill="none"
            stroke="#35263a"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M125 116l-3 10h6" fill="none" stroke="#d99553" strokeWidth="3" />
          <g stroke="#35263a" strokeWidth="2" strokeLinecap="round">
            <path d="M211 44v18m-9-9h18M42 124v14m-7-7h14" />
          </g>
        </>
      ) : (
        <>
          <path d="M43 252c10-58 36-86 86-86 49 0 77 28 88 86" fill="#43594d" />
          <path d="M75 143V84c0-38 23-59 56-59 35 0 55 26 55 61v66" fill="#35263a" />
          <path
            d="M89 88q31-3 47-36c8 21 18 31 35 34v39c0 25-18 46-41 46s-41-21-41-46z"
            fill="#f0b098"
          />
          <g fill="none" stroke="#35263a" strokeWidth="3">
            <rect x="96" y="102" width="26" height="19" rx="7" />
            <rect x="136" y="102" width="26" height="19" rx="7" />
            <path d="M122 109h14M118 143q13 7 24-3" strokeLinecap="round" />
          </g>
          <path d="M129 118l-4 11h8" fill="none" stroke="#cb8c75" strokeWidth="3" />
          <path d="M203 44a15 15 0 1 0 15 20 17 17 0 0 1-15-20" fill="#f5edcb" />
          <path
            d="M35 180q8-9 16 0t16 0"
            fill="none"
            stroke="#f5edcb"
            strokeWidth="4"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
