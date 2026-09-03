import { useI18n } from '../i18n/I18nProvider';
import { ALL_LEVELS, isLevelUnlocked, type Evaluation, type Level, type LevelStatus } from '../tutorial/levels';

interface Props {
  level: Level;
  completed: ReadonlySet<string>;
  status: LevelStatus;
  evaluation: Evaluation;
  quizCorrect: ReadonlySet<string>;
  quizWrong: ReadonlySet<string>;
  onSelectLevel(id: string): void;
  onAnswer(questionId: string, option: number): void;
  onRestart(): void;
  onNext(): void;
}

export function TutorialPanel(props: Props) {
  const { t } = useI18n();
  const { level, status, evaluation } = props;
  const index = ALL_LEVELS.findIndex((l) => l.id === level.id);
  const next = ALL_LEVELS[index + 1];

  return (
    <section className="panel tutorial" aria-labelledby="tutorial-title">
      <div className="tutorial-levels">
        <h2 id="tutorial-title">{t('tutorial.title')}</h2>
        <ol className="level-list">
          {ALL_LEVELS.map((l, i) => {
            const unlocked = isLevelUnlocked(l, props.completed);
            const done = props.completed.has(l.id);
            const current = l.id === level.id;
            return (
              <li key={l.id}>
                <button
                  type="button"
                  className={`level-chip ${current ? 'current' : ''} ${done ? 'done' : ''}`}
                  disabled={!unlocked}
                  title={unlocked ? undefined : t('tutorial.locked')}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => props.onSelectLevel(l.id)}
                >
                  <span className="level-num mono">{l.id === 'sandbox' ? '∞' : i + 1}</span>
                  <span className="level-name">{t(l.titleKey)}</span>
                  {done && <span className="level-done" aria-label={t('tutorial.completed')}>✓</span>}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="tutorial-body">
        <h3 className="level-title">{t(level.titleKey)}</h3>
        <p className="level-intro">{t(level.introKey)}</p>

        <div className="level-goal">
          <span className="eyebrow">{t('tutorial.goal')}</span>
          <p>{t(level.goalKey)}</p>
          {evaluation.conditions.length > 0 && (
            <ul className="conditions">
              {evaluation.conditions.map((c) => (
                <li key={c.key} className={c.done ? 'done' : ''}>
                  <span className="cond-mark" aria-hidden="true">{c.done ? '✓' : '○'}</span>
                  <span className="cond-label">{t(c.key.startsWith('quiz.') ? 'cond.quiz' : c.key)}</span>
                  {c.progress && !c.done && <span className="cond-progress mono">{c.progress}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        {level.quiz.map((q) => {
          const correct = props.quizCorrect.has(q.id);
          const wrong = props.quizWrong.has(q.id);
          return (
            <div key={q.id} className={`quiz ${correct ? 'correct' : ''}`}>
              <p className="quiz-question">{t(q.questionKey)}</p>
              <div className="quiz-options">
                {q.optionKeys.map((key, i) => (
                  <button
                    key={key}
                    type="button"
                    className={correct && i === q.correct ? 'active' : ''}
                    disabled={correct}
                    onClick={() => props.onAnswer(q.id, i)}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
              {correct && <p className="quiz-feedback ok">{t('tutorial.quiz.correct')}</p>}
              {!correct && wrong && <p className="quiz-feedback warn">{t('tutorial.quiz.wrong')}</p>}
            </div>
          );
        })}

        <details className="hint level-hint">
          <summary>{t('tutorial.hint')}</summary>
          <p>{t(level.hintKey)}</p>
        </details>

        {status === 'failed' && (
          <div className="level-status failed">
            <p>{t('tutorial.failed')}</p>
            <button type="button" className="primary" onClick={props.onRestart}>
              {t('tutorial.retry')}
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="level-status completed">
            <p className="level-status-title">{t('tutorial.completed')}</p>
            <span className="eyebrow">{t('tutorial.card')}</span>
            <p>
              {t(level.cardKey)}{' '}
              <a href={level.cardHref} target="_blank" rel="noreferrer">
                {t('tutorial.source')} ↗
              </a>
            </p>
            <div className="button-row">
              {next && (
                <button type="button" className="primary" onClick={props.onNext}>
                  {t('tutorial.next')}
                </button>
              )}
              <button type="button" onClick={props.onRestart}>
                {t('tutorial.restart')}
              </button>
            </div>
          </div>
        )}

        {status === 'playing' && level.id !== 'sandbox' && (
          <div className="button-row">
            <button type="button" onClick={props.onRestart}>
              {t('tutorial.restart')}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
