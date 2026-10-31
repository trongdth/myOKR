import { useEffect } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = true
}: Props) {
  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="prioritize-overlay confirm-modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div
        className="prioritize-modal confirm-modal"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '400px', padding: '2em', overflowWrap: 'anywhere' }}
      >
        <div className="prioritize-header" style={{ marginBottom: '1em' }}>
          <h3 className="prioritize-title">{title}</h3>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', margin: '0 0 1.5em' }}>
          {message}
        </div>
        <div className="prioritize-actions" style={{ gap: '0.75em' }}>
          <button className="btn confirm-cancel-btn" onClick={onClose}>
            {cancelText}
          </button>
          <button
            className={danger ? 'btn confirm-danger-btn' : 'btn'}
            onClick={() => { onConfirm(); onClose(); }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
