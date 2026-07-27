/**
 * PageShell — the centered content container for every screen.
 *
 * Wraps a screen's content in the design-system page shell: 1180px max-width,
 * 32px gutters, optional 12-column grid. See docs/design-system.md and
 * ADR-0010. Screens adopt this in the "apply to 9 screens" layer.
 */
import type { ReactNode } from 'react';

interface PageShellProps {
  children: ReactNode;
  /** Extra class names appended after `page-shell`. */
  className?: string;
  /** When true, lays out children on the 12-column grid (`page-shell cols-12`). */
  grid?: boolean;
}

export function PageShell({ children, className, grid }: PageShellProps) {
  const classes = ['page-shell'];
  if (grid) classes.push('cols-12');
  if (className) classes.push(className);
  return <div className={classes.join(' ')}>{children}</div>;
}
