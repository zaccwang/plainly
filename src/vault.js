// The Vault keeps the mapping between placeholders and real values for one
// letter session (the letter itself, drafts and both chats). It lives only in
// memory on this computer. The cloud only ever sees placeholders.
import { rehydrate, rehydrateDeep } from './redact.js';

const PH = /^\[([A-Z_]+)_(\d+)\]$/;

export class Vault {
  /** @param {Record<string,string>} map placeholder -> real value (from redact()) */
  constructor(map = {}) {
    this.map = { ...map };
    this.counters = {};
    for (const ph of Object.keys(this.map)) {
      const m = ph.match(PH);
      if (m) this.counters[m[1]] = Math.max(this.counters[m[1]] ?? 0, Number(m[2]));
    }
  }

  /** Existing placeholder for a value, or a new one of the given type. */
  placeholderFor(value, type = 'OTHER') {
    const hit = Object.entries(this.map).find(([, v]) => v === value);
    if (hit) return hit[0];
    const n = (this.counters[type] ?? 0) + 1;
    this.counters[type] = n;
    const ph = `[${type}_${n}]`;
    this.map[ph] = value;
    return ph;
  }

  /**
   * Hide personal details in text the user typed.
   * 1) every value already known from the letter is replaced (even if the detector missed it);
   * 2) newly detected fields get new placeholders.
   * Returns { redacted, hidden: [{ text, ph }] }.
   */
  hide(text, fields = []) {
    let out = text;
    const hidden = [];
    const known = Object.entries(this.map).sort((a, b) => b[1].length - a[1].length);
    for (const [ph, value] of known) {
      if (value.length >= 3 && out.includes(value)) {
        out = out.split(value).join(ph);
        hidden.push({ text: value, ph });
      }
    }
    const fresh = [...fields].filter((f) => f.text?.length >= 2).sort((a, b) => b.text.length - a.text.length);
    for (const f of fresh) {
      if (!out.includes(f.text)) continue;
      const ph = this.placeholderFor(f.text, f.type);
      out = out.split(f.text).join(ph);
      hidden.push({ text: f.text, ph });
    }
    return { redacted: out, hidden };
  }

  reveal(str) {
    return rehydrate(str, this.map);
  }

  revealDeep(obj) {
    return rehydrateDeep(obj, this.map);
  }
}

/**
 * Split placeholder text into parts for display:
 * [{ text, filled: boolean }] where filled parts are real values restored here.
 */
export function fillParts(str, map) {
  if (typeof str !== 'string') return [];
  return str
    .split(/(\[[A-Z_]+_\d+\])/)
    .filter((p) => p !== '')
    .map((p) => (PH.test(p) && map[p] !== undefined ? { text: map[p], filled: true } : { text: p, filled: false }));
}
