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
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => { document.body.style.overflow = 'unset'; };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="prioritize-overlay confirm-modal-overlay" onClick={onClose} style={{ zIndex: 2000 }}>
      <div className="prioritize-modal confirm-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px', padding: '2em' }}>
        <div className="prioritize-header" style={{ marginBottom: '1em' }}>
          <h3 className="prioritize-title" style={{ color: danger ? '#ef4444' : 'var(--text-primary)' }}>
            {danger ? '🗑️ ' : ''}{title}
          </h3>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5', margin: '0 0 1.5em' }}>
          {message}
        </div>
        <div className="prioritize-actions" style={{ gap: '0.75em' }}>
          <button className="btn confirm-cancel-btn" onClick={onClose} style={{ background: 'var(--bg-tertiary)', flex: 1 }}>
            {cancelText}
          </button>
          <button 
            className="btn" 
            onClick={() => { onConfirm(); onClose(); }}
            style={{ 
              background: danger ? '#ef4444' : 'var(--accent-gradient)', 
              color: 'white', 
              border: 'none', 
              flex: 1, 
              fontWeight: '600' 
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
