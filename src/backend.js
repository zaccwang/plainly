// Picks the real Firebase backend or the mock one.
// Mock: add ?mock (or ?mock=nolocal) to the URL, or set VITE_MOCK=1.
// If Firebase is not configured (no .env) or fails to start, we load a
// stub backend instead so the page still works in rules-only mode and can
// tell the user what to fix, instead of failing silently.
const useMock = import.meta.env.VITE_MOCK === '1' || new URLSearchParams(location.search).has('mock');

let backend;
let configError = null;

if (useMock) {
  backend = await import('./mock.js');
} else if (!import.meta.env.VITE_FIREBASE_API_KEY) {
  configError = 'Firebase is not configured: no VITE_FIREBASE_API_KEY found. Copy .env.example to .env and fill it in, then restart "npm run dev".';
} else {
  try {
    backend = await import('./firebase.js');
  } catch (e) {
    configError = `Firebase failed to start: ${e.message}`;
  }
}

if (configError) {
  console.error(configError);
  const fail = async () => {
    throw new Error(configError);
  };
  backend = {
    CLOUD_MODEL: 'not configured',
    localTranscriber: { generateContent: fail },
    localDetector: { generateContent: fail },
    explainer: { generateContent: fail },
    localExplainer: { generateContent: fail },
    localExplainerTiny: { generateContent: fail },
    draftModel: { generateContent: fail },
    assistModel: { startChat: () => ({ sendMessage: fail }) },
    liveModel: { startChat: () => ({ sendMessage: fail }) },
    warmUpLocalModel: fail,
    localAvailability: async () => 'not-configured',
  };
}

export const isMock = useMock;
export { configError };
export const { localTranscriber, localDetector, explainer, localExplainer, localExplainerTiny, draftModel, assistModel, liveModel, warmUpLocalModel, localAvailability, CLOUD_MODEL } = backend;
