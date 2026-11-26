// Browser smoke test against the MOCK backend (no Firebase, no Gemini Nano needed).
// Usage: npm run smoke   (builds first, then tests)
// Bundled Chromium instead of installed Chrome: set PW_CHANNEL=chromium
//
// Checks the privacy invariants end-to-end in a real browser:
//   1. the cloud prompt never contains a value the user chose to hide
//   2. hidden values are restored locally in the final answer
//   3. without an on-device model, photos are never sent anywhere
import { chromium } from 'playwright';
import { preview } from 'vite';

const server = await preview({ preview: { port: 4179 } });
const BASE = 'http://localhost:4179/';
const ch = process.env.PW_CHANNEL || 'chrome';
const browser = await chromium.launch(ch === 'chromium' ? {} : { channel: ch });
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? '  — ' + extra : ''}`);
  if (!ok) failed++;
};
const newPage = async (ctx) => {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => check('no page errors', false, e.message));
  return page;
};
const text = (page, sel) => page.locator(sel).first().innerText();

async function toReview(page, sampleId) {
  await page.click(`[data-sample="${sampleId}"]`);
  await page.getByRole('button', { name: 'Read it on this computer' }).click();
  await page.waitForSelector('[data-testid="letter"]');
}

try {
  // ---------- Happy path: on-device model available ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock');
    check('intro shown on first visit', await page.getByRole('heading', { name: /Confusing mail/ }).isVisible());
    await page.waitForFunction(() => document.querySelector('[data-testid="local-status"]')?.textContent === 'Ready');
    check('intro shows on-device AI ready', true);
    await page.getByRole('button', { name: 'Get started' }).click();
    check('drop page after Get started', await page.getByRole('heading', { name: 'Add a letter' }).isVisible());

    await toReview(page, 'toll_scam');
    const bars = await page.$$eval('[data-testid="letter"] .redact', (b) => b.map((x) => x.dataset.field));
    check('sensitive values become bars', ['Jian Wu', '7KQX219', 'ETC-55120-A'].every((v) => bars.includes(v)), bars.join(', '));
    check('scam warning shown before sending', (await text(page, '[role="alert"]')).includes('may be a scam'));
    const cloud1 = await text(page, '[data-testid="cloud-preview"]');
    check('cloud preview hides the name', !cloud1.includes('Jian Wu') && cloud1.includes('NAME 1'), cloud1.slice(0, 80));

    const before = Number(await text(page, '[data-testid="hidden-count"]'));
    await page.click('.redact[data-field="555-019-4472"]');
    const after = Number(await text(page, '[data-testid="hidden-count"]'));
    check('clicking a bar shows it and updates the meter', after === before - 1 && (await text(page, '[data-testid="cloud-preview"]')).includes('555-019-4472'));

    // manual hide: select "Target" in the letter
    await page.evaluate(() => {
      const root = document.querySelector('[data-testid="letter"]');
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = w.nextNode())) {
        const i = n.textContent.indexOf('Target');
        if (i >= 0) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 6);
          getSelection().removeAllRanges();
          getSelection().addRange(r);
          return;
        }
      }
    });
    await page.getByRole('button', { name: 'Hide selection' }).click();
    check('highlighted text can be hidden', !(await text(page, '[data-testid="cloud-preview"]')).includes('Target'));
    check('earlier choice kept after manual hide', (await text(page, '[data-testid="cloud-preview"]')).includes('555-019-4472'));

    await page.getByRole('button', { name: 'Send the hidden version' }).click();
    await page.waitForSelector('[data-testid="summary"]');
    const sent = await page.evaluate(() => window.__lastCloudPrompt);
    check('cloud never saw hidden values', !['Jian Wu', '7KQX219', 'ETC-55120-A', 'Target'].some((v) => sent.includes(v)));
    check('cloud saw the value the user chose to show', sent.includes('555-019-4472'));
    check('answer has real name restored locally', (await text(page, '[data-testid="summary"]')).includes('Jian Wu'));
    check('scam risk high', (await text(page, '[data-testid="risk"]')).includes('high'));
    check('protection panel open', await page.locator('[data-testid="protect-panel"]').isVisible());
    const timeline = await text(page, '[data-testid="protect-panel"]');
    check('timeline shows device, review, cloud, restore', ['found on this computer', 'You reviewed', 'Explained in the cloud', 'filled back in'].every((s) => timeline.includes(s)));
    await page.click('[data-testid="protect-panel"] summary');
    check('"what was sent" has no hidden values', !(await text(page, '[data-testid="sent-text"]')).includes('Jian Wu'));

    await page.getByRole('button', { name: '中文', exact: true }).first().click();
    check('中文 switch is instant', /[一-鿿]/.test(await text(page, '[data-testid="summary"]')));
    await page.getByRole('button', { name: 'EN', exact: true }).first().click();
    await page.getByRole('button', { name: 'Close panel' }).click();
    check('panel can be closed', !(await page.locator('[data-testid="protect-panel"]').isVisible()));

    await page.reload();
    check('returning visitor skips intro', await page.getByRole('heading', { name: 'Add a letter' }).isVisible());
    await page.getByRole('button', { name: 'Intro' }).click();
    check('intro reachable from toolbar', await page.getByRole('heading', { name: /Confusing mail/ }).isVisible());
    await ctx.close();
  }

  // ---------- No on-device model ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock=nolocal');
    await page.getByRole('button', { name: 'Get started' }).click();
    check('drop shows rules-only status', (await page.locator('.page-head .pill').innerText()).includes('rules only'));
    await toReview(page, 'medical_bill');
    check('review warns that only numbers were found', (await page.locator('.banner-warn[role="status"]').last().innerText()).includes('only numbers and IDs'));
    const bars = await page.$$eval('[data-testid="letter"] .redact', (b) => b.map((x) => x.dataset.field));
    check('rules still hide the account number', bars.includes('CVMC-8841207'), bars.join(', '));

    await page.getByRole('button', { name: 'Back' }).click();
    await page.setInputFiles('[data-testid="file"]', 'samples/medical_bill.jpg');
    await page.evaluate(() => (window.__lastCloudPrompt = undefined));
    await page.getByRole('button', { name: 'Read it on this computer' }).click();
    await page.waitForSelector('.banner-error');
    check('photo refused without on-device model', (await text(page, '.banner-error')).includes('not uploaded'));
    check('nothing sent to the cloud', (await page.evaluate(() => window.__lastCloudPrompt)) === undefined);
    await ctx.close();
  }

  // ---------- Global language switch ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    const hasHan = (s) => /[一-鿿]/.test(s);
    await page.goto(BASE + '?mock');
    await page.getByRole('button', { name: '中文', exact: true }).click();
    check('intro switches to Chinese', (await text(page, 'h1')).includes('看不懂的信件'));
    await page.click('[data-testid="get-started"]');
    check('drop page in Chinese', (await text(page, 'h1')).includes('添加信件'));
    check('toolbar has the language switch', await page.locator('.rail [data-testid="lang-toggle"]').isVisible());
    await page.click('[data-sample="medical_bill"]');
    check('sample chip label in Chinese', (await text(page, '[data-sample="medical_bill"]')) === '医疗账单');
    await page.click('[data-testid="analyze"]');
    await page.waitForSelector('[data-testid="letter"]');
    check('review page in Chinese', (await text(page, 'h1')).includes('检查要保密的内容'));
    const bar = await page.locator('.redact').first().getAttribute('aria-label');
    check('bar labels in Chinese', hasHan(bar), bar);
    await page.click('[data-testid="send"]');
    await page.waitForSelector('[data-testid="summary"]');
    check('explanation in Chinese', hasHan(await text(page, '[data-testid="summary"]')));
    check('timeline in Chinese', (await text(page, '[data-testid="timeline"]')).includes('在云端解读'));
    await page.locator('.rail').getByRole('button', { name: 'EN', exact: true }).click();
    check(
      'toolbar switch flips everything back to English',
      (await text(page, '[data-testid="summary"]')).includes('Mei-Ling Zhou owes') &&
        (await text(page, '[data-testid="timeline"]')).includes('Explained in the cloud'),
    );
    await page.locator('.rail').getByRole('button', { name: 'ES', exact: true }).click();
    check('Spanish explanation', (await text(page, '[data-testid="summary"]')).includes('debe $581.50'));
    check('Spanish interface', (await text(page, '.eyebrow')).toLowerCase().includes('paso 3 de 4') && (await text(page, '[data-testid="timeline"]')).includes('Explicado en la nube'));
    check('toolbar has three language buttons', (await page.locator('.rail [data-testid="lang-toggle"] button').count()) === 3);
    await page.reload();
    check('Spanish choice remembered', (await text(page, 'h1')).includes('Agregar una carta'));
    await page.locator('.rail').getByRole('button', { name: '中文', exact: true }).click();
    await page.reload();
    check('language choice remembered', (await text(page, 'h1')).includes('添加信件'));
    await ctx.close();
  }

  // ---------- Cloud fails: deliberate on-device fallback ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock=nocloud');
    await page.getByRole('button', { name: 'Get started' }).click();
    await toReview(page, 'medical_bill');
    await page.getByRole('button', { name: 'Send the hidden version' }).click();
    await page.waitForSelector('[data-testid="summary"]');
    const note = await text(page, '[data-testid="cloud-fallback"]');
    check('cloud failure is shown, with the real error', note.includes('HTTP 403'), note.slice(0, 120));
    check('on-device summary shown with real name restored', (await text(page, '[data-testid="summary"]')).includes('Mei-Ling Zhou'));
    await page.getByRole('button', { name: '中文', exact: true }).first().click();
    check(
      'in 中文, fallback notice is Chinese but summary stays English',
      (await text(page, '[data-testid="cloud-fallback"]')).includes('云端') && (await text(page, '[data-testid="summary"]')).includes('Mei-Ling Zhou'),
    );
    await page.getByRole('button', { name: 'ES', exact: true }).first().click();
    check('in Español, fallback notice is Spanish', (await text(page, '[data-testid="cloud-fallback"]')).includes('no funcionó'));
    await page.getByRole('button', { name: 'EN', exact: true }).first().click();
    check('timeline says it was explained on this computer', (await text(page, '[data-testid="protect-panel"]')).includes('Explained on this computer'));
    const localPrompt = await page.evaluate(() => window.__lastLocalExplainPrompt);
    check('on-device explainer also got only hidden text', localPrompt && !localPrompt.includes('Mei-Ling Zhou'));
    await ctx.close();
  }

  // ---------- Cloud fails AND the short on-device answer overflows ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock=tinyfallback');
    await page.getByRole('button', { name: 'Get started' }).click();
    await toReview(page, 'medical_bill');
    await page.getByRole('button', { name: 'Send the hidden version' }).click();
    await page.waitForSelector('[data-testid="summary"]');
    check('tiny on-device retry still gives a summary', (await text(page, '[data-testid="summary"]')).includes('Mei-Ling Zhou'));
    check('no empty boxes when fields are missing', (await page.locator('.stat').count()) === 0 && (await page.locator('.list-card').count()) === 0);
    await ctx.close();
  }

  // ---------- Step 4: Take action ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    const cloud = () => page.evaluate(() => (window.__cloudLog || []).join('\n'));
    const SECRETS = ['Mei-Ling Zhou', 'CVMC-8841207', '03/14/1952', '4417 Juniper', 'atrial fibrillation', '1EG4-TE5-MK72'];
    await page.goto(BASE + '?mock');
    await page.click('[data-testid="get-started"]');
    await toReview(page, 'medical_bill');
    await page.click('[data-testid="send"]');
    await page.click('[data-testid="next-step"]');
    await page.waitForSelector('[data-testid="draft-body"]');
    check('step 4 opens with an email draft', (await text(page, 'h1')).includes('Take the next step'));
    check('toolbar shows step 4', await page.locator('.rail').getByRole('button', { name: /Act/ }).isVisible());
    check('email has real values filled in locally', (await text(page, '[data-testid="draft-body"]')).includes('Mei-Ling Zhou') && (await page.locator('[data-testid="draft-body"] mark.filled').count()) > 0);
    check('email can be opened in a mail app', (await page.getAttribute('[data-testid="mailto"]', 'href')).startsWith('mailto:?subject='));

    await page.fill('[data-testid="side-chat-input"]', 'Also mention her Medicare number is 1EG4-TE5-MK72 for Mei-Ling Zhou');
    await page.click('[data-testid="side-chat-send"]');
    await page.waitForSelector('.revised-note');
    check('side chat hides 2 details before sending', (await text(page, '[data-testid="hidden-note"]')).includes('2 detail'));
    check('side chat change updates the draft', (await text(page, '[data-testid="draft-body"]')).includes('1EG4-TE5-MK72'));

    await page.getByRole('button', { name: 'Shorter', exact: true }).click();
    await page.waitForSelector('[data-testid="draft-body"]');
    check('quick edit buttons rewrite the draft', (await text(page, '[data-testid="draft-body"]')).includes('Make it shorter'));

    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    check('draft can be edited by hand, with real values', (await page.locator('[data-testid="draft"] textarea').inputValue()).includes('Mei-Ling Zhou'));
    await page.getByRole('button', { name: 'Done editing' }).click();

    await page.click('[data-kind="call"]');
    await page.waitForSelector('[data-testid="have-ready"]');
    check('call script lists details to have ready', (await text(page, '[data-testid="have-ready"]')).includes('CVMC-8841207'));
    check('Call button dials the number from a low-risk letter', (await page.getAttribute('[data-testid="call-btn"]', 'href')) === 'tel:5552017781');

    await page.click('[data-kind="plan"]');
    await page.waitForSelector('[data-testid="draft-body"]');
    await page.fill('#amount', '$120');
    await page.getByRole('button', { name: 'Update letter' }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="draft-body"]')?.innerText.includes('$120'));
    check('payment plan letter uses the monthly amount', true);

    const sideReplies = () => page.locator('[data-testid="side-chat"] .msg-model:not(.typing)');
    const ask = async (q) => {
      const n = await sideReplies().count();
      await page.fill('[data-testid="side-chat-input"]', q);
      await page.click('[data-testid="side-chat-send"]');
      await page.waitForFunction((k) => document.querySelectorAll('[data-testid="side-chat"] .msg-model:not(.typing)').length > k, n);
      return sideReplies().last().innerText();
    };
    const lastUserHidden = () => page.locator('[data-testid="side-chat"] .msg-user-wrap').last().locator('[data-testid="hidden-note"]').count();
    const sugg = () => page.$$eval('[data-testid="side"] .chip', (els) => els.map((e) => e.innerText.trim()));
    check('payment plan shows payment-plan suggestions', (await sugg()).includes('How much should I offer per month?'), (await sugg()).join(' | '));
    await page.click('[data-kind="call"]');
    check('phone call shows phone-call suggestions', (await sugg()).includes('What should I write down during the call?'), (await sugg()).join(' | '));
    await page.click('[data-kind="plan"]');
    check('only one chat on the page (no separate live chat)', (await page.locator('[data-testid="side"]').count()) === 1 && (await page.locator('[data-kind="live"]').count()) === 0);
    const scamReply = await ask('Someone called Mei-Ling Zhou saying her benefits stop today. Real?');
    check('chat answers general scam questions, name restored locally', scamReply.includes('scam') && scamReply.includes('Mei-Ling Zhou'), scamReply.slice(0, 80));
    await ask('How do I appeal an insurance denial?');
    check('a plain question is not hidden, even when single words are flagged', (await lastUserHidden()) === 0);
    check('the question itself reaches Gemini', (await page.evaluate(() => window.__cloudLog.at(-1))).includes('How do I appeal an insurance denial?'));
    check('chat sees only the hidden letter', (await page.evaluate(() => window.__cloudLog.at(-1))).includes('[PERSON_NAME_1]'));

    const all = await cloud();
    const leaked = SECRETS.filter((s) => all.includes(s));
    check('no personal detail ever reached the cloud in step 4', leaked.length === 0, leaked.join(', '));

    await page.click('[data-kind="email"]');
    await page.locator('.rail').getByRole('button', { name: '中文', exact: true }).click();
    await page.waitForSelector('[data-testid="meaning"]');
    check('in 中文, drafts stay English with a Chinese explanation', (await text(page, '[data-testid="draft-subject"]')).includes('Question about') && (await text(page, '[data-testid="meaning"]')).includes('内容说明'));
    check('action cards in Chinese', (await text(page, '[data-kind="call"]')).includes('准备打电话'));
    await ctx.close();
  }

  // ---------- Step 4 for a scam letter ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock');
    await page.click('[data-testid="get-started"]');
    await toReview(page, 'toll_scam');
    await page.click('[data-testid="send"]');
    await page.click('[data-testid="next-step"]');
    await page.waitForSelector('[data-testid="draft-body"]');
    const kinds = await page.$$eval('.action-card', (els) => els.map((e) => e.dataset.kind));
    check('scam letter offers report / verify call', kinds.join(',') === 'report,call', kinds.join(','));
    check('report checklist shown', (await text(page, '[data-testid="draft-body"]')).includes('reportfraud.ftc.gov'));
    check('report checklist has no raw placeholders', !/\[[A-Z_]+_\d+\]/.test(await text(page, '[data-testid="draft-body"]')));
    await page.getByRole('button', { name: 'Is this phone call a scam?' }).click();
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="side-chat"] .msg-model:not(.typing)').length >= 2);
    check('suggested question is sent as written', (await page.locator('[data-testid="side-chat"] [data-testid="hidden-note"]').count()) === 0 && (await page.evaluate(() => window.__cloudLog.at(-1))).includes('Is this phone call a scam?'));
    await page.click('[data-kind="call"]');
    await page.waitForSelector('[data-testid="call-note"]');
    check('no Call button for a scam letter', (await page.locator('[data-testid="call-btn"]').count()) === 0);
    check('verify call warns not to use the letter number', (await text(page, '[data-testid="call-note"]')).includes("Don't call the number"));
    await ctx.close();
  }

  // ---------- Loading indicators ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock=nocloud');
    await page.click('[data-testid="get-started"]');
    await page.click('[data-sample="medical_bill"]');
    await page.click('[data-testid="analyze"]');
    const s1 = await page.waitForSelector('[data-testid="loading"]', { timeout: 2000 }).then((el) => el.getAttribute('data-stage')).catch(() => null);
    const btnSpinner = await page.locator('[data-testid="analyze"] .spinner').count();
    check('Drop shows a status while reading on this computer', s1 === 'load.detect', String(s1));
    check('button shows a spinner while busy', btnSpinner === 1, String(btnSpinner));
    await page.waitForSelector('[data-testid="letter"]');
    await page.click('[data-testid="send"]');
    const s2 = await page.waitForSelector('[data-testid="loading"]', { timeout: 2000 }).then((el) => el.getAttribute('data-stage')).catch(() => null);
    check('Review shows a status while Gemini explains', s2 === 'load.explain', String(s2));
    await page.waitForSelector('[data-testid="loading"][data-stage="load.fallback"]', { timeout: 3000 }).then(() => check('status switches when falling back to this computer', true)).catch(() => check('status switches when falling back to this computer', false));
    await page.waitForSelector('[data-testid="summary"]');
    check('status disappears when done', (await page.locator('[data-testid="loading"]').count()) === 0);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock');
    await page.click('[data-testid="get-started"]');
    await toReview(page, 'medical_bill');
    await page.click('[data-testid="send"]');
    await page.click('[data-testid="next-step"]');
    const drafting = await page.waitForSelector('[data-testid="drafting"]', { timeout: 2000 }).then(() => true).catch(() => false);
    check('draft shows a spinner and placeholder lines while writing', drafting && (await page.locator('.skeleton').count()) === 1);
    await page.waitForSelector('[data-testid="draft-body"]');
    await page.fill('[data-testid="side-chat-input"]', 'What is an EOB?');
    await page.click('[data-testid="side-chat-send"]');
    const typing = await page.waitForSelector('[data-testid="typing"]', { timeout: 2000 }).then(() => true).catch(() => false);
    check('chat shows typing dots while waiting', typing);
    await page.waitForSelector('[data-testid="typing"]', { state: 'detached' });
    check('typing dots go away when the reply arrives', true);
    await ctx.close();
  }

  // ---------- Dev eval page ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE + '?mock&dev');
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: 'Eval' }).click();
    await page.getByRole('button', { name: /Run on the/ }).click();
    await page.waitForSelector('[data-testid="eval"] tr.total', { timeout: 15000 });
    check('eval runs on all samples', true, (await text(page, '[data-testid="eval"] tr.total')).replace(/\s+/g, ' '));
    await ctx.close();
  }

  // ---------- Firebase not configured ----------
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx);
    await page.goto(BASE);
    check('setup banner shown without .env', (await text(page, '.banner')).includes('Setup needed'));
    await page.getByRole('button', { name: 'Get started' }).click();
    await toReview(page, 'tax_notice');
    check('rules-only analysis still works', (await page.$$('[data-testid="letter"] .redact')).length > 0);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.httpServer.close();
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
