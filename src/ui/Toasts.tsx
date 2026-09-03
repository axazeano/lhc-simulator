import { useEffect } from 'react';

export interface Toast {
  id: number;
  kind: 'mission' | 'rank' | 'penalty';
  title: string;
  text: string;
}

interface Props {
  toasts: Toast[];
  onDismiss(id: number): void;
}

const LIFETIME_MS = 8000;

/** Short-lived notices in the corner: a mission done, a new rank, a penalty. */
export function Toasts({ toasts, onDismiss }: Props) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const first = toasts[0]!;
    const timer = setTimeout(() => onDismiss(first.id), LIFETIME_MS);
    return () => clearTimeout(timer);
  }, [toasts, onDismiss]);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`}>
          <button type="button" className="toast-close" aria-label="×" onClick={() => onDismiss(toast.id)}>
            ×
          </button>
          <span className="toast-title">{toast.title}</span>
          <span className="toast-text">{toast.text}</span>
        </div>
      ))}
    </div>
  );
}
