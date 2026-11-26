import { useState } from 'react';
import { ArrowRightIcon, CameraIcon, LaptopIcon } from './icons.jsx';
import { SAMPLES } from '../samples.js';
import { useLang } from '../i18n.jsx';
import { LoadingCard, Spinner } from './Loading.jsx';

const PILL_CLS = {
  available: 'pill-green',
  downloadable: 'pill-amber',
  downloading: 'pill-amber',
  unavailable: 'pill-red',
  'no-api': 'pill-red',
  'not-configured': 'pill-red',
  checking: 'pill-sand',
};

export default function Drop({ status, busy, stage, error, onAnalyze }) {
  const { t } = useLang();
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [over, setOver] = useState(false);

  const pickFile = (f) => {
    if (f) setFile(f);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="eyebrow">{t('drop.step')}</span>
          <h1>{t('drop.title')}</h1>
        </div>
        <span className={'pill ' + (PILL_CLS[status] ?? 'pill-sand')} data-testid="drop-status">
          <LaptopIcon size={16} sw={2.2} /> {t('drop.pill.' + status)}
        </span>
      </div>

      <div className="drop-cols">
        <div className="drop-main">
          <label
            className={'dropzone' + (over ? ' over' : '')}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pickFile(e.dataTransfer.files[0]);
            }}
          >
            <span className="icon"><CameraIcon size={30} /></span>
            {file ? (
              <>
                <span style={{ fontSize: 22, fontWeight: 600 }}>{file.name}</span>
                <span className="muted">{t('drop.fileReady')}</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 24, fontWeight: 600 }}>{t('drop.zoneTitle')}</span>
                <span className="muted" style={{ maxWidth: '46ch' }}>{t('drop.zoneBody')}</span>
                <span className="btn btn-dark btn-small" style={{ marginTop: 6 }}>{t('drop.choose')}</span>
              </>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg"
              aria-label={t('drop.chooseAria')}
              data-testid="file"
              onChange={(e) => pickFile(e.target.files[0])}
            />
          </label>

          <div className="divider">{t('drop.or')}</div>

          <label>
            <span className="sr-only">{t('drop.pasteLabel')}</span>
            <textarea
              className="paste"
              rows={5}
              placeholder={t('drop.pastePh')}
              value={text}
              data-testid="paste"
              onChange={(e) => {
                setText(e.target.value);
                setFile(null);
              }}
            />
          </label>

          {busy && stage && <LoadingCard label={stage} />}
          {error && <div className="banner banner-error" role="alert">{error}</div>}

          <div className="row spread">
            <div className="row" style={{ gap: 8 }}>
              <span className="muted" style={{ fontSize: 15, fontWeight: 500 }}>{t('drop.try')}</span>
              {SAMPLES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="chip"
                  data-sample={s.id}
                  onClick={() => {
                    setText(s.text);
                    setFile(null);
                  }}
                >
                  {t('sample.' + s.id)}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary"
              data-testid="analyze"
              disabled={busy || (!text.trim() && !file)}
              onClick={() => onAnalyze({ text, file })}
            >
              {busy ? <><Spinner light /> {t('drop.going')}</> : <>{t('drop.go')} <ArrowRightIcon size={20} /></>}
            </button>
          </div>
        </div>

        <aside className="card next-card">
          <h2 style={{ fontSize: 19 }}>{t('drop.nextTitle')}</h2>
          <div className="step">
            <span className="num" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>1</span>
            <span>
              {t('drop.next1a')} <strong style={{ color: 'var(--ink)' }}>{t('drop.next1b')}</strong> {t('drop.next1c')}
            </span>
          </div>
          <div className="step">
            <span className="num" style={{ background: 'var(--sand)', color: 'var(--ink)' }}>2</span>
            <span>
              {t('drop.next2a')} <strong style={{ color: 'var(--ink)' }}>{t('drop.next2b')}</strong>
            </span>
          </div>
          <div className="step">
            <span className="num" style={{ background: 'var(--blue-soft)', color: 'var(--blue)' }}>3</span>
            <span>{t('drop.next3')}</span>
          </div>
          <div className="muted" style={{ borderTop: '1px solid var(--sand)', paddingTop: 16, fontSize: 14 }}>
            {t('drop.worksBest')}
          </div>
        </aside>
      </div>
    </div>
  );
}
