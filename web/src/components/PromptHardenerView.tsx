import React, { useState } from 'react';
import { HardenPromptResponse } from '../types';
import { apiClient } from '../api';
import { ShieldCheck, Copy, Check, Wand2, EyeOff, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { Badge, Button, Callout, Card, CardHeader, CodeBlock, cx } from './ui';

const SAMPLE_PROMPTS = [
  {
    title: 'Stripe & MongoDB backend',
    text: 'Write an Express app that charges customers using Stripe key sk_test_51M0Kx0FakeStripeKey123456789 and connects to mongodb://dbuser:MySuperSecretPass!@cluster0.abc.mongodb.net/prod',
  },
  {
    title: 'OpenAI chat endpoint',
    text: 'Create an endpoint /api/chat that calls OpenAI with sk-proj-abcdef1234567890abcdef1234567890abcdef and finds chats in MongoDB without params.',
  },
  {
    title: 'User query service',
    text: "Generate an Express route /api/users/:id that returns user data and updates password: 'temporary_admin_password_999'",
  },
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
      setResult(await apiClient.hardenPrompt(prompt));
    } catch (err) {
      console.error('Harden prompt failed', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.hardened) return;
    navigator.clipboard.writeText(result.hardened);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Prompt Hardener</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">
          Removes API keys, tokens and database passwords from a prompt before it reaches an AI model, and adds security rules the
          generated code must follow.
        </p>
      </div>

      <Card>
        <CardHeader icon={<Lock className="w-5 h-5" />} title="Your prompt" subtitle="Processed on the local server only." />
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Examples</span>
            {SAMPLE_PROMPTS.map((s) => (
              <button
                key={s.title}
                onClick={() => setPrompt(s.text)}
                className={cx(
                  'h-7 px-2.5 rounded-md border text-xs font-medium transition-colors cursor-pointer',
                  prompt === s.text
                    ? 'bg-sky-50 border-sky-300 text-sky-800'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900',
                )}
              >
                {s.title}
              </button>
            ))}
          </div>
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            aria-label="Prompt"
            placeholder="Paste the prompt you were about to send to an AI coding tool"
            className="w-full px-3.5 py-3 font-mono text-[13px] leading-5 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-slate-900 resize-y"
          />
          <div className="flex justify-end">
            <Button
              onClick={handleHarden}
              disabled={loading || !prompt.trim()}
              icon={loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            >
              {loading ? 'Hardening…' : 'Harden prompt'}
            </Button>
          </div>
        </div>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader
              icon={<EyeOff className="w-5 h-5" />}
              title="Secrets removed"
              action={<Badge tone={result.redactions.length ? 'danger' : 'success'}>{result.redactions.length} found</Badge>}
            />
            <div className="p-5">
              {result.redactions.length === 0 ? (
                <Callout tone="success" icon={<CheckCircle2 className="w-4 h-4" />}>
                  No secrets found in this prompt.
                </Callout>
              ) : (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {result.redactions.map((r, i) => (
                    <li key={i} className="rounded-lg border border-slate-200 px-4 py-3 flex items-center justify-between gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-500">{r.type}</div>
                        <div className="font-mono text-[13px] text-slate-800 truncate">
                          {r.original.length > 14 ? `${r.original.slice(0, 10)}…` : r.original}
                        </div>
                      </div>
                      <Badge tone="danger">Removed</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              icon={<ShieldCheck className="w-5 h-5" />}
              title="Hardened prompt"
              subtitle="Safe to paste into your AI coding tool."
              action={
                <Button
                  variant="secondary"
                  onClick={handleCopy}
                  icon={copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                >
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              }
            />
            <div className="p-5">
              <CodeBlock className="whitespace-pre-wrap max-h-96 overflow-y-auto">{result.hardened}</CodeBlock>
            </div>
          </Card>

          <Card>
            <CardHeader title="Rules added" subtitle={`${result.rules.length} security rules are prepended to the prompt.`} />
            <ol className="p-5 grid grid-cols-1 md:grid-cols-2 gap-3">
              {result.rules.map((rule, i) => (
                <li key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 text-sm leading-5 text-slate-700">
                  <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-xs font-medium flex items-center justify-center flex-shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  {rule}
                </li>
              ))}
            </ol>
          </Card>
        </>
      )}
    </div>
  );
};
