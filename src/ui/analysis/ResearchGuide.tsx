import { useI18n } from '../../i18n/I18nProvider';

export type GuideStepId = 'record' | 'look' | 'select' | 'fit' | 'response' | 'compare' | 'claim';

export interface GuideStep {
  id: GuideStepId;
  done: boolean;
  /** CSS selector of the panel the step lives in, to scroll to. */
  target: string;
}

interface Props {
  steps: GuideStep[];
}

/** The research workflow as a checklist: what an analyst does, in order, with the state of each step. */
export function ResearchGuide({ steps }: Props) {
  const { t } = useI18n();
  const current = steps.find((s) => !s.done)?.id ?? null;
  const scrollTo = (selector: string) => document.querySelector(selector)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <section className="panel research-guide" aria-labelledby="guide-title">
      <div className="panel-head">
        <h2 id="guide-title">{t('guide.title')}</h2>
        <span className="note">{t('guide.lede')}</span>
      </div>
      <ol className="guide-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`guide-step ${s.done ? 'done' : ''} ${s.id === current ? 'current' : ''}`}>
            <button type="button" onClick={() => scrollTo(s.target)}>
              <span className="guide-num mono">{s.done ? '✓' : i + 1}</span>
              <span className="guide-body">
                <span className="guide-name">{t(`guide.${s.id}.title`)}</span>
                <span className="guide-why">{t(`guide.${s.id}.why`)}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
