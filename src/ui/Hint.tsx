import { useI18n } from '../i18n/I18nProvider';

interface Props {
  textKey: string;
  href: string;
}

/** A collapsible "what does this knob do" explanation with a link to an open source. */
export function Hint({ textKey, href }: Props) {
  const { t } = useI18n();
  return (
    <details className="hint">
      <summary aria-label="?">?</summary>
      <p>
        {t(textKey)}{' '}
        <a href={href} target="_blank" rel="noreferrer">
          {t('hint.more')} ↗
        </a>
      </p>
    </details>
  );
}
