// All prompts and JSON schemas in one place, so the same contract is used
// on-device (Chrome Prompt API / Gemini Nano) and in the cloud (Gemini).

// ---------- Stage 1a: on-device transcription (image -> text) ----------
export const TRANSCRIBE_PROMPT = `You are an OCR assistant. Transcribe ALL text in this image of a letter, bill or notice exactly as written.
Keep line breaks. Do not summarize, translate, explain or add anything. Output only the transcribed text.`;

// ---------- Stage 1b: on-device sensitive-field detection ----------
export const PII_TYPES = [
  'PERSON_NAME',
  'STREET_ADDRESS',
  'PHONE',
  'EMAIL',
  'DATE_OF_BIRTH',
  'GOVERNMENT_ID', // SSN, ITIN, driver license, passport, Medicare/MBI
  'ACCOUNT_NUMBER', // bank, card, policy, member, claim, patient, invoice ids
  'MEDICAL_DETAIL', // diagnosis, procedure, medication
  'OTHER',
];

export const DOC_TYPES = [
  'medical_bill',
  'insurance_eob',
  'tax_notice',
  'government_letter',
  'bank_or_credit',
  'utility_or_toll',
  'collections',
  'marketing',
  'other',
];

export const DETECT_SCHEMA = {
  type: 'object',
  properties: {
    doc_type: { type: 'string', enum: DOC_TYPES },
    sensitive_fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          type: { type: 'string', enum: PII_TYPES },
        },
        required: ['text', 'type'],
      },
    },
    scam_suspected: { type: 'boolean' },
    scam_signals: { type: 'array', items: { type: 'string' } },
  },
  required: ['doc_type', 'sensitive_fields', 'scam_suspected', 'scam_signals'],
};

export function detectPrompt(letterText) {
  return `You protect a family's privacy before a letter is sent to a cloud AI.
Read the letter below and return JSON.

sensitive_fields: list EVERY piece of text that identifies a person or account. Copy each value EXACTLY as it appears (same spelling, spacing and punctuation) so it can be found with string search. Include: people's names, street addresses, phone numbers, emails, dates of birth, SSN/ITIN/Medicare/driver-license numbers, and any account, policy, member, claim, patient, card or invoice number. Also include specific diagnoses or procedures as MEDICAL_DETAIL. Do NOT include company or agency names, generic dates, or dollar amounts.

scam_suspected / scam_signals: flag pressure tactics, threats of arrest or lawsuits, demands for gift cards, wire transfers or crypto, unusual payment links or phone numbers, mismatched sender names, or spelling errors typical of fraud. Use short phrases.

doc_type: the best category.

LETTER:
"""
${letterText}
"""`;
}

// ---------- Stage 3: cloud explanation on REDACTED text only ----------
// One call returns English, Simplified Chinese AND Spanish so the UI can switch instantly.
const EXPLANATION = {
  type: 'object',
  properties: {
    one_line_summary: { type: 'string' },
    who_sent_it: { type: 'string' },
    what_they_want: { type: 'string' },
    amount_due: { type: 'string' },
    deadline: { type: 'string' },
    action_steps: { type: 'array', items: { type: 'string' } },
    scam_reasons: { type: 'array', items: { type: 'string' } },
    questions_to_ask: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'one_line_summary',
    'who_sent_it',
    'what_they_want',
    'amount_due',
    'deadline',
    'action_steps',
    'scam_reasons',
    'questions_to_ask',
  ],
};

export const EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    scam_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    en: EXPLANATION,
    zh: EXPLANATION,
    es: EXPLANATION,
  },
  required: ['scam_risk', 'en', 'zh', 'es'],
};

export function explainPrompt(redactedText, localScamSignals) {
  return `You help an adult child explain a confusing letter to their elderly parent.
Personal details were removed on the user's device and replaced by placeholders in square brackets, such as a name or account placeholder.
Keep every placeholder from the letter EXACTLY as written whenever you refer to that detail; never guess the real value and never invent new placeholders.

Return the same explanation three times: "en" in plain English, "zh" in Simplified Chinese and "es" in Spanish (formal "usted", Latin American wording), all at a 6th-grade reading level. Be concrete and calm.
- amount_due / deadline: copy from the letter, or "none stated" (zh: "未注明", es: "no se indica").
- action_steps: 2-5 short steps in order. If it may be a scam, the first step must be to verify using a phone number from an official website or the back of a card, NOT the number in the letter.
- questions_to_ask: what to ask the sender, insurer or provider when calling.
- scam_reasons: empty when scam_risk is "low".
- scam_risk: consider these on-device signals too: ${JSON.stringify(localScamSignals ?? [])}

LETTER (redacted):
"""
${redactedText}
"""`;
}

// ---------- Stage 3 fallback: on-device, English only, as small as possible ----------
// Gemini Nano has a small output budget, so the fallback uses a flat schema
// with short string limits, and a second "tiny" schema if that still overflows.
const short = (n) => ({ type: 'string', maxLength: n });

export const LOCAL_EXPLAIN_SCHEMA = {
  type: 'object',
  properties: {
    scam_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: short(160),
    amount_due: short(40),
    deadline: short(40),
    steps: { type: 'array', items: short(110), maxItems: 3 },
  },
  required: ['scam_risk', 'summary', 'amount_due', 'deadline', 'steps'],
};

export const LOCAL_TINY_SCHEMA = {
  type: 'object',
  properties: {
    scam_risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    summary: short(140),
  },
  required: ['scam_risk', 'summary'],
};

export function localExplainPrompt(redactedText, localScamSignals, tiny = false) {
  const what = tiny
    ? 'Return JSON with scam_risk and ONE short summary sentence (under 25 words).'
    : 'Return JSON: scam_risk; summary (one sentence, under 25 words); amount_due and deadline copied from the letter or "none stated"; steps (at most 3, each under 15 words).';
  return `Explain this letter to an elderly reader in plain English. ${what}
Placeholders in square brackets stand for hidden personal details: keep them exactly as written.
If it may be a scam, say so and say not to pay or call the number in the letter. On-device scam signals: ${JSON.stringify(localScamSignals ?? [])}

LETTER (redacted):
"""
${redactedText.slice(0, 3000)}
"""`;
}

/** Turn the small on-device answer into the same shape the UI uses for the cloud answer. */
export function expandLocal(j) {
  return {
    scam_risk: j.scam_risk ?? 'medium',
    en: {
      one_line_summary: j.summary ?? '',
      who_sent_it: '',
      what_they_want: '',
      amount_due: j.amount_due ?? '',
      deadline: j.deadline ?? '',
      action_steps: j.steps ?? [],
      scam_reasons: [],
      questions_to_ask: [],
    },
  };
}
