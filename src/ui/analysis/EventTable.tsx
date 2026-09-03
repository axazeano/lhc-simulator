import { useMemo, useState } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import type { EventStore } from '../../physics/collision/eventStore';

interface Props {
  store: EventStore;
  version: number;
  /** Mask of records passing the active selection. */
  mask: Uint8Array;
  selected: number | null;
  onSelect(index: number): void;
}

const PAGE = 25;
type Sort = 'newest' | 'massDesc' | 'massAsc';

export function EventTable({ store, version, mask, selected, onSelect }: Props) {
  const { t, number } = useI18n();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Sort>('newest');

  // Indices of passing records in the requested order.
  const order = useMemo(() => {
    const c = store.columns;
    const indices: number[] = [];
    for (let i = 0; i < c.count; i++) if (mask[i] === 1) indices.push(i);
    if (sort === 'newest') indices.reverse();
    else indices.sort((a, b) => (sort === 'massDesc' ? c.mass[b]! - c.mass[a]! : c.mass[a]! - c.mass[b]!));
    return indices;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, version, mask, sort]);

  const pages = Math.max(1, Math.ceil(order.length / PAGE));
  const current = Math.min(page, pages - 1);
  const indices = order.slice(current * PAGE, current * PAGE + PAGE);
  const rows = indices.map((i) => store.get(i));

  return (
    <section className="panel event-table" aria-labelledby="events-title">
      <div className="panel-head">
        <h2 id="events-title">{t('events.title')}</h2>
        <label className="sort">
          <span className="eyebrow">{t('events.sort')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">{t('events.newest')}</option>
            <option value="massDesc">{t('events.massDesc')}</option>
            <option value="massAsc">{t('events.massAsc')}</option>
          </select>
        </label>
      </div>
      <p className="note">
        {t('events.showing', { from: order.length === 0 ? 0 : current * PAGE + 1, to: Math.min(order.length, (current + 1) * PAGE), total: order.length })}
      </p>
      <div className="tbl-wrap">
        <table>
          <thead>
            <tr>
              <th className="n">{t('events.mass')}</th>
              <th className="n">{t('events.weight')}</th>
              <th className="n">{t('events.fill')}</th>
              <th className="n">{t('events.sqrtS')}</th>
              <th>{t('events.particles')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr
                key={`${current}-${k}`}
                className={`clickable ${indices[k] === selected ? 'selected' : ''}`}
                onClick={() => onSelect(indices[k]!)}
                title={t('events.open')}
              >
                <td className="n">{number(r.massGeV, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td className="n">{number(r.weight, { maximumFractionDigits: 1 })}</td>
                <td className="n">#{r.fill}</td>
                <td className="n">{number(r.sqrtSGeV / 1000, { maximumFractionDigits: 2 })}</td>
                <td className="mono particles">
                  {r.particles.map((p, i) => (
                    <span key={i} className="particle">
                      {t(`kind.${p.kind}`)}
                      {p.charge > 0 ? '⁺' : p.charge < 0 ? '⁻' : ''} {number(p.ptGeV, { maximumFractionDigits: 1 })} / {number(p.eta, { maximumFractionDigits: 2, signDisplay: 'always' })}
                    </span>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="button-row">
        <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0}>
          {t('events.prev')}
        </button>
        <span className="mono page-indicator">
          {current + 1} / {pages}
        </span>
        <button type="button" onClick={() => setPage(Math.min(pages - 1, current + 1))} disabled={current >= pages - 1}>
          {t('events.next')}
        </button>
      </div>
      <p className="note">{t('events.weightNote')} {t('events.clickNote')}</p>
    </section>
  );
}
