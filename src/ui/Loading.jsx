import { useEffect, useState } from 'react';
import { useLang } from '../i18n.jsx';

/** Small spinning ring. Decorative: the surrounding text carries the meaning. */
export function Spinner({ size = 18, light = false }) {
  return <span className={'spinner' + (light ? ' light' : '')} style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Seconds since `active` became true (0 when inactive). */
function useElapsed(active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) {
      setSecs(0);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => setSecs(Math.floor((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

/**
 * Status card shown while something is running.
 * `label` is an i18n key describing the current stage; it is announced to screen readers.
 */
export function LoadingCard({ label, compact = false, testid = 'loading' }) {
  const { t } = useLang();
  const secs = useElapsed(true);
  return (
    <div className={'loading-card' + (compact ? ' compact' : '')} role="status" aria-live="polite" data-testid={testid} data-stage={label}>
      <Spinner size={compact ? 18 : 22} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 600 }}>{t(label)}</span>
        <span className="muted" style={{ fontSize: 14 }}>
          {secs >= 5 ? t('load.elapsed', { s: secs }) : t('load.hint')}
        </span>
      </div>
    </div>
  );
}

/** Grey placeholder lines that shimmer while a draft is being written. */
export function Skeleton({ lines = 6 }) {
  return (
    <div className="skeleton" aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} style={{ width: `${[92, 100, 85, 96, 70, 88, 60][i % 7]}%` }} />
      ))}
    </div>
  );
}

/** Animated "typing" dots for chat replies. */
export function TypingBubble() {
  const { t } = useLang();
  return (
    <div className="msg msg-model typing" role="status" aria-live="polite" data-testid="typing">
      <span className="sr-only">{t('act.thinking')}</span>
      <span className="dots" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}
