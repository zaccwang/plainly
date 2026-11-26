import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { DETECT_SCHEMA, EXPLAIN_SCHEMA, LOCAL_EXPLAIN_SCHEMA, LOCAL_TINY_SCHEMA } from './prompts.js';

const cfg = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const CLOUD_MODEL = import.meta.env.VITE_CLOUD_MODEL || 'gemini-3.5-flash-lite';

// Local dev: print a debug token in the console, register it in
// Firebase console > App Check > Apps > Manage debug tokens.
if (import.meta.env.DEV) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;

const RECAPTCHA_KEY = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY;
if (!import.meta.env.DEV && !RECAPTCHA_KEY) {
  // Debug tokens only work in your own browser; a deployed site needs a real App Check provider.
  throw new Error(
    'App Check is not set up for this deployed site: add VITE_RECAPTCHA_ENTERPRISE_KEY to .env and rebuild (see README, "Deploy").',
  );
}

const app = initializeApp(cfg);
initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY || 'dev-uses-debug-token'),
  isTokenAutoRefreshEnabled: true,
});

const ai = getAI(app, { backend: new GoogleAIBackend() });

// Raw letter content ONLY ever goes to these two ONLY_ON_DEVICE models.
// If no on-device model exists they throw instead of silently using the cloud.
export const localTranscriber = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
});

export const localDetector = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }] },
    promptOptions: { responseConstraint: DETECT_SCHEMA },
  },
});

// Only redacted, user-approved text goes to these two.
// Cloud: full bilingual explanation. ONLY_IN_CLOUD so a cloud failure is
// reported to us instead of silently retried on-device (where the long
// bilingual answer does not fit Gemini Nano's output limit).
export const explainer = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_IN_CLOUD,
  inCloudParams: {
    model: CLOUD_MODEL,
    generationConfig: { responseMimeType: 'application/json', responseJsonSchema: EXPLAIN_SCHEMA },
  },
});

// Deliberate fallback when the cloud is unavailable: shorter, English-only
// answer sized for the on-device model.
export const localExplainer = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }] },
    promptOptions: { responseConstraint: LOCAL_EXPLAIN_SCHEMA },
  },
});

// Last resort if even the short answer overflows: summary + scam risk only.
export const localExplainerTiny = getGenerativeModel(ai, {
  mode: InferenceMode.ONLY_ON_DEVICE,
  onDeviceParams: {
    createOptions: { expectedInputs: [{ type: 'text', languages: ['en'] }] },
    promptOptions: { responseConstraint: LOCAL_TINY_SCHEMA },
  },
});

// Step 4 ("Take action"): drafts and chats, cloud only. They only receive
// redacted text; schemas and system instructions are set per request.
export const draftModel = getGenerativeModel(ai, { model: CLOUD_MODEL });
export const assistModel = getGenerativeModel(ai, { model: CLOUD_MODEL });

/** Must be called from a user gesture (button click). */
export async function warmUpLocalModel(onProgress) {
  await localDetector.initializeDeviceModel(onProgress);
  await localTranscriber.initializeDeviceModel(); // multimodal session, same weights
}

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'no-api' */
export async function localAvailability() {
  const LM = self.LanguageModel;
  if (!LM?.availability) return 'no-api';
  try {
    return await LM.availability({ expectedInputs: [{ type: 'text' }, { type: 'image' }] });
  } catch {
    return 'unavailable';
  }
}
