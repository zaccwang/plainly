import { localTranscriber, localDetector, explainer, localExplainer, localExplainerTiny } from './backend.js';
import { TRANSCRIBE_PROMPT, detectPrompt, explainPrompt, localExplainPrompt, expandLocal } from './prompts.js';
import { ruleDetect, normalizeFields, plausibleFields } from './redact.js';

export function parseJson(text) {
  const s = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
  return JSON.parse(s);
}

async function fileToPart(file) {
  const b64 = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  return { inlineData: { data: b64, mimeType: file.type } };
}

/** Stage 1a — on-device only. Throws if no local model. */
export async function transcribeLocally(file) {
  if (!['image/png', 'image/jpeg'].includes(file.type))
    throw new Error('On-device model only accepts PNG or JPEG.');
  const t0 = performance.now();
  const r = await localTranscriber.generateContent([TRANSCRIBE_PROMPT, await fileToPart(file)]);
  return { text: r.response.text().trim(), ms: performance.now() - t0, source: r.response.inferenceSource };
}

/**
 * Stage 1b — sensitive-field detection.
 * Tries on-device model; always unions with regex rules.
 * Returns { fields, docType, scamSuspected, scamSignals, usedLocalModel, ms, error? }
 */
export async function detectSensitive(text) {
  const t0 = performance.now();
  const rule = ruleDetect(text);
  try {
    const r = await localDetector.generateContent(detectPrompt(text));
    const j = parseJson(r.response.text());
    const model = (j.sensitive_fields ?? []).map((f) => ({ ...f, source: 'model' }));
    return {
      fields: normalizeFields(text, [...plausibleFields(text, model), ...rule]),
      docType: j.doc_type,
      scamSuspected: !!j.scam_suspected,
      scamSignals: j.scam_signals ?? [],
      usedLocalModel: true,
      source: r.response.inferenceSource,
      ms: performance.now() - t0,
    };
  } catch (e) {
    return {
      fields: normalizeFields(text, rule),
      docType: 'other',
      scamSuspected: false,
      scamSignals: [],
      usedLocalModel: false,
      ms: performance.now() - t0,
      error: e.message,
    };
  }
}

/** Human-readable cloud error, including the HTTP status when the SDK gives one. */
export function describeError(e) {
  const status = e?.customErrorData?.status;
  const statusText = e?.customErrorData?.statusText;
  const msg = (e?.message ?? String(e)).replace(/^FirebaseError:\s*/, '');
  return status ? `${msg} (HTTP ${status}${statusText ? ' ' + statusText : ''})` : msg;
}

/**
 * Stage 3 — receives redacted text only.
 * Cloud first (English + Chinese). If the cloud fails, a shorter English-only
 * explanation on this computer. Returns { result, source, ms, cloudError? }.
 */
export async function explain(redactedText, scamSignals, onStage) {
  const t0 = performance.now();
  try {
    const r = await explainer.generateContent(explainPrompt(redactedText, scamSignals));
    return { result: parseJson(r.response.text()), source: 'in_cloud', ms: performance.now() - t0 };
  } catch (cloudErr) {
    console.error('[Plainly] Cloud explanation failed:', cloudErr, cloudErr?.customErrorData ?? '');
    const cloudError = describeError(cloudErr);
    onStage?.('load.fallback');
    let localErr;
    for (const [model, tiny] of [
      [localExplainer, false],
      [localExplainerTiny, true],
    ]) {
      try {
        const r = await model.generateContent(localExplainPrompt(redactedText, scamSignals, tiny));
        return { result: expandLocal(parseJson(r.response.text())), source: 'on_device', ms: performance.now() - t0, cloudError };
      } catch (e) {
        localErr = e;
        console.warn(`[Plainly] On-device explanation (${tiny ? 'tiny' : 'short'}) failed:`, e);
      }
    }
    throw new Error(`Cloud: ${cloudError}. On this computer: ${describeError(localErr)}`);
  }
}
