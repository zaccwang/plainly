// Deterministic redaction helpers. Pure functions, no network.
// Used (a) as a safety net on top of the on-device model, and
// (b) as the only redactor when no on-device model is available.

const PATTERNS = [
  { type: 'GOVERNMENT_ID', re: /\b\d{3}-\d{2}-\d{4}\b/g }, // SSN / ITIN
  { type: 'GOVERNMENT_ID', re: /\b[1-9][A-Z][A-Z0-9]\d-?[A-Z][A-Z0-9]\d-?[A-Z]{2}\d{2}\b/g }, // Medicare MBI
  { type: 'EMAIL', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: 'PHONE', re: /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { type: 'ACCOUNT_NUMBER', re: /\b(?:\d[ -]?){12,19}\b/g }, // card-like
  // Labelled identifiers: "Account #: AB-12345", "Member ID W123456789", "Claim No. 2026-0001"
  {
    type: 'ACCOUNT_NUMBER',
    re: /\b(?:account|acct|policy|member|patient|claim|invoice|reference|ref|case|group|subscriber|plate)\b(?:\s*(?:id|no\.?|number|#))?\s*[:#]?\s*((?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,})/gi,
    group: 1,
  },
  { type: 'ACCOUNT_NUMBER', re: /\bending(?:\s+in)?\s+(\d{4})\b/gi, group: 1 }, // "account ending 6612"
  {
    type: 'DATE_OF_BIRTH',
    re: /\b(?:DOB|date of birth|birth ?date)\s*[:\-]?\s*([0-1]?\d[/-][0-3]?\d[/-](?:19|20)?\d{2})/gi,
    group: 1,
  },
];

/** Regex-based detection. Returns [{text, type, source:'rule'}] */
export function ruleDetect(text) {
  const out = [];
  for (const { type, re, group } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = (group ? m[group] : m[0]).trim();
      if (value.length >= 4) out.push({ text: value, type, source: 'rule' });
    }
  }
  return out;
}

/** Keep only fields that literally occur in the text; dedupe; longest first. */
export function normalizeFields(text, fields) {
  const seen = new Map();
  for (const f of fields) {
    const t = (f.text ?? '').trim();
    if (t.length < 2 || !text.includes(t)) continue; // model hallucination guard
    if (!seen.has(t)) seen.set(t, { ...f, text: t, enabled: f.enabled ?? true }); // keep user toggles
  }
  // Drop fields fully contained in a longer field of the same occurrence
  const arr = [...seen.values()].sort((a, b) => b.text.length - a.text.length);
  return arr.filter((f, i) => !arr.slice(0, i).some((g) => g.text.includes(f.text)));
}

/**
 * Replace enabled fields with typed placeholders.
 * Returns { redacted, map } where map: placeholder -> original (kept in memory only).
 */
export function redact(text, fields) {
  const map = {};
  const counters = {};
  let redacted = text;
  const active = fields.filter((f) => f.enabled).sort((a, b) => b.text.length - a.text.length);
  for (const f of active) {
    counters[f.type] = (counters[f.type] ?? 0) + 1;
    const ph = `[${f.type}_${counters[f.type]}]`;
    map[ph] = f.text;
    redacted = redacted.split(f.text).join(ph);
  }
  return { redacted, map };
}

/** Put real values back into the cloud's answer, locally. */
export function rehydrate(str, map) {
  if (typeof str !== 'string') return str;
  return str.replace(/\[[A-Z_]+_\d+\]/g, (ph) => map[ph] ?? ph);
}

export function rehydrateDeep(obj, map) {
  if (Array.isArray(obj)) return obj.map((x) => rehydrateDeep(x, map));
  if (obj && typeof obj === 'object')
    return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, rehydrateDeep(v, map)]));
  return rehydrate(obj, map);
}

/** Simple span list for highlighting: [{start,end,field}] non-overlapping. */
export function spans(text, fields) {
  const out = [];
  for (const f of fields) {
    let i = text.indexOf(f.text);
    while (i !== -1) {
      if (!out.some((s) => i < s.end && i + f.text.length > s.start))
        out.push({ start: i, end: i + f.text.length, field: f });
      i = text.indexOf(f.text, i + f.text.length);
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Privacy check for a short CHAT message (not a letter).
 * The on-device model over-flags chat text (a whole question, or single ordinary
 * words like "appeal" or "insurance"). Hiding those sends Gemini a scrambled
 * message, so in chat a model guess is only kept when it looks like a real detail:
 * - it contains a digit (IDs, account and phone numbers, dates, street addresses), or
 * - it is a full name: 2-4 capitalized words, or 2-4 CJK characters, or
 * - it is a specific medical term (2+ words, or one long word that isn't generic).
 * Rule matches (numbers, IDs, emails) are always kept, and values already known
 * from the letter are hidden separately by the Vault.
 */
const GENERIC = new Set(
  'insurance insurer denial denied appeal claim claims bill bills billing medicare medicaid coverage covered benefit benefits payment payments deductible copay premium hospital doctor medical health letter notice scam scams account statement balance refund question questions something anything everything'.split(' '),
);
export function chatFields(text, fields) {
  const len = text.trim().length;
  return fields.filter((f) => {
    if (f.source === 'rule') return true;
    const t = (f.text ?? '').trim();
    if (!t || t.length > 60 || t.length >= 0.6 * len || /[?？¿]$/.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (words.length > 6) return false;
    if (/\d/.test(t)) return true;
    if (f.type === 'PERSON_NAME') {
      const cjk = /^[\u4e00-\u9fff]{2,4}$/.test(t);
      const latin = words.length >= 2 && words.length <= 4 && words.every((w) => /^[A-Z][\p{L}'’.-]+$/u.test(w));
      return cjk || latin;
    }
    if (f.type === 'MEDICAL_DETAIL') {
      if (words.some((w) => GENERIC.has(w.toLowerCase()))) return false;
      return words.length >= 2 || t.length >= 8;
    }
    return false; // OTHER, STREET_ADDRESS without a number, etc.
  });
}

/**
 * Drop model guesses that don't fit their line. The on-device model sometimes labels
 * ordinary dates (statement date, service date, due date) as DATE_OF_BIRTH; only keep
 * those when the line they appear on actually talks about a birth date.
 */
export function plausibleFields(text, fields) {
  const lines = text.split('\n');
  const BIRTH = /birth|\bdob\b|born|nacimiento|出生|生日/i;
  return fields.filter((f) => {
    if (f.source !== 'model' || f.type !== 'DATE_OF_BIRTH') return true;
    return lines.some((l) => l.includes(f.text) && BIRTH.test(l));
  });
}
