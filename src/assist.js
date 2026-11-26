// Step 4 calls. Drafts and chats run on Gemini in the cloud through Firebase AI Logic;
// what the user types is first checked on this computer (Gemini Nano + rules) and
// personal details are swapped for placeholders before anything is sent.
import { draftModel, assistModel, liveModel } from './backend.js';
import { detectSensitive, parseJson } from './pipeline.js';
import { DRAFT_SCHEMAS, draftPrompt, SIDE_SCHEMA, sideSystem, liveSystem } from './assistPrompts.js';

const json = (schema) => ({ responseMimeType: 'application/json', responseJsonSchema: schema });

/** On-device privacy check for a chat message. Returns { redacted, hidden, usedLocalModel }. */
export async function guardText(text, vault) {
  const d = await detectSensitive(text);
  return { ...vault.hide(text, d.fields), usedLocalModel: d.usedLocalModel };
}

/** Draft an email / letter / call script / report checklist (placeholders kept). */
export async function writeDraft(kind, ctx) {
  const r = await draftModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: draftPrompt(kind, ctx) }] }],
    generationConfig: json(DRAFT_SCHEMAS[kind]),
  });
  return parseJson(r.response.text());
}

/** "Ask Plainly" side chat. history: [{ role: 'user'|'model', parts: [{ text }] }] in placeholder form. */
export async function askSide(history, message, ctx) {
  const chat = assistModel.startChat({ history, systemInstruction: sideSystem(ctx), generationConfig: json(SIDE_SCHEMA) });
  const r = await chat.sendMessage(message);
  const j = parseJson(r.response.text());
  return { reply: j.reply ?? '', revise: (j.revise_instruction ?? '').trim() };
}

/** Open-ended live chat. Returns the reply text (placeholder form). */
export async function askLive(history, message, ctx) {
  const chat = liveModel.startChat({ history, systemInstruction: liveSystem(ctx) });
  const r = await chat.sendMessage(message);
  return r.response.text();
}
