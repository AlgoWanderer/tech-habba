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

  it('handles empty or non-string input safely', () => {
    const result = harden('');
    expect(result.redactions).toEqual([]);
    expect(result.rules.length).toBeGreaterThan(0);
  });
});
