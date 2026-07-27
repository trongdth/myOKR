import type { ReactNode } from 'react';
import '../../styles/empty-state.css';

/**
 * EmptyState — the shared "nothing here yet" surface (P04).
 *
 * Icon + title + message + up to 3 one-click starter actions. An empty state
 * must always offer a next step, never a dead end. Primary action uses the
 * solid `.btn` (the single cyan primary action per screen); others use
 * `.btn-ghost`. See docs/design-system.md.
 */
export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  message?: string;
  actions?: EmptyStateAction[];
  /** Extra content below the actions (e.g. an "Advanced" disclosure). */
  children?: ReactNode;
}

export function EmptyState({ icon, title, message, actions, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {message && <p className="empty-state-message">{message}</p>}
      {actions && actions.length > 0 && (
        <div className="empty-state-actions">
          {actions.map((a, i) => (
            <button
              key={i}
              className={a.primary ? 'btn empty-state-action' : 'btn-ghost empty-state-action'}
              onClick={a.onClick}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
