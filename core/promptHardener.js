/**
 * SlopStop Prompt Hardener
 * Pure function: deterministic regex-based secret redaction and safety constraint wrapping.
 * No LLM. No network calls.
 */

export const DEFAULT_RULES = [
  "Use environment variables (process.env) for all secrets, credentials, and URIs",
  "Never hard-code credentials in source code or client configs",
  "Validate and sanitise all incoming request data (body, query, params) with explicit types",
  "Parameterise all database queries (never pass raw input objects into NoSQL/SQL sinks)",
  "Add authentication and authorization middleware to all non-public Express routes",
  "Check resource ownership on all entity lookups by ID to prevent IDOR/BOLA",
  "Pin exact dependency versions and audit packages before installation"
];

/**
 * Hardens an AI coding prompt by redacting secret credentials and appending
 * pre-ship security invariants.
 *
 * @param {string} prompt
 * @returns {{ hardened: string, redactions: Array<{type: string, original: string}>, rules: string[] }}
 */
export function harden(prompt) {
  if (typeof prompt !== 'string') {
    return {
      hardened: '',
      redactions: [],
      rules: [...DEFAULT_RULES]
    };
  }

  const redactions = [];
  let redactedPrompt = prompt;

  let secretIndex = 1;
  let uriIndex = 1;
  let jwtIndex = 1;
  let passwordIndex = 1;

  // 1. MongoDB URIs with credentials: mongodb(+srv)://user:password@host/db
  const mongoUriRegex = /mongodb(?:\+srv)?:\/\/[a-zA-Z0-9_.\-%]+:[^@\s"']+@[a-zA-Z0-9_.\-%]+(?::\d+)?\/?[^\s"']*/g;
  redactedPrompt = redactedPrompt.replace(mongoUriRegex, (match) => {
    redactions.push({ type: 'mongodb_uri', original: match });
    const placeholder = `<MONGODB_URI_${uriIndex++}>`;
    return placeholder;
  });

  // 2. JWTs (three base64url segments separated by dots, starting with eyJ)
  const jwtRegex = /\beyJ[a-zA-Z0-9_\-]{10,}\.eyJ[a-zA-Z0-9_\-]{10,}\.[a-zA-Z0-9_\-]{10,}\b/g;
  redactedPrompt = redactedPrompt.replace(jwtRegex, (match) => {
    redactions.push({ type: 'jwt', original: match });
    const placeholder = `<JWT_TOKEN_${jwtIndex++}>`;
    return placeholder;
  });

  // 3. Known API Key shapes (Stripe, OpenAI, AWS, GitHub)
  const stripeRegex = /\b(?:sk|pk|rk)_(?:live|test)_[a-zA-Z0-9]{10,}\b/g;
  redactedPrompt = redactedPrompt.replace(stripeRegex, (match) => {
    redactions.push({ type: 'api_key_stripe', original: match });
    return `<API_KEY_${secretIndex++}>`;
  });

  const openaiRegex = /\bsk-(?:proj-)?[a-zA-Z0-9_-]{16,}\b/g;
  redactedPrompt = redactedPrompt.replace(openaiRegex, (match) => {
    redactions.push({ type: 'api_key_openai', original: match });
    return `<API_KEY_${secretIndex++}>`;
  });

  const awsKeyRegex = /\bAKIA[0-9A-Z]{16}\b/g;
  redactedPrompt = redactedPrompt.replace(awsKeyRegex, (match) => {
    redactions.push({ type: 'aws_access_key', original: match });
    return `<API_KEY_${secretIndex++}>`;
  });

  const githubTokenRegex = /\b(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36}\b/g;
  redactedPrompt = redactedPrompt.replace(githubTokenRegex, (match) => {
    redactions.push({ type: 'github_token', original: match });
    return `<API_KEY_${secretIndex++}>`;
  });

  // 4. Passwords after password/pwd/passwd key
  const passwordAssignRegex = /(?:\b(?:password|passwd|pwd|secret)\s*[:=]\s*["']?)([^"'\s,;]{4,})(?:["']?)/gi;
  redactedPrompt = redactedPrompt.replace(passwordAssignRegex, (match, capturedPassword) => {
    // Avoid double-redacting placeholders
    if (capturedPassword.startsWith('<') && capturedPassword.endsWith('>')) {
      return match;
    }
    redactions.push({ type: 'password', original: capturedPassword });
    const placeholder = `<PASSWORD_${passwordIndex++}>`;
    return match.replace(capturedPassword, placeholder);
  });

  // 5. Long high-entropy tokens / bearer tokens
  const bearerRegex = /\bBearer\s+([a-zA-Z0-9_\-\.]{24,})\b/gi;
  redactedPrompt = redactedPrompt.replace(bearerRegex, (match, capturedToken) => {
    if (capturedToken.startsWith('<') && capturedToken.endsWith('>')) {
      return match;
    }
    redactions.push({ type: 'bearer_token', original: capturedToken });
    const placeholder = `<TOKEN_${secretIndex++}>`;
    return `Bearer ${placeholder}`;
  });

  // Compose hardened output with fixed rule block
  const ruleBlock = [
    '### MANDATORY SECURITY INSTRUCTIONS & INVARIANTS',
    'Follow these rules deterministically. Do not omit security controls:',
    ...DEFAULT_RULES.map((rule, idx) => `${idx + 1}. ${rule}.`),
    '',
    '### REDACTED USER PROMPT:',
    redactedPrompt.trim()
  ].join('\n');

  return {
    hardened: ruleBlock,
    redactions,
    rules: [...DEFAULT_RULES]
  };
}
