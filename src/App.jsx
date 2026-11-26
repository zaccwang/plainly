import { useCallback, useEffect, useMemo, useState } from 'react';
import { warmUpLocalModel, localAvailability, isMock, configError } from './backend.js';
import { transcribeLocally, detectSensitive, explain } from './pipeline.js';
import { redact, rehydrateDeep } from './redact.js';
import { SAMPLES } from './samples.js';
import { LangContext, translate, LANG_IDS, langInfo } from './i18n.jsx';
import Rail from './ui/Rail.jsx';
import Intro from './ui/Intro.jsx';
import Drop from './ui/Drop.jsx';
import Review from './ui/Review.jsx';
import Understand from './ui/Understand.jsx';
import Eval from './ui/Eval.jsx';
import Act from './ui/Act.jsx';
import { Vault } from './vault.js';

const dev = new URLSearchParams(location.search).has('dev');
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;

// Browser storage is a convenience only: it may be blocked or empty.
const store = {
  get: (k) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const SCALES = [1, 1.15, 1.3];

export default function App() {
  const [lang, setLangState] = useState(() => (LANG_IDS.includes(store.get('plainly.lang')) ? store.get('plainly.lang') : 'en'));
  const [page, setPage] = useState(() => (store.get('plainly.introSeen') ? 'drop' : 'intro'));
  const [status, setStatus] = useState('checking');
  const [progress, setProgress] = useState(0);
  const [warming, setWarming] = useState(false);
  const [scale, setScale] = useState(() => Number(store.get('plainly.scale')) || 1);
  const [doc, setDoc] = useState(null); // { text, fields, detect, fresh }
  const [result, setResult] = useState(null); // { data, redacted, keptLocal, cloudError }
  const [readSteps, setReadSteps] = useState([]); // on-device steps from step 1
  const [trace, setTrace] = useState([]); // full protection timeline: { kind, title, detail, vars } (i18n keys)
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(null); // i18n key for what is running now
  const [error, setError] = useState(null); // { key, detail? }
  const [panelOpen, setPanelOpen] = useState(true);
  // Step 4 state for the current letter: placeholder vault, drafts, both chats. Memory only.
  const [act, setAct] = useState(null);

  const i18n = useMemo(
    () => ({
      lang,
      setLang: (l) => {
        setLangState(l);
        store.set('plainly.lang', l);
      },
      t: (k, v) => translate(lang, k, v),
    }),
    [lang],
  );
  const { t } = i18n;

  useEffect(() => {
    document.documentElement.lang = langInfo(lang).htmlLang;
  }, [lang]);

  const refreshStatus = useCallback(async () => setStatus(await localAvailability()), []);
  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const go = (p) => {
    setError(null);
    setPage(p);
    window.scrollTo(0, 0);
  };

  const start = () => {
    store.set('plainly.introSeen', '1');
    go('drop');
  };

  // Model download must be triggered by a user gesture (button click).
  const warmUp = async () => {
    setWarming(true);
    try {
      await warmUpLocalModel((p) => setProgress(p));
    } catch (e) {
      setError({ key: 'err.download', detail: e.message });
    }
    setWarming(false);
    refreshStatus();
  };

  const cycleScale = () => {
    const next = SCALES[(SCALES.indexOf(scale) + 1) % SCALES.length];
    setScale(next);
    store.set('plainly.scale', String(next));
  };

  // ---------- step 1 -> 2: read and detect on device ----------
  const analyze = async ({ text, file }) => {
    setBusy(true);
    setError(null);
    const steps = [];
    try {
      if (file) {
        setStage('load.photo');
        try {
          const r = await transcribeLocally(file);
          text = r.text;
          steps.push({ kind: 'local', title: 'trace.photo', detail: 'trace.photoDetail', vars: { s: secs(r.ms) } });
        } catch {
          // Privacy rule: without an on-device model we never upload the raw image.
          setError({ key: 'err.photo' });
          return;
        }
      }
      if (!text?.trim()) {
        setError({ key: 'err.empty' });
        return;
      }
      setStage('load.detect');
      const d = await detectSensitive(text);
      steps.push(
        d.usedLocalModel
          ? { kind: 'local', title: 'trace.found', detail: 'trace.foundDetail', vars: { n: d.fields.length, s: secs(d.ms) } }
          : { kind: 'local', title: 'trace.rules', detail: 'trace.rulesDetail' },
      );
      setDoc({ text, fields: d.fields, detect: d, fresh: true });
      setReadSteps(steps);
      setTrace(steps);
      setResult(null);
      go('review');
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const tryExample = () => {
    store.set('plainly.introSeen', '1');
    analyze({ text: SAMPLES[0].text });
  };

  // ---------- step 2 -> 3: send only the redacted text ----------
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const { redacted, map } = redact(doc.text, doc.fields);
      const hidden = doc.fields.filter((f) => f.enabled).length;
      const shown = doc.fields.length - hidden;
      const bytes = new Blob([redacted]).size;
      setStage('load.explain');
      const r = await explain(redacted, doc.detect.scamSignals, setStage);
      const data = rehydrateDeep(r.result, map); // real values restored on this device
      setTrace([
        ...readSteps,
        { kind: 'you', title: 'trace.reviewed', detail: 'trace.reviewedDetail', vars: { hidden, shown } },
        r.source === 'in_cloud'
          ? { kind: 'cloud', title: 'trace.cloud', detail: 'trace.cloudDetail', vars: { bytes, s: secs(r.ms) } }
          : { kind: 'local', title: 'trace.local', detail: 'trace.localDetail', vars: { s: secs(r.ms) } },
        { kind: 'local', title: 'trace.restored', detail: 'trace.restoredDetail', vars: { n: Object.keys(map).length } },
      ]);
      setResult({ data, redacted, keptLocal: hidden, cloudError: r.cloudError, source: r.source });
      setAct({
        vault: new Vault(map),
        kind: null,
        drafts: {},
        amount: '',
        side: { messages: [], history: [], busy: false },
        live: { messages: [], history: [], busy: false, include: false },
      });
      setPanelOpen(true);
      go('understand');
    } catch (e) {
      setError({ key: 'err.explain', detail: e.message });
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  const errorText = error ? `${t(error.key)}${error.detail ? ' ' + error.detail : ''}` : '';

  const banners = (
    <>
      {configError && (
        <div className="banner banner-warn no-print" role="status" style={{ marginBottom: 16 }}>
          <strong>{t('banner.setup')}</strong> <span lang="en">{configError}</span> {t('banner.setupBody')}{' '}
          <a href="?mock">{t('banner.setupLink')}</a>.
        </div>
      )}
      {isMock && (
        <div className="banner banner-warn no-print" role="status" style={{ marginBottom: 16 }}>
          <strong>{t('banner.mock')}</strong> {t('banner.mockBody')}
        </div>
      )}
    </>
  );

  return (
    <LangContext.Provider value={i18n}>
      <div style={{ zoom: scale }}>
        {page === 'intro' ? (
          <Intro
            status={status}
            progress={progress}
            warming={warming}
            onWarmUp={warmUp}
            cloud={configError ? 'notSetUp' : isMock ? 'mock' : 'connected'}
            onStart={start}
            onExample={tryExample}
            banners={<div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 32px' }}>{banners}</div>}
          />
        ) : (
          <div className="shell">
            <Rail
              page={page}
              go={go}
              canReview={!!doc}
              canUnderstand={!!result}
              canAct={!!result && !!act}
              dev={dev}
              scale={scale}
              cycleScale={cycleScale}
              panelOpen={panelOpen}
              togglePanel={() => setPanelOpen((o) => !o)}
            />
            <main className="main">
              <div style={{ maxWidth: 1200, margin: '0 auto' }}>{banners}</div>
              {page === 'drop' && <Drop status={status} busy={busy} stage={stage} error={errorText} onAnalyze={analyze} />}
              {page === 'review' && doc && (
                <Review doc={doc} setDoc={setDoc} busy={busy} stage={stage} error={errorText} onBack={() => go('drop')} onSend={send} />
              )}
              {page === 'understand' && result && (
                <Understand
                  result={result}
                  trace={trace}
                  panelOpen={panelOpen}
                  setPanelOpen={setPanelOpen}
                  onBack={() => go('review')}
                  onNext={() => go('act')}
                  onAnother={() => {
                    setDoc(null);
                    setResult(null);
                    setAct(null);
                    go('drop');
                  }}
                />
              )}
              {page === 'act' && result && act && (
                <Act doc={doc} result={result} act={act} setAct={setAct} onBack={() => go('understand')} />
              )}
              {page === 'eval' && <Eval />}
            </main>
          </div>
        )}
      </div>
    </LangContext.Provider>
  );
}
