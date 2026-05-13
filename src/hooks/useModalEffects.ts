import { useEffect } from 'react';

export function useModalEffects(escapeHandler?: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escapeHandler?.();
    };
    if (escapeHandler) document.addEventListener('keydown', handler);
    document.body.style.overflow = 'hidden';
    return () => {
      if (escapeHandler) document.removeEventListener('keydown', handler);
      document.body.style.overflow = '';
    };
  }, [escapeHandler]);
}
