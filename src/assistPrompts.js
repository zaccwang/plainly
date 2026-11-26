// Prompts and JSON schemas for step 4, "Take action".
// Everything here is sent to Gemini in the cloud, and only ever contains
// redacted text: real personal details are placeholders like [PERSON_NAME_1].

const LANG = { en: 'English', zh: 'Simplified Chinese', es: 'Spanish (formal "usted")' };

const PLACEHOLDER_RULES = `Personal details are hidden as placeholders in square brackets, e.g. [PERSON_NAME_1] or [ACCOUNT_NUMBER_1].
Use these placeholders EXACTLY wherever the detail belongs; the user's computer fills in the real values. Never guess real values and never invent new placeholders.
For the sender's own name, if it is not given, write "[Your name]".`;

const s = { type: 'string' };
const strings = { type: 'array', items: s };

export const DRAFT_SCHEMAS = {
  email: {
    type: 'object',
    properties: { subject: s, body: s, meaning: s },
    required: ['subject', 'body', 'meaning'],
  },
  plan: {
    type: 'object',
    properties: { body: s, meaning: s },
    required: ['body', 'meaning'],
  },
  call: {
    type: 'object',
    properties: {
      have_ready: { type: 'array', items: { type: 'object', properties: { label: s, value: s }, required: ['label', 'value'] } },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: { who: { type: 'string', enum: ['you_say', 'if_they_ask', 'you_ask'] }, text: s, meaning: s },
          required: ['who', 'text', 'meaning'],
        },
      },
    },
    required: ['have_ready', 'lines'],
  },
  report: {
    type: 'object',
    properties: {
      steps: { type: 'array', items: { type: 'object', properties: { text: s, meaning: s }, required: ['text', 'meaning'] } },
    },
    required: ['steps'],
  },
};

const TASKS = {
  email: `Write a short, polite email from the family to the sender's billing or customer-service office about this letter.
Ask them to confirm the amount and any open questions from the letter. If money is owed, ask whether a payment plan or financial assistance is available.
"body" is the email text with line breaks; "subject" is one line.`,
  plan: `Write a short formal letter requesting a monthly payment plan for the amount owed.
Start with the sender's name and address placeholders if they exist, then the recipient, a "Re:" line with the account placeholder, the request, and a sign-off.
{AMOUNT}`,
  call: `Prepare a phone call script for calling the sender about this letter.
"have_ready": 2-4 items the caller should have in front of them (label + value, values may be placeholders).
"lines": 4-6 short lines in order. who = "you_say" (what to say), "if_they_ask" (how to answer an identity question), or "you_ask" (questions to ask).
{SCAM_CALL}`,
  report: `This letter is probably a scam. List 3-5 concrete steps to stay safe and report it in the United States
(do not pay or use contact details from the letter; verify with the real organization using an official website or a card; report to the FTC at reportfraud.ftc.gov; warn family).
Each step is one short sentence.`,
};

export function draftPrompt(kind, { redactedLetter, lang, scamRisk, amount, instruction, previous }) {
  let task = TASKS[kind];
  task = task.replace(
    '{AMOUNT}',
    amount ? `The family can pay about ${amount} per month; propose that.` : 'No monthly amount was given; ask them to suggest an affordable plan.',
  );
  task = task.replace(
    '{SCAM_CALL}',
    scamRisk === 'high'
      ? 'The letter may be a scam: the script is for calling the REAL organization using a number from its official website, to check whether the letter is genuine. Never use the phone number from the letter.'
      : '',
  );
  const meaning =
    lang === 'en'
      ? 'Set every "meaning" field to an empty string.'
      : `Write in English, because it goes to a US organization. Put a short ${LANG[lang]} translation or explanation in each "meaning" field so the family understands it.`;
  const revise = instruction
    ? `\nREVISE the previous draft below. Change request from the user: "${instruction}". Keep everything else.\nPREVIOUS DRAFT (JSON):\n${JSON.stringify(previous)}`
    : '';
  return `You help a family deal with a confusing letter. ${task}
${meaning}
${PLACEHOLDER_RULES}
Keep it plain and calm, at a 6th-grade reading level.${revise}

LETTER (redacted):
"""
${redactedLetter}
"""`;
}

// ---------- "Ask Plainly" chat: the open draft, this letter, and general questions ----------
export const SIDE_SCHEMA = {
  type: 'object',
  properties: { reply: s, revise_instruction: s },
  required: ['reply', 'revise_instruction'],
};

export function sideSystem({ redactedLetter, lang, draftKind, draft }) {
  return `You are Plainly, a calm helper for older adults and their families in the United States.
You help with the letter below and its open draft, and you also answer general questions about medical bills, insurance (including Medicare and Medicaid), government benefits, taxes, utilities and scams.
Answer in ${LANG[lang]}. Be brief (under 100 words), concrete and calm; short paragraphs or a short list.
${PLACEHOLDER_RULES}
If the user asks to change the open draft (add, remove, reword, shorten, make more formal, etc.), set "revise_instruction" to a clear one-sentence instruction in English and say briefly in "reply" what you changed. Otherwise set "revise_instruction" to "".
If something sounds like a scam, say so clearly and explain how to verify using official contact details, never contact details from a suspicious letter or call.
Give general information, not legal, medical or financial advice; suggest official sources or free help (for example a State Health Insurance Assistance Program for Medicare questions) when useful. If a question is unrelated to these topics, politely steer back.

LETTER (redacted):
"""
${redactedLetter}
"""
OPEN DRAFT (${draftKind ?? 'none'}): ${draft ? JSON.stringify(draft) : 'none'}`;
}
