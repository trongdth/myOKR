import { useId } from 'react';

/**
 * LogoMark — the myOKR logo glyph (a Target) rendered in the brand gradient.
 *
 * This is the single surface where the cyan→violet gradient is permitted
 * (ADR-0010 / P03). Everywhere else, accent colour is solid and semantic.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const id = useId();
  const gradId = `myokr-logo-${id}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-objective)" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" stroke={`url(#${gradId})`} strokeWidth="2" />
      <circle cx="12" cy="12" r="6" stroke={`url(#${gradId})`} strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill={`url(#${gradId})`} />
    </svg>
  );
}
