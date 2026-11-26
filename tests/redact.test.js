import { describe, it, expect } from 'vitest';
import { ruleDetect, normalizeFields, redact, rehydrate, rehydrateDeep, spans } from '../src/redact.js';
import { SAMPLES } from '../src/samples.js';

const texts = (fields) => fields.map((f) => f.text);

describe('ruleDetect', () => {
  it('finds SSN, phone, email', () => {
    const t = 'SSN 555-42-1987, call (555) 201-7781 or mail a.b@example.com';
    const f = texts(ruleDetect(t));
    expect(f).toContain('555-42-1987');
    expect(f).toContain('(555) 201-7781');
    expect(f).toContain('a.b@example.com');
  });

  it('finds labelled ids but not ordinary words', () => {
    const t = 'Patient Account #: CVMC-8841207\nFinancial assistance. Referral to services.\nMember ID: PMH443920118';
    const f = texts(ruleDetect(t));
    expect(f).toContain('CVMC-8841207');
    expect(f).toContain('PMH443920118');
    for (const w of ['Financial', 'Referral', 'erral', 'Account', 'services']) expect(f).not.toContain(w);
  });

  it('finds "account ending 6612" and DOB', () => {
    const f = texts(ruleDetect('savings account ending 6612\nDate of Birth: 03/14/1952'));
    expect(f).toContain('6612');
    expect(f).toContain('03/14/1952');
  });
});

describe('normalizeFields', () => {
  it('drops hallucinated values not in the text', () => {
    const f = normalizeFields('Hello Jian Wu', [
      { text: 'Jian Wu', type: 'PERSON_NAME' },
      { text: 'John Doe', type: 'PERSON_NAME' },
    ]);
    expect(texts(f)).toEqual(['Jian Wu']);
  });

  it('preserves a field the user switched off', () => {
    const f = normalizeFields('Call 555-019-4472, Jian Wu', [
      { text: '555-019-4472', type: 'PHONE', enabled: false },
      { text: 'Jian Wu', type: 'PERSON_NAME' },
    ]);
    expect(f.find((x) => x.type === 'PHONE').enabled).toBe(false);
    expect(f.find((x) => x.type === 'PERSON_NAME').enabled).toBe(true);
  });

  it('dedupes and drops values contained in longer ones', () => {
    const f = normalizeFields('Taxpayer: Hong Chen and Li Chen', [
      { text: 'Hong Chen', type: 'PERSON_NAME' },
      { text: 'Hong Chen and Li Chen', type: 'PERSON_NAME' },
      { text: 'Hong Chen', type: 'PERSON_NAME' },
    ]);
    expect(texts(f)).toEqual(['Hong Chen and Li Chen']);
  });
});

describe('redact + rehydrate', () => {
  it('removes every enabled value and round-trips', () => {
    const text = 'Patient: Mei-Ling Zhou. Guarantor: Mei-Ling Zhou. Acct CVMC-8841207.';
    const fields = normalizeFields(text, [
      { text: 'Mei-Ling Zhou', type: 'PERSON_NAME' },
      { text: 'CVMC-8841207', type: 'ACCOUNT_NUMBER' },
    ]);
    const { redacted, map } = redact(text, fields);
    expect(redacted).not.toContain('Mei-Ling');
    expect(redacted).not.toContain('8841207');
    expect(redacted).toContain('[PERSON_NAME_1]');
    expect(rehydrate(redacted, map)).toBe(text);
  });

  it('respects disabled fields', () => {
    const text = 'Call 555-019-4472 about case ID: ETC-55120-A';
    const fields = normalizeFields(text, ruleDetect(text));
    fields.find((f) => f.type === 'PHONE').enabled = false;
    const { redacted } = redact(text, fields);
    expect(redacted).toContain('555-019-4472');
    expect(redacted).not.toContain('ETC-55120-A');
  });

  it('rehydrates nested cloud JSON and leaves unknown placeholders alone', () => {
    const map = { '[PERSON_NAME_1]': 'Jian Wu' };
    const out = rehydrateDeep({ a: 'Hi [PERSON_NAME_1]', b: ['[PERSON_NAME_1]', '[PHONE_9]'], n: 3 }, map);
    expect(out).toEqual({ a: 'Hi Jian Wu', b: ['Jian Wu', '[PHONE_9]'], n: 3 });
  });
});

describe('spans', () => {
  it('returns sorted, non-overlapping spans covering every occurrence', () => {
    const text = 'A Jian Wu B Jian Wu';
    const s = spans(text, [{ text: 'Jian Wu' }]);
    expect(s.map((x) => x.start)).toEqual([2, 12]);
  });
});

describe('samples (rules only baseline)', () => {
  it.each(SAMPLES.map((s) => [s.id, s]))('%s: rule output never leaks a ruled-out id after redaction', (_, s) => {
    const fields = normalizeFields(s.text, ruleDetect(s.text));
    const { redacted } = redact(s.text, fields);
    for (const f of fields) expect(redacted).not.toContain(f.text);
  });
});

import { expandLocal, LOCAL_EXPLAIN_SCHEMA, LOCAL_TINY_SCHEMA } from '../src/prompts.js';

describe('on-device fallback shape', () => {
  it('expands the compact answer into the UI shape', () => {
    const x = expandLocal({ scam_risk: 'high', summary: 'S', amount_due: '$1', deadline: 'now', steps: ['a'] });
    expect(x.scam_risk).toBe('high');
    expect(x.en).toMatchObject({ one_line_summary: 'S', amount_due: '$1', deadline: 'now', action_steps: ['a'], questions_to_ask: [] });
  });
  it('expands the tiny answer with safe defaults', () => {
    const x = expandLocal({ scam_risk: 'low', summary: 'S' });
    expect(x.en.action_steps).toEqual([]);
    expect(x.en.amount_due).toBe('');
  });
  it('keeps the fallback schemas small', () => {
    expect(Object.keys(LOCAL_EXPLAIN_SCHEMA.properties)).toHaveLength(5);
    expect(Object.keys(LOCAL_TINY_SCHEMA.properties)).toHaveLength(2);
  });
});

import { Vault, fillParts } from '../src/vault.js';

describe('Vault (placeholders shared by letter, drafts and chats)', () => {
  const letterMap = { '[PERSON_NAME_1]': 'Mei-Ling Zhou', '[ACCOUNT_NUMBER_1]': 'CVMC-8841207' };

  it('hides values already known from the letter even if the detector missed them', () => {
    const v = new Vault(letterMap);
    const r = v.hide('Write it for Mei-Ling Zhou, account CVMC-8841207', []);
    expect(r.redacted).toBe('Write it for [PERSON_NAME_1], account [ACCOUNT_NUMBER_1]');
    expect(r.hidden).toHaveLength(2);
  });

  it('gives new details new numbered placeholders and reuses them', () => {
    const v = new Vault(letterMap);
    const a = v.hide('Her Medicare number is 1EG4-TE5-MK72', [{ text: '1EG4-TE5-MK72', type: 'GOVERNMENT_ID' }]);
    expect(a.redacted).toBe('Her Medicare number is [GOVERNMENT_ID_1]');
    const b = v.hide('Again: 1EG4-TE5-MK72', []);
    expect(b.redacted).toBe('Again: [GOVERNMENT_ID_1]');
    const c = v.hide('Brother Jian Wu', [{ text: 'Jian Wu', type: 'PERSON_NAME' }]);
    expect(c.redacted).toBe('Brother [PERSON_NAME_2]');
  });

  it('reveals placeholders in cloud replies, and marks filled parts for display', () => {
    const v = new Vault(letterMap);
    expect(v.reveal('Dear [PERSON_NAME_1], re [ACCOUNT_NUMBER_1]')).toBe('Dear Mei-Ling Zhou, re CVMC-8841207');
    expect(v.revealDeep({ a: ['[PERSON_NAME_1]'] })).toEqual({ a: ['Mei-Ling Zhou'] });
    expect(fillParts('Hi [PERSON_NAME_1]!', v.map)).toEqual([
      { text: 'Hi ', filled: false },
      { text: 'Mei-Ling Zhou', filled: true },
      { text: '!', filled: false },
    ]);
    expect(fillParts('[UNKNOWN_9]', v.map)).toEqual([{ text: '[UNKNOWN_9]', filled: false }]);
  });
});

import { chatFields } from '../src/redact.js';

describe('chatFields (privacy check for chat messages)', () => {
  const q = 'How do I appeal an insurance denial?';
  it('does not hide a whole question the model flagged', () => {
    expect(chatFields(q, [{ text: q, type: 'OTHER', source: 'model' }])).toEqual([]);
    expect(chatFields(q, [{ text: 'appeal an insurance denial', type: 'OTHER', source: 'model' }])).toEqual([]);
  });
  it('keeps real details', () => {
    const m = 'Someone called Mei-Ling Zhou about account CVMC-8841207 and her Medicare number 1EG4-TE5-MK72';
    const kept = chatFields(m, [
      { text: 'Mei-Ling Zhou', type: 'PERSON_NAME', source: 'model' },
      { text: 'CVMC-8841207', type: 'ACCOUNT_NUMBER', source: 'model' },
      { text: '1EG4-TE5-MK72', type: 'GOVERNMENT_ID', source: 'rule' },
    ]);
    expect(kept.map((f) => f.text)).toEqual(['Mei-Ling Zhou', 'CVMC-8841207', '1EG4-TE5-MK72']);
  });
  it('always keeps rule matches, even long ones', () => {
    expect(chatFields('a@b.co', [{ text: 'a@b.co', type: 'EMAIL', source: 'rule' }])).toHaveLength(1);
  });
});

import { plausibleFields } from '../src/redact.js';

describe('plausibleFields', () => {
  const letter = 'STATEMENT DATE: 10/28/2026\nDate of Birth: 03/14/1952\nPlease pay by 11/27/2026.';
  it('keeps a real date of birth and drops ordinary dates labelled as birth dates', () => {
    const kept = plausibleFields(letter, [
      { text: '10/28/2026', type: 'DATE_OF_BIRTH', source: 'model' },
      { text: '03/14/1952', type: 'DATE_OF_BIRTH', source: 'model' },
      { text: '11/27/2026', type: 'DATE_OF_BIRTH', source: 'model' },
    ]);
    expect(kept.map((f) => f.text)).toEqual(['03/14/1952']);
  });
  it('leaves other types and rule matches alone', () => {
    const f = [{ text: '10/28/2026', type: 'OTHER', source: 'model' }, { text: '10/28/2026', type: 'DATE_OF_BIRTH', source: 'rule' }];
    expect(plausibleFields(letter, f)).toHaveLength(2);
  });
});
