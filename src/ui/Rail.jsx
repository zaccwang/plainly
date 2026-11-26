import { BookIcon, CheckIcon, ChartIcon, ShieldIcon } from './icons.jsx';
import { LangToggle, useLang } from '../i18n.jsx';

const STEPS = [
  { id: 'drop', n: 1, key: 'rail.drop' },
  { id: 'review', n: 2, key: 'rail.review' },
  { id: 'understand', n: 3, key: 'rail.understand' },
  { id: 'act', n: 4, key: 'rail.act' },
];
const ORDER = { drop: 1, review: 2, understand: 3, act: 4 };

/** Left toolbar the intro folds into. */
export default function Rail({ page, go, canReview, canUnderstand, canAct, dev, scale, cycleScale, panelOpen, togglePanel }) {
  const { t } = useLang();
  const enabled = { drop: true, review: canReview, understand: canUnderstand, act: canAct };
  const current = ORDER[page] ?? 0;
  return (
    <nav className="rail no-print" aria-label="Plainly">
      <div className="rail-logo" aria-hidden="true">P</div>
      <button type="button" className="rail-item" onClick={() => go('intro')}>
        <BookIcon />
        {t('rail.intro')}
      </button>
      <div className="rail-sep" />
      {STEPS.map((s) => {
        const done = enabled[s.id] && s.n < current;
        return (
          <button
            key={s.id}
            type="button"
            className={'rail-item' + (done ? ' done' : '')}
            aria-current={page === s.id ? 'page' : undefined}
            disabled={!enabled[s.id]}
            onClick={() => go(s.id)}
          >
            <span className="rail-num">{done ? <CheckIcon size={14} /> : s.n}</span>
            {t(s.key)}
          </button>
        );
      })}
      {page === 'understand' && (
        <>
          <div className="rail-sep" />
          <button type="button" className="rail-item" aria-pressed={panelOpen} onClick={togglePanel}>
            <ShieldIcon />
            {t('rail.privacy')}
          </button>
        </>
      )}
      {dev && (
        <button type="button" className="rail-item" aria-current={page === 'eval' ? 'page' : undefined} onClick={() => go('eval')}>
          <ChartIcon />
          {t('rail.eval')}
        </button>
      )}
      <div className="rail-spacer" />
      <LangToggle vertical />
      <button
        type="button"
        className="rail-item"
        aria-label={t('rail.textSize', { pct: Math.round(scale * 100) })}
        onClick={cycleScale}
        style={{ border: '1px solid var(--line)', fontSize: 15, fontWeight: 600, color: 'var(--ink)', marginTop: 4 }}
      >
        A+
      </button>
    </nav>
  );
}
