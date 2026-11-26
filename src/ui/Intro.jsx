import { ArrowDownIcon, CheckIcon, CloudIcon, LaptopIcon } from './icons.jsx';
import { LangToggle, useLang } from '../i18n.jsx';

const LOCAL_PILL = {
  available: 'pill-green',
  downloadable: 'pill-amber',
  downloading: 'pill-amber',
  unavailable: 'pill-red',
  'no-api': 'pill-red',
  'not-configured': 'pill-red',
  checking: 'pill-sand',
};

export default function Intro({ status, progress, onWarmUp, warming, cloud, onStart, onExample, banners }) {
  const { t } = useLang();
  const canDownload = status === 'downloadable' || status === 'downloading';
  const cloudOk = cloud === 'connected' || cloud === 'mock';
  return (
    <div>
      <header className="intro-head">
        <div className="brand">
          <div className="rail-logo" style={{ margin: 0, width: 40, height: 40 }} aria-hidden="true">P</div>
          Plainly
        </div>
        <nav className="row" style={{ gap: 20 }}>
          <a href="#how" style={{ textDecoration: 'none', fontWeight: 500, color: 'var(--ink-2)' }}>{t('intro.how')}</a>
          <a href="#setup" style={{ textDecoration: 'none', fontWeight: 500, color: 'var(--ink-2)' }}>{t('intro.setupNav')}</a>
          <LangToggle />
          <button type="button" className="btn btn-ghost btn-small" onClick={onStart}>{t('intro.open')}</button>
        </nav>
      </header>
      {banners}

      <section className="hero">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <span className="pill pill-green" style={{ alignSelf: 'flex-start' }}>{t('intro.badge')}</span>
          <h1>{t('intro.title1')}<br />{t('intro.title2')}</h1>
          <p className="hero-lede">{t('intro.lede')}</p>
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-primary" data-testid="get-started" onClick={onStart}>{t('intro.start')}</button>
            <button type="button" className="btn btn-ghost" onClick={onExample}>{t('intro.example')}</button>
          </div>
        </div>

        <div role="img" aria-label={t('intro.figAlt')} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="letter-mini" lang="en">
            <div className="head">CASCADE VALLEY MEDICAL CENTER</div>
            <div>Patient: <span className="bar">Mei-Ling Zhou</span></div>
            <div>Account #: <span className="bar">CVMC-8841207</span></div>
            <div>Diagnosis: <span className="bar">atrial fibrillation</span></div>
            <div>Patient balance due: <strong>$581.50</strong></div>
          </div>
          <div className="row muted" style={{ paddingLeft: 32, fontSize: 14, fontWeight: 500 }}>
            <ArrowDownIcon size={20} /> {t('intro.onlyHidden')}
          </div>
          <div className="cloud-mini" lang="en">
            <div style={{ font: '600 13px var(--sans)', color: 'var(--blue)', marginBottom: 4 }}>{t('intro.cloudSees')}</div>
            <div>Patient: <span className="ph">NAME 1</span></div>
            <div>Account #: <span className="ph">ACCOUNT 1</span></div>
            <div>Diagnosis: <span className="ph">MEDICAL 1</span></div>
          </div>
        </div>
      </section>

      <section id="how" className="band">
        <div className="band-inner">
          <h2 style={{ fontSize: 32 }}>{t('intro.how')}</h2>
          <div className="how-grid">
            <div className="how-card">
              <div className="tag" style={{ color: 'var(--green)' }}><LaptopIcon /> {t('intro.tag1')}</div>
              <h3 style={{ fontSize: 21 }}>{t('intro.h1')}</h3>
              <p>{t('intro.p1')}</p>
            </div>
            <div className="how-card">
              <div className="tag"><CheckIcon size={22} sw={2} /> {t('intro.tag2')}</div>
              <h3 style={{ fontSize: 21 }}>{t('intro.h2')}</h3>
              <p>{t('intro.p2')}</p>
            </div>
            <div className="how-card">
              <div className="tag" style={{ color: 'var(--blue)' }}><CloudIcon /> {t('intro.tag3')}</div>
              <h3 style={{ fontSize: 21 }}>{t('intro.h3')}</h3>
              <p>{t('intro.p3')}</p>
            </div>
          </div>
        </div>
      </section>

      <section id="setup" className="setup">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <h2 style={{ fontSize: 32 }}>{t('intro.setupTitle')}</h2>
          <p style={{ color: 'var(--ink-2)', maxWidth: '44ch' }}>{t('intro.setupBody')}</p>
        </div>
        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="row spread">
            <span style={{ fontWeight: 600 }}>{t('intro.localAi')}</span>
            <span className={'pill ' + (LOCAL_PILL[status] ?? 'pill-sand')} data-testid="local-status" data-status={status}>
              {t('status.' + status)}
            </span>
          </div>
          {(canDownload || warming) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row spread" style={{ fontSize: 15, color: 'var(--ink-2)' }}>
                <span>{t('intro.downloading')}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums' }}>{Math.round(progress * 100)}%</span>
              </div>
              <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
                <div style={{ width: `${progress * 100}%` }} />
              </div>
              {!warming && (
                <button type="button" className="btn btn-ghost btn-small" style={{ alignSelf: 'flex-start' }} onClick={onWarmUp}>
                  {t('intro.download')}
                </button>
              )}
            </div>
          )}
          <div className="row spread">
            <span style={{ fontWeight: 600 }}>{t('intro.cloudAi')}</span>
            <span className={'pill ' + (cloudOk ? 'pill-green' : 'pill-red')}>
              {t(cloud === 'connected' ? 'cloud.connected' : cloud === 'mock' ? 'cloud.mock' : 'cloud.notSetUp')}
            </span>
          </div>
          <button type="button" className="btn btn-dark" style={{ justifyContent: 'center' }} onClick={onStart}>
            {t('intro.continue')}
          </button>
        </div>
      </section>

      <footer className="foot">{t('intro.footer')}</footer>
    </div>
  );
}
