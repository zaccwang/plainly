import { useEffect, useRef, useState } from 'react';
import { CopyIcon, PhoneIcon, PrinterIcon, ShieldIcon, ArrowRightIcon } from './icons.jsx';
import { useLang } from '../i18n.jsx';
import { fillParts } from '../vault.js';
import { guardText, writeDraft, askSide } from '../assist.js';
import { LoadingCard, Skeleton, Spinner, TypingBubble } from './Loading.jsx';

// ---------- small icons for the action cards ----------
const base = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
const MailIcon = () => (<svg {...base}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>);
const CalendarIcon = () => (<svg {...base}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>);
const FlagIcon = () => (<svg {...base}><path d="M4 22V4" /><path d="M4 4h13l-2 4 2 4H4" /></svg>);
const CARD_ICON = { email: MailIcon, call: () => <PhoneIcon size={22} />, plan: CalendarIcon, report: FlagIcon };

/** Placeholder text rendered with real values filled in (green) on this computer. */
function Filled({ text, map }) {
  return fillParts(text, map).map((p, i) =>
    p.filled ? <mark key={i} className="filled">{p.text}</mark> : <span key={i}>{p.text}</span>,
  );
}

/** A user's chat message with the hidden parts shown as black bars. */
function UserText({ text, hidden }) {
  if (!hidden?.length) return text;
  const values = [...new Set(hidden.map((h) => h.text))].sort((a, b) => b.length - a.length);
  const re = new RegExp(`(${values.map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  return text.split(re).map((part, i) => (values.includes(part) ? <span key={i} className="bar">{part}</span> : <span key={i}>{part}</span>));
}

function Chat({ messages, busy, onSend, placeholder, footer, suggestions, map, testid, big }) {
  const { t } = useLang();
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [messages.length, busy]);
  const send = (text) => {
    const v = (text ?? draft).trim();
    if (!v || busy) return;
    setDraft('');
    onSend(v);
  };
  return (
    <>
      <div className={'chat-log' + (big ? ' big' : '')} data-testid={testid} aria-live="polite">
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="msg-user-wrap">
              <div className="msg msg-user"><UserText text={m.text} hidden={m.hidden} /></div>
              {m.hidden?.length > 0 && (
                <span className="hidden-note" data-testid="hidden-note">
                  <ShieldIcon size={14} sw={2.4} /> {t('act.hiddenN', { n: m.hidden.length })}
                </span>
              )}
            </div>
          ) : (
            <div key={i} className={'msg msg-model' + (m.error ? ' msg-error' : '')}>
              <span style={{ whiteSpace: 'pre-wrap' }}><Filled text={m.text} map={map} /></span>
              {m.revised && <span className="revised-note">{t('act.revised')}</span>}
            </div>
          ),
        )}
        {busy && <TypingBubble />}
        <div ref={endRef} />
      </div>
      {suggestions?.length > 0 && (
        <div className="row" style={{ gap: 8, padding: '0 20px 12px' }}>
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip" style={{ fontSize: 14 }} onClick={() => send(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}
      <div className="chat-input">
        <label className="row" style={{ gap: 8, alignItems: 'flex-end', flexWrap: 'nowrap' }}>
          <span className="sr-only">{t('act.messageLabel')}</span>
          <textarea
            rows={2}
            value={draft}
            placeholder={placeholder}
            data-testid={testid + '-input'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button type="button" className="send-btn" aria-label={t('act.send')} data-testid={testid + '-send'} onClick={() => send()} disabled={busy}>
            {busy ? <Spinner light /> : <ArrowRightIcon size={20} />}
          </button>
        </label>
        {footer}
      </div>
    </>
  );
}

// ---------- draft views ----------
function EmailView({ d, map }) {
  const { t } = useLang();
  return (
    <>
      <div className="mail-head">
        <span className="muted">{t('act.to')}</span>
        <span className="muted">{t('act.toValue')}</span>
        <span className="muted">{t('act.subject')}</span>
        <span data-testid="draft-subject"><Filled text={d.subject} map={map} /></span>
      </div>
      <div className="draft-body" data-testid="draft-body"><Filled text={d.body} map={map} /></div>
    </>
  );
}

function LetterView({ d, map }) {
  return <div className="draft-body letter-paper" data-testid="draft-body"><Filled text={d.body} map={map} /></div>;
}

function CallView({ d, map }) {
  const { t } = useLang();
  return (
    <>
      <div className="have-ready" data-testid="have-ready">
        <span className="eyebrow" style={{ gridColumn: '1 / -1' }}>{t('act.haveReady')}</span>
        {d.have_ready.map((h, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{h.label}</span>
            <span style={{ fontWeight: 600 }}><Filled text={h.value} map={map} /></span>
          </div>
        ))}
      </div>
      <ol className="script" data-testid="draft-body">
        {d.lines.map((l, i) => (
          <li key={i}>
            <span className="num" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>{i + 1}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)' }}>{t('act.who.' + l.who)}</span>
              <span lang="en" style={{ fontSize: 18 }}><Filled text={l.text} map={map} /></span>
              {l.meaning && <span style={{ fontSize: 15, color: 'var(--muted)' }}>{l.meaning}</span>}
            </span>
          </li>
        ))}
      </ol>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }} className="no-print">
        <span style={{ fontSize: 15, fontWeight: 600 }}>{t('act.notes')}</span>
        <textarea className="paste" rows={3} placeholder={t('act.notesPh')} style={{ fontFamily: 'var(--sans)' }} />
      </label>
    </>
  );
}

function ReportView({ d, map }) {
  return (
    <ol className="script" data-testid="draft-body">
      {d.steps.map((s, i) => (
        <li key={i}>
          <span className="num" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{i + 1}</span>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span lang="en" style={{ fontSize: 18 }}><Filled text={s.text} map={map} /></span>
            {s.meaning && <span style={{ fontSize: 15, color: 'var(--muted)' }}><Filled text={s.meaning} map={map} /></span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Plain-text version of a draft with real values, for copy / email / print. */
function draftText(kind, d, vault) {
  if (!d) return '';
  if (kind === 'call')
    return [...d.have_ready.map((h) => `${h.label}: ${h.value}`), '', ...d.lines.map((l, i) => `${i + 1}. ${l.text}`)].map((x) => vault.reveal(x)).join('\n');
  if (kind === 'report') return d.steps.map((s, i) => vault.reveal(`${i + 1}. ${s.text}`)).join('\n');
  return vault.reveal(d.body);
}

export default function Act({ doc, result, act, setAct, onBack }) {
  const { t, lang } = useLang();
  const { vault } = act;
  const risk = result.data.scam_risk;
  const kinds = risk === 'high' ? ['report', 'call'] : ['email', 'call', 'plan'];
  const kind = kinds.includes(act.kind) ? act.kind : kinds[0];
  const entry = act.drafts[kind]; // { data, lang, loading, error, edited }
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState(act.amount ?? '');
  const phone = doc.fields.find((f) => f.type === 'PHONE')?.text;
  const x = result.data[lang] ?? result.data.en;

  const update = (fn) => setAct((a) => fn(a));
  const setDraft = (k, patch) => update((a) => ({ ...a, drafts: { ...a.drafts, [k]: { ...a.drafts[k], ...patch } } }));

  const ctx = (extra = {}) => ({ redactedLetter: result.redacted, lang, scamRisk: risk, amount: act.amount, ...extra });

  const generate = async (k, extra = {}) => {
    setDraft(k, { loading: true, error: '' });
    try {
      const data = await writeDraft(k, ctx(extra));
      setDraft(k, { data, lang, loading: false, edited: null });
      return true;
    } catch (e) {
      setDraft(k, { loading: false, error: e.message });
      return false;
    }
  };

  // Write the draft the first time a card is opened, and again if the language changes.
  useEffect(() => {
    if (entry?.loading) return;
    if (!entry?.data && !entry?.error) generate(kind);
    else if (entry?.data && entry.lang !== lang) generate(kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, lang]);

  const revise = (instruction) => generate(kind, { instruction, previous: entry?.data });

  // ---------- side chat ----------
  const sendSide = async (text) => {
    const g = await guardText(text, vault);
    update((a) => ({ ...a, side: { ...a.side, busy: true, messages: [...a.side.messages, { role: 'user', text, hidden: g.hidden, kind }] } }));
    try {
      const openDraft = entry?.edited ? { text: vault.hide(entry.edited).redacted } : entry?.data;
      const r = await askSide(act.side.history, g.redacted, { redactedLetter: result.redacted, lang, draftKind: kind, draft: openDraft });
      let revised = false;
      if (r.revise && entry?.data) revised = await revise(r.revise);
      update((a) => ({
        ...a,
        side: {
          busy: false,
          messages: [...a.side.messages, { role: 'model', text: r.reply, revised }],
          history: [...a.side.history, { role: 'user', parts: [{ text: g.redacted }] }, { role: 'model', parts: [{ text: r.reply }] }],
        },
      }));
    } catch (e) {
      update((a) => ({ ...a, side: { ...a.side, busy: false, messages: [...a.side.messages, { role: 'model', text: `${t('act.err')} ${e.message}`, error: true }] } }));
    }
  };

  const fullText = entry?.edited ?? draftText(kind, entry?.data, vault);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText((kind === 'email' && entry?.data ? `${vault.reveal(entry.data.subject)}\n\n` : '') + fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  const mailto = entry?.data && kind === 'email'
    ? `mailto:?subject=${encodeURIComponent(vault.reveal(entry.data.subject))}&body=${encodeURIComponent(fullText)}`
    : null;

  const headings = { email: 'act.email.h', plan: 'act.plan.h', call: 'act.call.h', report: 'act.report.h' };
  const cardSub = (k) => (k === 'call' && risk === 'high' ? t('act.card.call.sVerify') : t(`act.card.${k}.s`));
  const meaning = entry?.data?.meaning;

  return (
    <div className="page act-page" style={{ maxWidth: 1240 }}>
      <div className="page-head no-print">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">{t('act.step')}</span>
          <h1>{t('act.title')}</h1>
        </div>
        <div className="context-pill">
          <span style={{ color: 'var(--ink-2)' }}>
            {t('doc.' + (doc.detect.docType ?? 'other'))}
            {x.amount_due && <> · <strong style={{ color: 'var(--ink)' }}>{x.amount_due}</strong></>}
            {x.deadline && <> · {x.deadline}</>}
          </span>
          <span className={'pill ' + ({ low: 'pill-green', medium: 'pill-amber', high: 'pill-red' }[risk] ?? 'pill-amber')} style={{ fontSize: 13, padding: '4px 10px' }}>
            {t('und.risk.' + risk).split(/[.。]/)[0]}
          </span>
        </div>
      </div>

      <div className="act-cols">
        <div className="act-main">
          <div className="action-cards no-print" role="group" aria-label={t('act.chooseAction')}>
            {kinds.map((k) => {
              const Icon = CARD_ICON[k];
              return (
                <button
                  key={k}
                  type="button"
                  className="action-card"
                  data-kind={k}
                  aria-pressed={k === kind}
                  onClick={() => update((a) => ({ ...a, kind: k }))}
                >
                  <span className="action-icon"><Icon /></span>
                  <span style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>{t(`act.card.${k}.t`)}</span>
                  <span style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.45 }}>{cardSub(k)}</span>
                </button>
              );
            })}
          </div>

          {(
            <section className="card draft-card" data-testid="draft">
              <div className="row spread">
                <h2 style={{ fontSize: 22 }}>{t(headings[kind])}</h2>
                {kind !== 'report' && <span className="pill pill-green" style={{ fontSize: 13, padding: '4px 10px' }}>{t('act.filledNote')}</span>}
              </div>

              {kind === 'plan' && (
                <div className="row no-print" style={{ gap: 10 }}>
                  <label htmlFor="amount" style={{ fontSize: 15, color: 'var(--ink-2)' }}>{t('act.amount')}</label>
                  <input id="amount" className="field" style={{ width: 120 }} value={amount} placeholder={t('act.amountPh')} onChange={(e) => setAmount(e.target.value)} />
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    disabled={entry?.loading}
                    onClick={() => {
                      update((a) => ({ ...a, amount }));
                      generate('plan', { amount });
                    }}
                  >
                    {entry?.loading && <Spinner size={16} />} {t('act.update')}
                  </button>
                </div>
              )}

              {entry?.loading && (
                <>
                  <LoadingCard label="load.draft" compact testid="drafting" />
                  <Skeleton lines={kind === 'call' ? 5 : 7} />
                </>
              )}
              {entry?.error && <div className="banner banner-error" role="alert">{t('act.err')} {entry.error}</div>}

              {entry?.data && !entry.loading && (
                <>
                  {entry.edited !== null && entry.edited !== undefined ? (
                    <textarea
                      className="paste"
                      rows={14}
                      value={entry.edited}
                      aria-label={t('act.edit')}
                      onChange={(e) => setDraft(kind, { edited: e.target.value })}
                    />
                  ) : (
                    <>
                      {kind === 'email' && <EmailView d={entry.data} map={vault.map} />}
                      {kind === 'plan' && <LetterView d={entry.data} map={vault.map} />}
                      {kind === 'call' && <CallView d={entry.data} map={vault.map} />}
                      {kind === 'report' && <ReportView d={entry.data} map={vault.map} />}
                    </>
                  )}
                  {meaning && (kind === 'email' || kind === 'plan') && (
                    <details className="meaning no-print" data-testid="meaning">
                      <summary>{t('act.meaning', { name: t('lang.name.' + lang) })}</summary>
                      <p>{meaning}</p>
                    </details>
                  )}
                </>
              )}

              {entry?.data && !entry.loading && (
                <div className="draft-actions no-print">
                  <div className="row" style={{ gap: 8 }}>
                    {kind !== 'report' && (
                      <>
                        <button type="button" className="chip" onClick={() => revise('Make it shorter.')}>{t('act.r.shorter')}</button>
                        <button type="button" className="chip" onClick={() => revise('Make it more formal.')}>{t('act.r.formal')}</button>
                        {kind !== 'call' && (
                          <button type="button" className="chip" onClick={() => revise('Politely mention that paying the full amount now would be a financial hardship.')}>
                            {t('act.r.hardship')}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    {(kind === 'email' || kind === 'plan') && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-small"
                        onClick={() => setDraft(kind, { edited: entry.edited == null ? draftText(kind, entry.data, vault) : null })}
                      >
                        {entry.edited == null ? t('act.edit') : t('act.doneEdit')}
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-small" onClick={copy}>
                      <CopyIcon size={16} /> {copied ? t('act.copied') : t('act.copy')}
                    </button>
                    {kind === 'email' && mailto && (
                      <a className="btn btn-primary btn-small" href={mailto} data-testid="mailto">{t('act.openEmail')}</a>
                    )}
                    {(kind === 'plan' || kind === 'report') && (
                      <button type="button" className="btn btn-primary btn-small" onClick={() => window.print()}>
                        <PrinterIcon size={16} /> {t('act.print')}
                      </button>
                    )}
                    {kind === 'call' && phone && risk === 'low' && (
                      <a className="btn btn-primary btn-small" href={`tel:${phone.replace(/[^\d+]/g, '')}`} data-testid="call-btn">
                        <PhoneIcon size={16} /> {t('act.callBtn', { phone })}
                      </a>
                    )}
                  </div>
                </div>
              )}
              {kind === 'call' && entry?.data && (
                <p className="muted no-print" style={{ fontSize: 14 }} data-testid="call-note">
                  {phone && risk === 'low' ? t('act.callNote') : t('act.callScamNote')}
                </p>
              )}
            </section>
          )}

          <div className="row spread no-print">
            <button type="button" className="btn-link" onClick={onBack}>{t('act.back')}</button>
          </div>
        </div>

        {(
          <aside className="card chat-card side-chat no-print" aria-label={t('act.side.title')} data-testid="side">
            <div className="chat-head">
              <h2 style={{ fontSize: 19 }}>{t('act.side.title')}</h2>
              <span className="muted" style={{ fontSize: 13 }}>{t('act.side.scope')}</span>
            </div>
            <Chat
              testid="side-chat"
              map={vault.map}
              messages={[{ role: 'model', text: t('act.side.hello') }, ...act.side.messages]}
              busy={act.side.busy}
              onSend={sendSide}
              placeholder={t('act.side.ph')}
              suggestions={act.side.messages.some((m) => m.kind === kind) ? [] : [1, 2, 3].map((i) => t(`act.side.${kind}.s${i}`))}
              footer={<span className="muted" style={{ fontSize: 13 }}>{t('act.side.foot')}</span>}
            />
          </aside>
        )}
      </div>
    </div>
  );
}
