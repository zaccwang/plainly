// Mock backend: same exports as firebase.js, no network, no Firebase.
// Lets you test the UI flow (and lets CI run a browser smoke test).
// Enable with ?mock in the URL or VITE_MOCK=1.
import { SAMPLES } from './samples.js';

export const CLOUD_MODEL = 'mock-cloud';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const resp = (text, source) => ({ response: { text: () => text, inferenceSource: source } });

// Simulate devices: ?mock=nolocal pretends there is no on-device model;
// ?mock=nocloud pretends the cloud request fails.
const mockMode = new URLSearchParams(location.search).get('mock');
const noLocal = mockMode === 'nolocal';
// ?mock=tinyfallback: cloud fails AND the short on-device answer overflows.
const noCloud = mockMode === 'nocloud' || mockMode === 'tinyfallback';
const shortOverflows = mockMode === 'tinyfallback';
const needLocal = () => {
  if (noLocal) throw new Error('Inference mode is ONLY_ON_DEVICE, but an on-device model is not available.');
};

const TYPES = {
  medical_bill: ['PERSON_NAME', 'DATE_OF_BIRTH', 'ACCOUNT_NUMBER', 'STREET_ADDRESS', 'MEDICAL_DETAIL'],
  insurance_eob: ['PERSON_NAME', 'ACCOUNT_NUMBER', 'ACCOUNT_NUMBER', 'ACCOUNT_NUMBER', 'MEDICAL_DETAIL'],
  toll_scam: ['PERSON_NAME', 'ACCOUNT_NUMBER', 'ACCOUNT_NUMBER'],
  tax_notice: ['PERSON_NAME', 'GOVERNMENT_ID', 'STREET_ADDRESS', 'ACCOUNT_NUMBER'],
};

export const localTranscriber = {
  async generateContent() {
    needLocal();
    await sleep(300);
    return resp(SAMPLES[0].text, 'on_device');
  },
};

export const localDetector = {
  async generateContent(prompt) {
    needLocal();
    await sleep(200);
    const s = SAMPLES.find((x) => prompt.includes(x.text));
    // Like the real Gemini Nano sometimes does: flag a whole short chat message as one "detail".
    const typed = prompt.split('LETTER:')[1]?.split('"""')[1]?.trim();
    // ...or single ordinary words, labelled with whatever type (seen with the real model).
    const TYPES_CYCLE = ['PERSON_NAME', 'OTHER', 'MEDICAL_DETAIL'];
    const wordFlags = (typed ?? '')
      .split(/[^\p{L}]+/u)
      .filter((w) => w.length >= 2)
      .map((w, i) => ({ text: w, type: TYPES_CYCLE[i % 3] }));
    const overFlag = !s && typed && typed.length < 120 ? [{ text: typed, type: 'OTHER' }, ...wordFlags] : [];
    return resp(
      JSON.stringify({
        doc_type: { tax_notice: 'tax_notice', toll_scam: 'utility_or_toll', insurance_eob: 'insurance_eob' }[s?.id] ?? 'medical_bill',
        sensitive_fields: s ? s.pii.map((t, i) => ({ text: t, type: TYPES[s.id]?.[i] ?? 'OTHER' })) : overFlag,
        scam_suspected: !!s?.scam,
        scam_signals: s?.scam ? ['24-hour deadline', 'gift card payment', 'unofficial payment link'] : [],
      }),
      'on_device',
    );
  },
};

export const explainer = {
  async generateContent(prompt) {
    if (noCloud) {
      await sleep(200);
      const e = new Error('Simulated cloud failure');
      e.customErrorData = { status: 403, statusText: 'Forbidden' };
      throw e;
    }
    window.__lastCloudPrompt = prompt; // exposed for tests: proves what left the device
    logCloud(prompt);
    await sleep(300);
    const letter = prompt.split('LETTER (redacted):')[1] ?? '';
    const who = letter.match(/\[PERSON_NAME_\d+\]/)?.[0] ?? 'you';
    const scam = /gift card/i.test(letter);
    const due =
      letter.match(/(?:BALANCE DUE|YOU MAY OWE PROVIDER|Amount you owe):?\s*(\$[\d,]+\.\d{2})/i)?.[1] ??
      letter.match(/\$[\d,]+\.\d{2}/)?.[0] ??
      'none stated';
    return resp(
      JSON.stringify({
        scam_risk: scam ? 'high' : 'low',
        en: {
          one_line_summary: scam
            ? `This is very likely a scam aimed at ${who}. Do not pay or call the number in the letter.`
            : `${who} owes ${due} after insurance paid most of the bill.`,
          who_sent_it: scam ? 'Claims to be a toll agency' : 'Cascade Valley Medical Center',
          what_they_want: scam ? 'Payment by gift card within 24 hours' : `Payment of ${due}`,
          amount_due: due,
          deadline: scam ? '24 hours (pressure tactic)' : 'Nov 27, 2026',
          action_steps: scam
            ? ['Do not pay, click the link or call the number in the letter.', 'Look up the real toll agency on its official website and check your account there.', 'Report the letter to the FTC at reportfraud.ftc.gov.']
            : ['Compare this bill with the insurance statement for the same visit.', 'If it matches, pay on the official hospital website.', 'Ask about a payment plan if needed.'],
          scam_reasons: scam ? ['Demands gift cards', '24-hour threat', 'Unofficial web address'] : [],
          questions_to_ask: scam ? ['Do I really have an unpaid toll on my account?'] : ['Has insurance finished processing this claim?', 'Do I qualify for financial assistance?'],
        },
        zh: {
          one_line_summary: scam ? `这很可能是针对 ${who} 的诈骗。不要付款，也不要拨打信里的电话。` : `保险已付大部分费用，${who} 还需支付 ${due}。`,
          who_sent_it: scam ? '自称收费公路管理机构' : 'Cascade Valley Medical Center',
          what_they_want: scam ? '要求24小时内用礼品卡付款' : `支付 ${due}`,
          amount_due: due,
          deadline: scam ? '24小时（施压手段）' : '2026年11月27日',
          action_steps: scam
            ? ['不要付款，不要点链接，也不要拨打信里的电话。', '到收费公路机构的官网查询你的账户。', '向 FTC 举报：reportfraud.ftc.gov。']
            : ['把账单和保险公司同一天的说明对照一下。', '金额一致的话，在医院官网付款。', '有困难可以询问分期付款。'],
          scam_reasons: scam ? ['要求礼品卡付款', '24小时期限威胁', '非官方网址'] : [],
          questions_to_ask: scam ? ['我的账户真的有未付的过路费吗？'] : ['保险已经处理完这笔理赔了吗？', '我符合经济援助的条件吗？'],
        },
        es: {
          one_line_summary: scam
            ? `Es muy probable que sea una estafa dirigida a ${who}. No pague ni llame al número de la carta.`
            : `${who} debe ${due} después de que el seguro pagó la mayor parte de la factura.`,
          who_sent_it: scam ? 'Dice ser una agencia de peaje' : 'Cascade Valley Medical Center',
          what_they_want: scam ? 'Pago con tarjetas de regalo en 24 horas' : `El pago de ${due}`,
          amount_due: due,
          deadline: scam ? '24 horas (táctica de presión)' : '27 de noviembre de 2026',
          action_steps: scam
            ? ['No pague, no abra el enlace ni llame al número de la carta.', 'Busque la agencia de peaje real en su sitio web oficial y revise su cuenta allí.', 'Denuncie la carta ante la FTC en reportfraud.ftc.gov.']
            : ['Compare esta factura con el estado de cuenta del seguro de la misma visita.', 'Si coincide, pague en el sitio web oficial del hospital.', 'Pregunte por un plan de pagos si lo necesita.'],
          scam_reasons: scam ? ['Pide tarjetas de regalo', 'Amenaza de 24 horas', 'Dirección web no oficial'] : [],
          questions_to_ask: scam ? ['¿De verdad tengo un peaje sin pagar en mi cuenta?'] : ['¿El seguro ya terminó de procesar este reclamo?', '¿Califico para ayuda financiera?'],
        },
      }),
      'in_cloud',
    );
  },
};

// On-device fallback: compact English answer (flat shape, see LOCAL_EXPLAIN_SCHEMA).
export const localExplainer = {
  async generateContent(prompt) {
    needLocal();
    window.__lastLocalExplainPrompt = prompt;
    await sleep(300);
    if (shortOverflows) throw new Error('The response exceeded output limits and was truncated.');
    const letter = prompt.split('LETTER (redacted):')[1] ?? '';
    const who = letter.match(/\[PERSON_NAME_\d+\]/)?.[0] ?? 'you';
    const scam = /gift card/i.test(letter);
    return resp(
      JSON.stringify({
        scam_risk: scam ? 'high' : 'low',
        summary: scam ? `Likely a scam aimed at ${who}. Do not pay.` : `A bill for ${who}. Check it against your insurance statement.`,
        amount_due: letter.match(/\$[\d,]+\.\d{2}/)?.[0] ?? 'none stated',
        deadline: 'none stated',
        steps: scam ? ['Do not pay or call the number in the letter.'] : ['Compare with your insurance statement.', 'Pay on the official website.'],
      }),
      'on_device',
    );
  },
};

// Last-resort on-device answer: summary + scam risk only.
export const localExplainerTiny = {
  async generateContent(prompt) {
    needLocal();
    window.__lastLocalExplainPrompt = prompt;
    await sleep(200);
    const letter = prompt.split('LETTER (redacted):')[1] ?? '';
    const who = letter.match(/\[PERSON_NAME_\d+\]/)?.[0] ?? 'you';
    return resp(JSON.stringify({ scam_risk: 'low', summary: `A letter for ${who} about a bill.` }), 'on_device');
  },
};

// ---------- Step 4 (Take action) cloud models ----------
// Every string that would go to the cloud is recorded for the privacy tests.
function logCloud(...parts) {
  (window.__cloudLog ??= []).push(parts.map((p) => (typeof p === 'string' ? p : JSON.stringify(p))).join('\n'));
}
const langOf = (text) => (/Simplified Chinese/.test(text) ? 'zh' : /Spanish/.test(text) ? 'es' : 'en');
const ph = (letter, type) => letter.match(new RegExp(`\\[${type}_\\d+\\]`))?.[0];
const M = {
  zh: { email: '这封邮件请对方确认金额，并询问能否分期付款。', plan: '这封信请求按月分期付款。', line: '（中文意思）', step: '（中文意思）', side: '好的，我已经修改了草稿。', q: '好问题。', live: '这听起来像诈骗。请挂断，并通过官网上的电话核实。', eob: 'EOB 是保险公司的说明，不是账单。' },
  es: { email: 'Este correo pide confirmar el monto y pregunta por un plan de pagos.', plan: 'Esta carta pide un plan de pagos mensual.', line: '(significado en español)', step: '(significado en español)', side: 'Listo, actualicé el borrador.', q: 'Buena pregunta.', live: 'Esto parece una estafa. Cuelgue y verifique con el número del sitio web oficial.', eob: 'Un EOB es una explicación del seguro, no una factura.' },
  en: { email: '', plan: '', line: '', step: '', side: 'Done. I updated the draft.', q: 'Good question.', live: 'This sounds like a scam. Hang up and call the agency back using the number on its official website.', eob: 'An EOB comes from your insurance company and is not a bill. Pay only the bill, after the amounts match.' },
};

export const draftModel = {
  async generateContent(req) {
    if (noCloud) throw Object.assign(new Error('Simulated cloud failure'), { customErrorData: { status: 403 } });
    const prompt = req.contents[0].parts[0].text;
    logCloud(prompt);
    await sleep(250);
    const letter = prompt.split('LETTER (redacted):')[1] ?? '';
    const lang = langOf(prompt.split('LETTER (redacted):')[0]);
    const m = M[lang];
    const name = ph(letter, 'PERSON_NAME') ?? '[Your name]';
    const acct = ph(letter, 'ACCOUNT_NUMBER') ?? 'the account';
    const dob = ph(letter, 'DATE_OF_BIRTH');
    const addr = ph(letter, 'STREET_ADDRESS');
    const extra = prompt.match(/Change request from the user: "([^"]*)"/)?.[1];
    const ps = extra ? `\n\nP.S. (${extra})` : '';
    let out;
    if (/polite email/.test(prompt)) {
      out = {
        subject: `Question about statement for account ${acct}`,
        body: `Hello,\n\nI am writing on behalf of my mother, ${name}${dob ? ` (date of birth ${dob})` : ''}, about account ${acct}.\n\nCould you please confirm the balance and whether insurance has finished processing this claim? If the balance is correct, is a payment plan or financial assistance available?\n\nThank you,\n[Your name]${ps}`,
        meaning: m.email,
      };
    } else if (/payment plan/.test(prompt) && /formal letter/.test(prompt)) {
      const amt = prompt.match(/can pay about ([^ ]+) per month/)?.[1];
      out = {
        body: `${name}\n${addr ?? ''}\n\nPatient Financial Services\n\nRe: Account ${acct}\n\nI am writing to request a monthly payment plan for my balance.${amt ? ` I can pay ${amt} per month.` : ' Please let me know what plan you can offer.'}\n\nSincerely,\n${name}${ps}`,
        meaning: m.plan,
      };
    } else if (/phone call script/.test(prompt)) {
      const scam = /may be a scam/.test(prompt);
      out = {
        have_ready: [
          { label: 'Account #', value: acct },
          { label: 'Patient', value: name },
          ...(dob ? [{ label: 'Date of birth', value: dob }] : []),
        ],
        lines: [
          { who: 'you_say', text: scam ? 'I received a letter and want to check if it really came from you.' : `Hi, I'm calling about account ${acct}.`, meaning: m.line },
          { who: 'if_they_ask', text: `The account holder is ${name}.`, meaning: m.line },
          { who: 'you_ask', text: 'Has insurance finished processing this claim?', meaning: m.line },
          { who: 'you_ask', text: 'Can I set up a payment plan?', meaning: m.line },
        ],
      };
    } else {
      out = {
        steps: [
          { text: 'Do not pay, click links, or call numbers from the letter.', meaning: m.step },
          { text: 'Check your account on the real organization\'s official website.', meaning: m.step },
          { text: 'Report the letter to the FTC at reportfraud.ftc.gov.', meaning: m.step },
          { text: `Warn ${name} and other family members about this letter.`, meaning: m.step },
        ],
      };
    }
    return resp(JSON.stringify(out), 'in_cloud');
  },
};

export const assistModel = {
  startChat({ history = [], systemInstruction = '' } = {}) {
    return {
      async sendMessage(msg) {
        logCloud(systemInstruction, history, msg);
        await sleep(250);
        const m = M[langOf(systemInstruction)];
        const revise = /\b(add|mention|change|remove|shorter|formal|include|reword)\b/i.test(msg) ? msg : '';
        const who = msg.match(/\[PERSON_NAME_\d+\]/)?.[0];
        const scam = /scam|suspend|today|gift card/i.test(msg);
        const lead = { en: `${who} should not pay or share any details yet. `, zh: `${who} 先不要付款，也不要透露任何信息。`, es: `${who} no debe pagar ni dar ningún dato todavía. ` }[langOf(systemInstruction)];
        const reply = revise ? m.side : scam ? (who ? lead : '') + m.live : `${m.q} ${m.eob}`;
        return resp(JSON.stringify({ reply, revise_instruction: revise }), "in_cloud");
      },
    };
  },
};

export async function warmUpLocalModel(onProgress) {
  for (const p of [0.3, 0.7, 1]) {
    onProgress?.(p);
    await sleep(100);
  }
}

export async function localAvailability() {
  return noLocal ? 'unavailable' : 'available';
}
