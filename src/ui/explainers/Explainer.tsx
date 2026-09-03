import { useEffect, useRef, type ReactNode } from 'react';
import { useI18n } from '../../i18n/I18nProvider';

export type ExplainerTopic = 'beam' | 'magnets' | 'mass' | 'detector' | 'noise' | 'glossary';

export const EXPLAINER_TOPICS: readonly ExplainerTopic[] = ['beam', 'magnets', 'mass', 'detector', 'noise', 'glossary'];

export function isExplainerTopic(value: unknown): value is ExplainerTopic {
  return typeof value === 'string' && (EXPLAINER_TOPICS as readonly string[]).includes(value);
}

interface DialogProps {
  topic: ExplainerTopic;
  onClose(): void;
  children: ReactNode;
}

/** A modal page that explains one part of the machine with live drawings. */
export function ExplainerDialog({ topic, onClose, children }: DialogProps) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      className="explainer"
      aria-labelledby="explainer-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="explainer-body">
        <header className="explainer-header">
          <div>
            <p className="eyebrow">{t('explainer.eyebrow')}</p>
            <h2 id="explainer-title">{t(`explainer.${topic}.title`)}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label={t('explainer.close')}>
            {t('explainer.close')}
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}

interface ButtonProps {
  topic: ExplainerTopic;
  onOpen(topic: ExplainerTopic): void;
  /** Override the button label key; defaults to "How it works". */
  labelKey?: string;
}

export function ExplainerButton({ topic, onOpen, labelKey }: ButtonProps) {
  const { t } = useI18n();
  return (
    <button type="button" className="explain-button" onClick={() => onOpen(topic)}>
      {t(labelKey ?? 'explainer.open')}
    </button>
  );
}

/** A section of an explainer: heading, drawing, and a short text. */
export function ExplainerSection({ title, text, children }: { title: string; text: ReactNode; children?: ReactNode }) {
  return (
    <section className="explainer-section">
      <h3>{title}</h3>
      {children && <div className="explainer-figure">{children}</div>}
      <p>{text}</p>
    </section>
  );
}

/** Live value chip used inside explainer texts and figures. */
export function Live({ label, value }: { label: string; value: string }) {
  return (
    <span className="live">
      <span className="live-label">{label}</span>
      <span className="live-value mono">{value}</span>
    </span>
  );
}
