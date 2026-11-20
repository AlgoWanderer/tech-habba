// Gemini client over plain fetch (no SDK). The key travels only in the x-goog-api-key header and is
// never logged, put in a URL or returned in an error. Tests use createFakeClient instead.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_MODEL = 'gemini-2.5-flash';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AiError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function createGeminiClient({ apiKey, model = DEFAULT_MODEL, timeoutMs = 30000, retries = 2, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new AiError('AI not configured: add GEMINI_API_KEY to server/.env');
  let calls = 0;

  async function once(systemText, userText, responseSchema) {
    const body = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', ...(responseSchema ? { responseSchema } : {}) },
    };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(`${API}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch (e) {
      throw new AiError(e.name === 'AbortError' ? `Model timed out after ${timeoutMs} ms` : `Model request failed: ${e.message}`, { retryable: true });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message ?? '';
      } catch {}
      const retryable = res.status === 429 || res.status >= 500;
      throw new AiError(`Model returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}`, { status: res.status, retryable });
    }
    const json = await res.json();
    const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) throw new AiError(`Model returned no content (${json?.candidates?.[0]?.finishReason ?? json?.promptFeedback?.blockReason ?? 'unknown reason'})`);
    try {
      return JSON.parse(text);
    } catch {
      throw new AiError('Model returned invalid JSON', { retryable: true });
    }
  }

  return {
    name: `gemini:${model}`,
    get calls() {
      return calls;
    },
    async generateJson(systemText, userText, responseSchema) {
      for (let attempt = 0; ; attempt++) {
        calls++;
        try {
          return await once(systemText, userText, responseSchema);
        } catch (e) {
          if (!(e instanceof AiError) || !e.retryable || attempt >= retries) throw e;
          await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
        }
      }
    },
  };
}

/** The configured client, or null when there is no key (AI features then report "not configured"). */
export function getAiClient(env = process.env) {
  return env.GEMINI_API_KEY ? createGeminiClient({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL || DEFAULT_MODEL }) : null;
}

/**
 * Test double. `respond(systemText, userText)` returns the parsed JSON the model would return
 * (or throws). Records every call so tests can check what was sent.
 */
export function createFakeClient(respond) {
  const sent = [];
  return {
    name: 'fake',
    sent,
    get calls() {
      return sent.length;
    },
    async generateJson(systemText, userText) {
      sent.push({ systemText, userText });
      return respond(systemText, userText, sent.length);
    },
  };
}
