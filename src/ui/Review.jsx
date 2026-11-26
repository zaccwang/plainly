import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertIcon, ArrowRightIcon, CloudIcon, LaptopIcon, ShieldIcon } from './icons.jsx';
import { redact, spans, normalizeFields } from '../redact.js';
import { PII_TYPES } from '../prompts.js';
import { useLang } from '../i18n.jsx';
import { LoadingCard, Spinner } from './Loading.jsx';

// Placeholder chips mirror exactly what the cloud receives, so they stay in English.
export const FRIENDLY = {
  PERSON_NAME: 'NAME',
  STREET_ADDRESS: 'ADDRESS',
  PHONE: 'PHONE',
  EMAIL: 'EMAIL',
  DATE_OF_BIRTH: 'BIRTH DATE',
  GOVERNMENT_ID: 'GOV ID',
  ACCOUNT_NUMBER: 'ACCOUNT',
  MEDICAL_DETAIL: 'MEDICAL',
  OTHER: 'DETAIL',
};

/** "[PERSON_NAME_2]" -> "NAME 2" */
export function phLabel(ph) {
  const m = ph.match(/^\[([A-Z_]+)_(\d+)\]$/);
  return m ? `${FRIENDLY[m[1]] ?? m[1].replace(/_/g, ' ')} ${m[2]}` : ph;
}

/** Render redacted text with placeholders as chips. */
export function CloudText({ text }) {
  return text.split(/(\[[A-Z_]+_\d+\])/).map((part, i) =>
    /^\[[A-Z_]+_\d+\]$/.test(part) ? (
      <span key={i} className="ph">{phLabel(part)}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function Review({ doc, setDoc, onBack, onSend, busy, stage, error }) {
  const { t, lang } = useLang();
  const letterRef = useRef(null);
  const [kind, setKind] = useState('PERSON_NAME');
  const [hint, setHint] = useState('');
  const { text, fields, detect } = doc;

  // The ink-in animation plays only the first time a letter is shown.
  useEffect(() => {
    if (!doc.fresh) return;
    const tm = setTimeout(() => setDoc((d) => ({ ...d, fresh: false })), 1600);
    return () => clearTimeout(tm);
  }, [doc.fresh, setDoc]);

  const segments = useMemo(() => spans(text, fields), [text, fields]);
  const { redacted } = useMemo(() => redact(text, fields), [text, fields]);
  const hidden = fields.filter((f) => f.enabled).length;
  const shown = fields.length - hidden;

  const toggle = (field) =>
    setDoc((d) => ({ ...d, fields: d.fields.map((f) => (f === field ? { ...f, enabled: !f.enabled } : f)) }));

  const hideSelection = () => {
    const sel = window.getSelection();
    const value = String(sel ?? '').trim();
    if (!value || !letterRef.current?.contains(sel.anchorNode)) {
      setHint('review.hintNoSel');
      return;
    }
    if (!text.includes(value)) {
      setHint('review.hintOneLine');
      return;
    }
    setHint('');
    sel.removeAllRanges();
    setDoc((d) => ({ ...d, fields: normalizeFields(d.text, [...d.fields, { text: value, type: kind, source: 'user' }]) }));
  };

  // Build the letter: plain text runs + clickable bars.
  const parts = [];
  let pos = 0;
  segments.forEach((s, i) => {
    if (s.start > pos) parts.push(<span key={'t' + i}>{text.slice(pos, s.start)}</span>);
    const f = s.field;
    const word = t('kind.' + f.type);
    parts.push(
      <button
        key={'f' + i}
        type="button"
        className={'redact' + (f.enabled ? '' : ' shown') + (doc.fresh ? ' animate' : '')}
        style={doc.fresh ? { animationDelay: `${150 + i * 90}ms` } : undefined}
        aria-label={f.enabled ? t('review.barHidden', { kind: word }) : t('review.barShown', { text: f.text })}
        title={f.enabled ? t('review.titleHidden', { kind: word }) : t('review.titleShown')}
        data-field={f.text}
        onClick={() => toggle(f)}
      >
        {text.slice(s.start, s.end)}
      </button>,
    );
    pos = s.end;
  });
  if (pos < text.length) parts.push(<span key="end">{text.slice(pos)}</span>);

  const sep = lang === 'zh' ? '；' : '; ';

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">{t('review.step')}</span>
          <h1>{t('review.title')}</h1>
          <p style={{ color: 'var(--ink-2)' }}>{t('review.sub')}</p>
        </div>
        <span className="pill pill-sand">
          {t('doc.' + (detect.docType ?? 'other'))} · {detect.usedLocalModel ? t('review.detected') : t('review.rules')}
        </span>
      </div>

      {!detect.usedLocalModel && (
        <div className="banner banner-warn" role="status" data-testid="rules-only">{t('review.noLocal')}</div>
      )}

      {detect.scamSuspected && (
        <div className="banner banner-error row" role="alert" data-testid="scam-warning" style={{ gap: 10, alignItems: 'flex-start' }}>
          <AlertIcon size={20} />
          <span>
            <strong>{t('review.scam')}</strong> {t('review.scamFound')} <span lang="en">{detect.scamSignals.join(sep)}</span>
          </span>
        </div>
      )}

      <div className="meter" data-testid="meter">
        <ShieldIcon size={28} />
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="big" data-testid="hidden-count">{hidden}</span> {t('review.hidden')}
        </div>
        <div className="sep" />
        <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
          <span className="big">{shown}</span> {t('review.shown')}
        </div>
        <div style={{ flexGrow: 1 }} />
        <span style={{ fontSize: 15, color: '#c9ccd3' }}>{t('review.zeroSent')}</span>
      </div>

      <div className="review-cols">
        <section className="review-col">
          <div className="col-label" style={{ color: 'var(--green)' }}>
            <LaptopIcon size={18} /> {t('review.yours')}
          </div>
          <div className="letter" ref={letterRef} data-testid="letter" lang="en">{parts}</div>
          <div className="row" style={{ gap: 10, fontSize: 15, color: 'var(--ink-2)' }}>
            <span>{t('review.missed')}</span>
            <label className="sr-only" htmlFor="kind">{t('review.kindLabel')}</label>
            <select id="kind" className="field" value={kind} onChange={(e) => setKind(e.target.value)}>
              {PII_TYPES.map((k) => {
                const w = t('kind.' + k);
                return <option key={k} value={k}>{w[0].toUpperCase() + w.slice(1)}</option>;
              })}
            </select>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              data-testid="hide-selection"
              style={{ borderColor: 'var(--ink)' }}
              onMouseDown={(e) => e.preventDefault() /* keep the text selection */}
              onClick={hideSelection}
            >
              {t('review.hideSel')}
            </button>
          </div>
          {hint && <div className="banner banner-warn" role="status">{t(hint)}</div>}
        </section>

        <section className="review-col" style={{ flexBasis: 400 }}>
          <div className="col-label" style={{ color: 'var(--blue)' }}>
            <CloudIcon size={18} /> {t('review.cloudSees')}
          </div>
          <div className="cloud" data-testid="cloud-preview" lang="en"><CloudText text={redacted} /></div>
          <p className="muted" style={{ fontSize: 15 }}>{t('review.bytes', { n: new Blob([redacted]).size })}</p>
        </section>
      </div>

      {busy && stage && <LoadingCard label={stage} />}
      {error && <div className="banner banner-error" role="alert">{error}</div>}

      <div className="actions">
        <button type="button" className="btn-link" data-testid="review-back" onClick={onBack}>{t('review.back')}</button>
        <div className="row">
          <span className="muted" style={{ fontSize: 15 }}>{t('review.both')}</span>
          <button type="button" className="btn btn-primary" data-testid="send" disabled={busy} onClick={onSend}>
            {busy ? <><Spinner light /> {t('review.sending')}</> : <>{t('review.send')} <ArrowRightIcon size={20} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
