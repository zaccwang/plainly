import { useState } from 'react';
import { detectSensitive } from '../pipeline.js';
import { SAMPLES } from '../samples.js';

// Character-level overlap between labelled sensitive spans and predicted spans.
function charCoverage(text, gold, pred) {
  const mark = (arr) => {
    const m = new Uint8Array(text.length);
    for (const t of arr) {
      let i = text.indexOf(t);
      while (i !== -1) {
        m.fill(1, i, i + t.length);
        i = text.indexOf(t, i + t.length);
      }
    }
    return m;
  };
  const g = mark(gold);
  const p = mark(pred);
  let tp = 0, gN = 0, pN = 0;
  for (let i = 0; i < text.length; i++) {
    gN += g[i];
    pN += p[i];
    tp += g[i] & p[i];
  }
  return { recall: gN ? tp / gN : 1, precision: pN ? tp / pN : 1 };
}

const pct = (x) => (x * 100).toFixed(0) + '%';

/** Developer page (?dev): on-device PII detection quality on the labelled samples. */
export default function Eval() {
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const out = [];
    for (const s of SAMPLES) {
      const d = await detectSensitive(s.text);
      out.push({ s, d, c: charCoverage(s.text, s.pii, d.fields.map((f) => f.text)) });
      setRows([...out]);
    }
    setRunning(false);
  };

  const avg = (k) => rows.reduce((a, r) => a + r.c[k], 0) / (rows.length || 1);
  const scamAcc = rows.filter((r) => r.d.scamSuspected === r.s.scam).length / (rows.length || 1);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <span className="eyebrow">Developer</span>
          <h1>Eval: on-device sensitive-field detection</h1>
        </div>
        <button type="button" className="btn btn-primary" onClick={run} disabled={running}>
          {running ? 'Running…' : `Run on the ${SAMPLES.length} test letters`}
        </button>
      </div>
      <div className="card" style={{ padding: 24 }}>
        <table data-testid="eval">
          <thead>
            <tr><th>Letter</th><th>Engine</th><th>PII recall</th><th>PII precision</th><th>Scam call</th><th>Latency</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id}>
                <td>{r.s.title}</td>
                <td>{r.d.usedLocalModel ? 'On-device model + rules' : 'Rules only'}</td>
                <td>{pct(r.c.recall)}</td>
                <td>{pct(r.c.precision)}</td>
                <td>{r.d.scamSuspected === r.s.scam ? 'Correct' : 'Wrong'}</td>
                <td>{Math.round(r.d.ms)} ms</td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="total">
                <td>Average</td><td /><td>{pct(avg('recall'))}</td><td>{pct(avg('precision'))}</td><td>{pct(scamAcc)}</td><td />
              </tr>
            )}
          </tbody>
        </table>
        <p className="muted" style={{ marginTop: 12, fontSize: 14 }}>
          Character-level: recall = share of labelled sensitive characters that were hidden; precision = share of hidden
          characters that were actually sensitive. Scores in mock mode are meaningless.
        </p>
      </div>
    </div>
  );
}
