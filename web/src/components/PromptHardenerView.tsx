import React, { useState } from 'react';
import { HardenPromptResponse } from '../types';
import { apiClient } from '../api';
import {
  ShieldCheck,
  Copy,
  Check,
  Sparkles,
  Lock,
  EyeOff,
  CheckCircle2
} from 'lucide-react';

const SAMPLE_PROMPTS = [
  {
    title: "Stripe & MongoDB Backend",
    text: "Write an Express app that charges customers using Stripe key sk_test_51M0Kx0FakeStripeKey123456789 and connects to mongodb://dbuser:MySuperSecretPass!@cluster0.abc.mongodb.net/prod"
  },
  {
    title: "OpenAI Chat Endpoint",
    text: "Create an endpoint /api/chat that calls OpenAI with sk-proj-abcdef1234567890abcdef1234567890abcdef and finds chats in MongoDB without params."
  },
  {
    title: "User Query Service",
    text: "Generate an Express route /api/users/:id that returns user data and updates password: 'temporary_admin_password_999'"
  }
];

export const PromptHardenerView: React.FC = () => {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0].text);
  const [result, setResult] = useState<HardenPromptResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleHarden = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const res = await apiClient.hardenPrompt(prompt);
      setResult(res);
    } catch (err: any) {
      console.error('Harden prompt failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (result?.hardened) {
      navigator.clipboard.writeText(result.hardened);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Title & Context */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <Lock className="w-5 h-5 text-sky-600" />
          <h2 className="text-base font-bold text-slate-900">
            Prompt Hardener (Pre-Generation Privacy & Safety Gate)
          </h2>
        </div>
        <p className="text-xs text-slate-600 mt-1">
          Strips credentials, API tokens, and database passwords before they touch external AI models,
          and injects deterministic security constraints into the AI context window.
        </p>

        {/* Local Security Privacy Guarantee */}
        <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-2 text-xs text-emerald-900">
          <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <div>
            <strong>Strict Privacy Guarantee:</strong> Redacted secret values are processed purely locally and are <strong>not sent anywhere beyond the local server</strong>.
          </div>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Enter AI Coding Prompt:
          </label>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">Load sample prompt:</span>
            {SAMPLE_PROMPTS.map((sample, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(sample.text)}
                className="text-[11px] font-medium text-sky-700 hover:text-sky-900 bg-sky-50 hover:bg-sky-100 px-2 py-0.5 rounded border border-sky-200 transition-colors cursor-pointer"
              >
                {sample.title}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={5}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Paste your vibe-coding prompt here (e.g. including keys, db connections, routes)..."
          className="w-full p-3 font-mono text-xs border border-slate-300 rounded-md bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 text-slate-900"
        />

        <div className="flex justify-end">
          <button
            onClick={handleHarden}
            disabled={loading || !prompt.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-300 text-white text-xs font-semibold rounded-md shadow-sm transition-colors cursor-pointer"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loading ? 'Hardening & Redacting...' : 'Harden Prompt & Redact Secrets'}</span>
          </button>
        </div>
      </div>

      {/* Results Section */}
      {result && (
        <div className="space-y-4">
          {/* Redactions list */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-rose-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Detected & Redacted Secrets ({result.redactions.length})
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200">
                Stripped from payload
              </span>
            </div>

            {result.redactions.length === 0 ? (
              <div className="p-3 bg-slate-50 rounded text-xs text-slate-500">
                No secrets detected in prompt text.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {result.redactions.map((r, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded border border-rose-100 bg-rose-50/40 text-xs flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-rose-800 uppercase text-[10px] block">
                        {r.type}
                      </span>
                      <span className="font-mono text-slate-600 text-[11px] truncate block max-w-xs">
                        {r.original.length > 28 ? `${r.original.slice(0, 24)}...` : r.original}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-rose-200 text-rose-600 font-semibold">
                      REDACTED
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Hardened Prompt Output */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Hardened Prompt Ready for LLM
                </h3>
              </div>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-700 bg-slate-100 hover:bg-slate-200 rounded border border-slate-300 transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Hardened Prompt</span>
                  </>
                )}
              </button>
            </div>

            <pre className="p-4 bg-slate-900 text-slate-100 rounded-md font-mono text-xs overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-96">
              <code>{result.hardened}</code>
            </pre>
          </div>

          {/* Enforced Rules List */}
          <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
              Injected Security Invariants ({result.rules.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {result.rules.map((rule, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded bg-slate-50 border border-slate-100 text-xs text-slate-700"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-sky-600 mt-0.5 flex-shrink-0" />
                  <span>{rule}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
