import { useI18n } from '../i18n/I18nProvider';
import { LEVELS } from '../tutorial/levels';
import {
  LEVEL_REWARD,
  MISSIONS,
  RANKS,
  maxReputation,
  nextRank,
  rankGain,
  rankIndex,
  type Mission,
  type MissionContext,
  type Rank,
} from '../game/missions';
import { TIME_SPEED_OPTIONS } from './timeSpeed';

interface Props {
  reputation: number;
  rank: Rank;
  completedMissions: ReadonlySet<string>;
  context: MissionContext;
  onGoTo(screen: 'console' | 'analysis'): void;
}

const TIERS = [1, 2, 3, 4] as const;

/** The research programme: rank, reputation, what the next rank opens, and every mission with its state. */
export function ProgrammeScreen({ reputation, rank, completedMissions, context, onGoTo }: Props) {
  const { t, number } = useI18n();
  const next = nextRank(rank);
  const span = next ? next.minReputation - rank.minReputation : 1;
  const fraction = next ? Math.min(1, (reputation - rank.minReputation) / span) : 1;
  const levelsDone = LEVELS.filter((l) => context.completedLevels.has(l.id)).length;

  const gainText = (r: Rank): string => {
    const gain = rankGain(r);
    const parts: string[] = [];
    if (gain.energy) parts.push(t('rank.gain.energy', { tev: number(r.perks.maxEnergyGeV / 1000, { maximumFractionDigits: 1 }) }));
    if (gain.bunches) parts.push(t('rank.gain.bunches', { n: number(r.perks.maxBunches) }));
    if (gain.timeSpeed) {
      const option = [...TIME_SPEED_OPTIONS].reverse().find((o) => o.factor <= r.perks.maxTimeSpeed);
      if (option) parts.push(t('rank.gain.timeSpeed', { speed: t(option.labelKey) }));
    }
    for (const c of gain.channels) parts.push(t('rank.gain.channel', { channel: t(`channel.${c}`) }));
    if (gain.claims) parts.push(t('rank.gain.claims'));
    return parts.length > 0 ? parts.join(' · ') : t('rank.gain.honour');
  };

  const missionState = (m: Mission): 'done' | 'locked' | 'open' => {
    if (completedMissions.has(m.id)) return 'done';
    if (m.requiresRank && rankIndex(m.requiresRank) > rankIndex(rank.id)) return 'locked';
    return 'open';
  };

  return (
    <main className="programme">
      <section className="panel programme-head">
        <div>
          <span className="eyebrow">{t('programme.rank')}</span>
          <h2 className="programme-rank">{t(`rank.${rank.id}`)}</h2>
          <p className="note">{t(`rank.${rank.id}.blurb`)}</p>
        </div>
        <div className="programme-reputation">
          <span className="eyebrow">{t('programme.reputation')}</span>
          <span className="programme-points mono">
            {number(reputation)} <span className="dim">/ {number(maxReputation())}</span>
          </span>
          <div className="rep-bar" aria-hidden="true">
            <div className="rep-bar-fill" style={{ width: `${fraction * 100}%` }} />
          </div>
          {next ? (
            <p className="note">{t('programme.toNext', { n: number(next.minReputation - reputation), rank: t(`rank.${next.id}`) })}</p>
          ) : (
            <p className="note">{t('programme.topRank')}</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('programme.ranks')}</h2>
          <span className="note">{t('programme.ranksLede')}</span>
        </div>
        <ol className="rank-list">
          {RANKS.map((r) => {
            const reached = reputation >= r.minReputation;
            return (
              <li key={r.id} className={`rank-row ${reached ? 'reached' : ''} ${r.id === rank.id ? 'current' : ''}`}>
                <span className="rank-threshold mono">{number(r.minReputation)}</span>
                <span className="rank-name">{t(`rank.${r.id}`)}</span>
                <span className="rank-gain">{gainText(r)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>{t('programme.tutorial')}</h2>
          <span className="mono">{t('programme.tutorialProgress', { done: number(levelsDone), total: number(LEVELS.length), reward: number(LEVEL_REWARD) })}</span>
        </div>
        <p className="note">{t('programme.tutorialLede')}</p>
        <div className="button-row">
          <button type="button" onClick={() => onGoTo('console')}>
            {t('programme.goConsole')}
          </button>
        </div>
      </section>

      {TIERS.map((tier) => (
        <section key={tier} className="panel">
          <div className="panel-head">
            <h2>{t(`programme.tier${tier}`)}</h2>
            <span className="note">{t(`programme.tier${tier}.lede`)}</span>
          </div>
          <ul className="mission-list">
            {MISSIONS.filter((m) => m.tier === tier).map((m) => {
              const state = missionState(m);
              const progress = state === 'open' && m.progress ? m.progress(context) : null;
              return (
                <li key={m.id} className={`mission ${state} ${m.reward < 0 ? 'penalty' : ''}`}>
                  <span className="mission-mark mono" aria-hidden="true">
                    {state === 'done' ? '✓' : state === 'locked' ? '🔒' : '○'}
                  </span>
                  <span className="mission-body">
                    <span className="mission-title">{t(`mission.${m.id}.title`)}</span>
                    <span className="mission-how">{t(`mission.${m.id}.how`)}</span>
                    {state === 'locked' && m.requiresRank && <span className="mission-lock">{t('mission.requires', { rank: t(`rank.${m.requiresRank}`) })}</span>}
                    {progress && <span className="mission-progress mono">{progress}</span>}
                  </span>
                  <span className={`mission-reward mono ${m.reward < 0 ? 'warn' : ''}`}>
                    {m.reward > 0 ? '+' : ''}
                    {number(m.reward)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="button-row">
        <button type="button" className="primary" onClick={() => onGoTo('analysis')}>
          {t('programme.goAnalysis')}
        </button>
      </div>
    </main>
  );
}
