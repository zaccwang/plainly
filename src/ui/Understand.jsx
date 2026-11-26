import { useEffect, useState } from 'react';
import { AlertIcon, ArrowRightIcon, CloseIcon, CopyIcon, PhoneIcon, PrinterIcon, ShieldCheckIcon, SpeakerIcon } from './icons.jsx';
import { CloudText } from './Review.jsx';
import { LangToggle, useLang, translate, langInfo } from '../i18n.jsx';

const RISK_PILL = { low: 'pill-green', medium: 'pill-amber', high: 'pill-red' };

/** Plain-text version of the explanation for copy and read-aloud. */
function asText(x, t, risk) {
  const field = (k, v) => (v ? [`${t(k)}: ${v}`] : []);
  const list = (k, arr, bullet) => (arr?.length ? ['', `${t(k)}:`, ...arr.map((s, i) => `${bullet(i)} ${s}`)] : []);
  return [
    x.one_line_summary,
    t('und.risk.' + risk),
    ...field('und.from', x.who_sent_it),
    ...field('und.wants', x.what_they_want),
    ...field('und.amount', x.amount_due),
    ...field('und.due', x.deadline),
    ...list('und.steps', x.action_steps, (i) => `${i + 1}.`),
    ...list('und.why', x.scam_reasons, () => '-'),
    ...list('und.ask', x.questions_to_ask, () => '-'),
  ].join('\n');
}

export function ProtectPanel({ trace, redacted, keptLocal, onClose }) {
  const { t } = useLang();
  return (
    <aside className="protect" aria-label={t('prot.title')} data-testid="protect-panel">
      <div className="row spread">
        <h2>{t('prot.title')}</h2>
        <button type="button" className="icon-btn" aria-label={t('prot.close')} data-testid="close-panel" onClick={onClose}>
          <CloseIcon size={18} />
        </button>
      </div>
      <div className="zero">
        <b>{keptLocal}</b>
        <span className="soft" style={{ fontSize: 15 }}>{t('prot.kept')}</span>
      </div>
      <ol className="timeline" data-testid="timeline">
        {trace.map((s, i) => (
          <li key={i} data-step={s.title}>
            <span className={'dot dot-' + s.kind}>{i + 1}</span>
            <strong style={{ fontSize: 16 }}>{t(s.title)}</strong>
            <span className="soft">{t(s.detail, s.vars)}</span>
          </li>
        ))}
      </ol>
      <details>
        <summary>{t('prot.seeSent')}</summary>
        <pre data-testid="sent-text" lang="en"><CloudText text={redacted} /></pre>
      </details>
    </aside>
  );
}

export default function Understand({ result, trace, panelOpen, setPanelOpen, onBack, onNext, onAnother }) {
  const { t, lang } = useLang();
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState(false);

  // The explanation follows the app language when that language came back.
  const contentLang = result.data[lang] ? lang : 'en';
  const x = result.data[contentLang];
  const tc = (k, v) => translate(contentLang, k, v); // labels that sit inside the explanation text
  const risk = result.data.scam_risk;

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [contentLang]);

  const readAloud = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(asText(x, tc, risk));
    u.lang = langInfo(contentLang).speech;
    u.rate = 0.92;
    u.onend = u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText(x, tc, risk));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked: ignore */
    }
  };

  return (
    <div className="page">
      <div className="und-cols">
        <div className="und-main">
          <div className="row spread no-print">
            <span className="eyebrow">{t('und.step')}</span>
            <div className="row" style={{ gap: 8 }}>
              <LangToggle />
              <button type="button" className="btn btn-ghost btn-small" onClick={readAloud} aria-pressed={speaking}>
                <SpeakerIcon size={18} /> {speaking ? t('und.stop') : t('und.readAloud')}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => window.print()}>
                <PrinterIcon size={18} /> {t('und.print')}
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
                <CopyIcon size={18} /> {copied ? t('und.copied') : t('und.copy')}
              </button>
            </div>
          </div>

          {result.cloudError && (
            <div className="banner banner-warn no-print" role="status" data-testid="cloud-fallback">
              <strong>{t('und.fallback')}</strong> {t('und.cloudError')} <code>{result.cloudError}</code>
            </div>
          )}
          {lang !== contentLang && !result.cloudError && (
            <div className="banner banner-warn no-print" role="status">{t('und.noLang', { name: t('lang.name.' + lang) })}</div>
          )}

          <div lang={langInfo(contentLang).htmlLang} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <section className="card result" data-testid="result">
              <span className={'pill ' + (RISK_PILL[risk] ?? 'pill-amber')} style={{ alignSelf: 'flex-start', fontSize: 16 }} data-testid="risk" data-risk={risk}>
                {risk === 'low' ? <ShieldCheckIcon size={18} sw={2.2} /> : <AlertIcon size={18} />} {tc('und.risk.' + risk)}
              </span>
              <h1 data-testid="summary">{x.one_line_summary}</h1>
              <div className="stats">
                {x.amount_due && (
                  <div className="stat">
                    <span className="k">{tc('und.amount')}</span>
                    <span className="v" style={{ fontVariantNumeric: 'tabular-nums' }}>{x.amount_due}</span>
                  </div>
                )}
                {x.deadline && (
                  <div className="stat warn">
                    <span className="k">{tc('und.due')}</span>
                    <span className="v">{x.deadline}</span>
                  </div>
                )}
                {x.who_sent_it && (
                  <div className="stat">
                    <span className="k">{tc('und.from')}</span>
                    <span className="v" style={{ fontSize: 19, fontWeight: 600 }}>{x.who_sent_it}</span>
                  </div>
                )}
              </div>
              {x.what_they_want && (
                <p style={{ color: 'var(--ink-2)' }}>
                  <strong style={{ color: 'var(--ink)' }}>{tc('und.wants')}:</strong> {x.what_they_want}
                </p>
              )}
              {x.scam_reasons?.length > 0 && (
                <div>
                  <strong>{tc('und.why')}</strong>
                  <ul className="reasons">{x.scam_reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}
            </section>

            <div className="lists">
              {x.action_steps?.length > 0 && (
                <section className="card list-card" style={{ flex: '3 1 340px' }}>
                  <h2>{tc('und.steps')}</h2>
                  {x.action_steps.map((st, i) => (
                    <label key={contentLang + i} className="check">
                      <input type="checkbox" />
                      <span>{st}</span>
                    </label>
                  ))}
                </section>
              )}
              {x.questions_to_ask?.length > 0 && (
                <section className="card list-card" style={{ flex: '2 1 260px' }}>
                  <h2>{tc('und.ask')}</h2>
                  {x.questions_to_ask.map((q, i) => (
                    <div key={i} className="ask">
                      <PhoneIcon size={20} style={{ flexShrink: 0, marginTop: 4, color: 'var(--blue)' }} />
                      <span style={{ fontSize: 17 }}>{q}</span>
                    </div>
                  ))}
                </section>
              )}
            </div>
          </div>

          <div className="row spread no-print">
            <button type="button" className="btn-link" onClick={onBack}>{t('und.back')}</button>
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={onAnother}>{t('und.another')}</button>
              <button type="button" className="btn btn-primary" data-testid="next-step" onClick={onNext}>
                {t('und.next')} <ArrowRightIcon size={20} />
              </button>
            </div>
          </div>
        </div>

        {panelOpen && (
          <ProtectPanel trace={trace} redacted={result.redacted} keptLocal={result.keptLocal} onClose={() => setPanelOpen(false)} />
        )}
      </div>
    </div>
  );
}
