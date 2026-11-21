// SlopStop's AI model is QwenSkuld (our fine-tuned Qwen2.5-Coder-1.5B) served locally by Ollama:
// see createOllamaClient and getAiClient below. The Gemini client is kept ONLY for the model
// comparison (server/eval/models.js); the product never uses it.
// Gemini client over plain fetch (no SDK). The key travels only in the x-goog-api-key header and is
// never logged, put in a URL or returned in an error. Tests use createFakeClient instead.
const API = 'https://generativelanguage.googleapis.com/v1beta/models';
// gemini-2.5-flash is closed to new keys; on 2026-11-21 the newer Flash models were often
// overloaded (HTTP 503) or took 35 s+ per call on the free tier, while 3.1-flash-lite answered in
// about 1.6 s. Override with GEMINI_MODEL / GEMINI_FALLBACK_MODELS (comma-separated).
export const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
export const DEFAULT_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class AiError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'AiError';
    this.status = status;
    this.retryable = retryable;
  }
}

export function createGeminiClient({ apiKey, model = DEFAULT_MODEL, fallbacks = [], timeoutMs = 60000, retries = 2, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new AiError('AI not configured: add GEMINI_API_KEY to server/.env');
  let calls = 0;
  let lastModel = null;
  const chain = [model, ...fallbacks.filter((m) => m && m !== model)];

  async function once(systemText, userText, responseSchema, model) {
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

  // A model that is unavailable (404) or still overloaded after retries (429/5xx/timeout) hands the
  // call to the next model in the chain. lastModel records which one actually answered.
  async function withRetries(systemText, userText, responseSchema, m) {
    for (let attempt = 0; ; attempt++) {
      calls++;
      try {
        return await once(systemText, userText, responseSchema, m);
      } catch (e) {
        if (!(e instanceof AiError) || !e.retryable || attempt >= retries) throw e;
        await sleep(1000 * 2 ** attempt + Math.floor(Math.random() * 250));
      }
    }
  }

  return {
    name: `gemini:${chain.join('>')}`,
    get calls() {
      return calls;
    },
    get lastModel() {
      return lastModel;
    },
    async generateJson(systemText, userText, responseSchema) {
      let lastError;
      for (const m of chain) {
        try {
          const out = await withRetries(systemText, userText, responseSchema, m);
          lastModel = m;
          return out;
        } catch (e) {
          lastError = e;
          if (!(e instanceof AiError) || !(e.retryable || e.status === 404)) throw e;
        }
      }
      throw lastError;
    },
  };
}

// Gemini schemas use OpenAPI-style upper-case types ("OBJECT"); Ollama expects JSON Schema ("object").
export function toJsonSchema(s) {
  if (Array.isArray(s)) return s.map(toJsonSchema);
  if (!s || typeof s !== 'object') return s;
  return Object.fromEntries(Object.entries(s).map(([k, v]) => [k, k === 'type' && typeof v === 'string' ? v.toLowerCase() : toJsonSchema(v)]));
}

/**
 * The product's AI model: QwenSkuld (role A's fine-tuned Qwen) or another model served by Ollama.
 * Code never leaves the machine.
 */
export function createOllamaClient({ model, baseUrl = 'http://127.0.0.1:11434', timeoutMs = 120000, fetchImpl = fetch } = {}) {
  if (!model) throw new AiError('Ollama model not set (OLLAMA_MODEL)');
  let calls = 0;
  return {
    name: `ollama:${model}`,
    lastModel: model,
    get calls() {
      return calls;
    },
    async generateJson(systemText, userText, responseSchema) {
      calls++;
      let res;
      try {
        res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            model,
            stream: false,
            format: responseSchema ? toJsonSchema(responseSchema) : 'json',
            options: { temperature: 0.1 },
            messages: [
              { role: 'system', content: systemText },
              { role: 'user', content: userText },
            ],
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        throw new AiError(e.name === 'TimeoutError' ? `Ollama timed out after ${timeoutMs} ms` : `Ollama not reachable at ${baseUrl} (${e.message})`, { retryable: false });
      }
      if (!res.ok) {
        let detail = '';
        try {
          detail = (await res.json())?.error ?? '';
        } catch {}
        throw new AiError(`Ollama returned HTTP ${res.status}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`, { status: res.status });
      }
      const text = (await res.json())?.message?.content ?? '';
      try {
        return JSON.parse(text);
      } catch {
        const m = text.match(/[[{][\s\S]*[\]}]/);
        if (m) {
          try {
            return JSON.parse(m[0]);
          } catch {}
        }
        throw new AiError('Model returned invalid JSON');
      }
    },
  };
}

/**
 * The product's AI client: QwenSkuld via Ollama. OLLAMA_MODEL picks the model (normally QwenSkuld);
 * AI_PROVIDER=ollama alone means QwenSkuld. OLLAMA_URL defaults to http://127.0.0.1:11434.
 * Returns null when neither is set (AI modes then report "not configured", and CI stays offline).
 */
export const PRODUCT_MODEL = 'QwenSkuld';
export function getAiClient(env = process.env) {
  const model = env.OLLAMA_MODEL || (env.AI_PROVIDER === 'ollama' ? PRODUCT_MODEL : '');
  return model ? createOllamaClient({ model, baseUrl: env.OLLAMA_URL || undefined }) : null;
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
