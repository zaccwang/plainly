# Plainly — Developer guide

How to run, test, deploy and understand the code. For using Plainly, see the [User guide](../README.md).

## How it works

Plainly uses **Firebase AI Logic hybrid inference**: Chrome's built-in Gemini Nano on the user's computer, and Gemini in the cloud.

```
photo / text ──▶ ① photo → text on device         ONLY_ON_DEVICE (the image never leaves the computer)
             ──▶ ② find personal details on device ONLY_ON_DEVICE + regex safety net, JSON output
             ──▶ ③ the user reviews what is hidden  human in the loop
             ──▶ ④ explanation in the cloud         ONLY_IN_CLOUD, sees placeholders like [PERSON_NAME_1]
                    fallback if the cloud fails: short English summary, ONLY_ON_DEVICE
             ──▶ ⑤ placeholders → real values       on device
             ──▶ ⑥ Take action                      cloud drafts and chats with placeholders;
                                                    every chat message is checked on device first
```

| Step | Where it runs | What it receives |
|---|---|---|
| Photo → text | Gemini Nano (`ONLY_ON_DEVICE`) | The photo |
| Find personal details | Gemini Nano (`ONLY_ON_DEVICE`) + regex rules | The letter text |
| Explanation (EN, 中文, ES in one call) | Gemini (`ONLY_IN_CLOUD`) | Redacted text only |
| Fallback explanation | Gemini Nano (`ONLY_ON_DEVICE`), short English | Redacted text only |
| Drafts, "Ask Plainly", Live chat | Gemini (cloud) | Redacted text only |
| Chat privacy check | Gemini Nano + regex + known letter values | What the user types |

## Requirements

- Node.js 20+
- Desktop Chrome, up to date, on hardware that supports Chrome's built-in AI (Gemini Nano)
- A Firebase project with **AI Logic** enabled (Gemini Developer API)

## Setup (about 20 minutes)

### 1. Chrome
- Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set it to **Enabled**, and restart Chrome.
- `chrome://on-device-internals` shows the model status and whether your hardware qualifies. If Chrome says internal pages are disabled, enable them at `chrome://chrome-urls` first.
- Quick check in the browser console: `await LanguageModel.availability()` should return `"available"`, `"downloadable"` or `"downloading"`.

### 2. Firebase
1. In the [Firebase console](https://console.firebase.google.com), create a project, then go to **AI Services → AI Logic → Get started** and choose the **Gemini Developer API**. This enables the required APIs; wait a few minutes before the first call.
2. Add a **Web app** and copy its config into `.env` (start from `.env.example`).
3. App Check is turned on by the setup flow. For local development, load the page, copy the **App Check debug token** printed in the browser console, and add it under **App Check → Apps → Manage debug tokens**.

### 3. Run
```bash
npm install
cp .env.example .env   # fill in the Firebase config (works in PowerShell too)
npm run dev            # open http://localhost:5173
```
On the intro page, click **Download on-device AI** if asked. Chrome only allows the first download after a click.

## Environment variables (`.env`)

| Variable | Needed for | Notes |
|---|---|---|
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Everything | From Firebase → Project settings → Your apps |
| `VITE_RECAPTCHA_ENTERPRISE_KEY` | Deployed site | App Check provider. Local dev uses a debug token instead |
| `VITE_ORIGIN_TRIAL_TOKEN` | Gemini Nano on a deployed domain | Chrome Prompt API origin trial. Not needed on localhost |
| `VITE_CLOUD_MODEL` | Optional | Cloud model override (default `gemini-3.5-flash-lite`) |
| `VITE_MOCK=1` | Optional | Always use the mock backend |

Never commit `.env`; it is in `.gitignore`.

## Testing (no Firebase needed)

```bash
npm test         # unit tests (vitest): detection rules, redaction, placeholder vault, fallback shapes
npm run smoke    # builds, then runs the end-to-end browser test (Playwright + local Chrome, mock backend)
npm run dev      # then open http://localhost:5173/?mock and click through
```

The browser test checks the privacy guarantees end to end: nothing the user chose to hide (or typed in a chat) reaches the cloud, real values are restored locally, and photos are never uploaded without an on-device model. It also covers all three languages, the scam flow, the cloud fallback and the loading states.

No Chrome installed? Run `npx playwright install chromium`, then:
- PowerShell: `$env:PW_CHANNEL="chromium"; npm run smoke`
- macOS / Linux: `PW_CHANNEL=chromium npm run smoke`

### URL options

| URL option | Effect |
|---|---|
| `?mock` | Fake models, no Firebase: try the whole flow on any browser |
| `?mock=nolocal` | Pretend this computer has no on-device AI |
| `?mock=nocloud` | Pretend the cloud request fails (shows the on-device fallback) |
| `?mock=tinyfallback` | Cloud fails and the short on-device answer overflows (tests the one-line retry) |
| `?dev` | Adds an **Eval** page: on-device detection recall / precision on the 4 labelled sample letters |

Eval scores in mock mode are meaningless (the mock returns the labels). Real scores need Firebase and Chrome's on-device AI.

## Deploy (Firebase Hosting)

The site is a static React build served by Firebase Hosting at `https://<project-id>.web.app`. `firebase.json` and `.firebaserc` are set up for project `plainly-d0fa3`; change `.firebaserc` for your own project.

1. **App Check for the public site.** In Google Cloud → Security → reCAPTCHA, create a *Website* key for `<project-id>.web.app`, `<project-id>.firebaseapp.com` and `localhost`. Register it in Firebase → App Check → your web app → reCAPTCHA Enterprise, and put it in `.env` as `VITE_RECAPTCHA_ENTERPRISE_KEY`. A build without it shows "Setup needed" instead of failing silently.
2. **On-device AI on the public site.** Register your domain for the Chrome Prompt API origin trial at <https://developer.chrome.com/origintrials> and put the token in `.env` as `VITE_ORIGIN_TRIAL_TOKEN`; the build adds it to the page. Without it the hosted site still works with rules + cloud.
3. **Deploy:**
   ```bash
   npx firebase-tools login   # once
   npm run deploy             # builds, then deploys to Firebase Hosting
   ```

## Code map

React + Vite. UI components are in `src/ui/`; the logic modules are framework-free.

| File | Contents |
|---|---|
| `src/App.jsx` | Screen flow (Intro → Drop → Review → Understand → Take action), pipeline wiring, privacy timeline |
| `src/ui/Intro.jsx` | Intro page with setup status and on-device model download |
| `src/ui/Rail.jsx` | Left toolbar: steps, privacy panel, language switch, text size, Eval (`?dev`) |
| `src/ui/Drop.jsx` | Photo drop zone, paste box, example letters |
| `src/ui/Review.jsx` | Clickable black bars, "what the cloud will see" preview, hidden/shown counter, manual hide |
| `src/ui/Understand.jsx` | Explanation, read aloud, print, copy, "How Plainly protected you" panel |
| `src/ui/Act.jsx` | Step 4: email, call script, payment-plan letter (report + verify call for scams), "Ask Plainly" side chat, Live chat |
| `src/ui/Loading.jsx` | Spinners, status cards with elapsed time, skeleton lines, typing dots |
| `src/ui/Eval.jsx` | Developer eval page (`?dev`) |
| `src/i18n.jsx` | All interface text in English, 中文 and Español, plus the language switch |
| `src/backend.js` | Picks the real, mock or "not configured" backend |
| `src/firebase.js` | Firebase AI Logic model instances (on-device, cloud, fallbacks) and App Check |
| `src/mock.js` | Mock backend with the same interface as `firebase.js` |
| `src/prompts.js` | Prompts and JSON schemas for detection and explanation |
| `src/assist.js`, `src/assistPrompts.js` | Step 4 calls, prompts and schemas; on-device check for chat messages |
| `src/pipeline.js` | Steps 1–3 calls, timing and cloud → on-device fallback |
| `src/redact.js` | Regex detection, redaction, placeholder rehydration (pure functions) |
| `src/vault.js` | Placeholder ↔ real-value map shared by the letter, drafts and chats (memory only) |
| `src/styles.css` | Design tokens and styles |
| `src/samples.js`, `samples/*.jpg` | 4 **fictional** test letters with labelled personal details |
| `tests/redact.test.js`, `tests/smoke.mjs` | Unit tests and end-to-end browser test |

## Design decisions

- **Raw content is never silently sent to the cloud.** The on-device steps use `ONLY_ON_DEVICE`, which fails instead of falling back to the cloud. Without on-device AI, text input falls back to rules + manual hiding, and photos are refused.
- **The cloud explanation is `ONLY_IN_CLOUD`**, so a cloud error is reported to the user instead of being silently retried on device. Plainly then asks Gemini Nano for a deliberately short answer that fits its output limit, with a one-line retry.
- **Over-hiding is almost free.** If a harmless value such as a customer-service number gets hidden, the placeholder in the answer is swapped back locally.
- **Chats get the same protection.** Everything typed in step 4 is checked on device, and any value already known from the letter is hidden even if the detector misses it.
- **Only values that literally occur in the letter are kept**, which guards against invented fields.
- **Phone calls are prepared, not placed.** The Call button only appears for low-risk letters; for suspected scams Plainly tells the user to find the official number.
- **No accounts, no storage.** Letters, drafts and chats live in memory in the open tab. Only the language, text size and "intro seen" preferences are saved in the browser.
