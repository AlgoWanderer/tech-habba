import { describe, it, expect } from 'vitest';
import { harden, DEFAULT_RULES } from './promptHardener.js';

describe('promptHardener', () => {
  it('redacts Stripe API keys and MongoDB connection strings with passwords', () => {
    const input = 'Connect to mongodb://admin:secret123@cluster0.abc.mongodb.net/mydb and initialize Stripe with sk_test_51Abcdef1234567890abcdef123456';
    const result = harden(input);

    expect(result.redactions.length).toBe(2);
    expect(result.hardened).not.toContain('secret123');
    expect(result.hardened).not.toContain('sk_test_51Abcdef1234567890abcdef123456');
    expect(result.hardened).toContain('<MONGODB_URI_1>');
    expect(result.hardened).toContain('<API_KEY_');
  });

  it('redacts passwords in key-value formats', () => {
    const input = 'Create a login service with password: "SuperSecretPassword99!" and user admin';
    const result = harden(input);

    expect(result.redactions.some(r => r.original === 'SuperSecretPassword99!')).toBe(true);
    expect(result.hardened).not.toContain('SuperSecretPassword99!');
    expect(result.hardened).toContain('<PASSWORD_1>');
  });

  it('redacts OpenAI keys and JWT tokens', () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const input = `Use key sk-proj-1234567890abcdefghijklmnopqrstuvwxyz and token ${fakeJwt}`;
    const result = harden(input);

    expect(result.hardened).not.toContain('sk-proj-1234567890abcdefghijklmnopqrstuvwxyz');
    expect(result.hardened).not.toContain(fakeJwt);
    expect(result.hardened).toContain('<JWT_TOKEN_1>');
  });

  it('wraps the prompt with mandatory security rules', () => {
    const input = 'Write an express route to fetch all users by id';
    const result = harden(input);

    expect(result.rules).toEqual(DEFAULT_RULES);
    expect(result.hardened).toContain('### MANDATORY SECURITY INSTRUCTIONS & INVARIANTS');
    expect(result.hardened).toContain('Check resource ownership on all entity lookups by ID to prevent IDOR/BOLA');
    expect(result.hardened).toContain('Write an express route to fetch all users by id');
  });

  it('redacts short Stripe keys (16 chars) discovered during wild corpus evaluation', () => {
    // Wild corpus prompt app03: sk_live_51PqR7sKx9TmW2vYc has only 16 chars after sk_live_
    const input = 'Integrate Stripe payments. My Stripe key is sk_live_51PqR7sKx9TmW2vYc.';
    const result = harden(input);

    expect(result.redactions.length).toBe(1);
    expect(result.redactions[0].type).toBe('api_key_stripe');
    expect(result.redactions[0].original).toBe('sk_live_51PqR7sKx9TmW2vYc');
    expect(result.hardened).not.toContain('sk_live_51PqR7sKx9TmW2vYc');
    expect(result.hardened).toContain('<API_KEY_1>');
  });

  it('redacts short OpenAI keys (16 chars) discovered during wild corpus evaluation', () => {
    // Wild corpus prompt app09: sk-proj-a8F3kL0pQ2wE9rT6yU1iO4 has 16 chars after sk-proj-
    const input = 'Use the OpenAI API to suggest short names, my key is sk-proj-a8F3kL0pQ2wE9rT6yU1iO4.';
    const result = harden(input);

    expect(result.redactions.length).toBe(1);
    expect(result.redactions[0].type).toBe('api_key_openai');
    expect(result.redactions[0].original).toBe('sk-proj-a8F3kL0pQ2wE9rT6yU1iO4');
    expect(result.hardened).not.toContain('sk-proj-a8F3kL0pQ2wE9rT6yU1iO4');
    expect(result.hardened).toContain('<API_KEY_1>');
  });

  it('handles empty or non-string input safely', () => {
    const result = harden('');
    expect(result.redactions).toEqual([]);
    expect(result.rules.length).toBeGreaterThan(0);
  });
});
