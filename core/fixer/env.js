// Env var bookkeeping for secret fixes: unique names, .env content, .env.example content.

export class EnvRegistry {
  constructor() {
    this.vars = new Map(); // name -> value ('' = placeholder only)
  }

  /** Reserve a name for a value; same value reuses the name, a different one gets _2, _3, ... */
  claim(base, value) {
    let name = base;
    for (let i = 2; this.vars.has(name) && this.vars.get(name) !== value; i += 1) name = `${base}_${i}`;
    this.vars.set(name, value);
    return name;
  }

  placeholder(name) {
    if (!this.vars.has(name)) this.vars.set(name, '');
  }

  get size() {
    return this.vars.size;
  }

  /** .env content holding the real values (never commit it; .env is gitignored). */
  envFile() {
    return [...this.vars].map(([k, v]) => `${k}=${quote(v)}\n`).join('');
  }

  /** .env.example: existing content plus any names it is missing, with empty values. */
  envExample(existing = '') {
    const have = new Set([...existing.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1]));
    const missing = [...this.vars.keys()].filter((k) => !have.has(k));
    if (!missing.length) return existing;
    const sep = existing && !existing.endsWith('\n') ? '\n' : '';
    return `${existing}${sep}${missing.map((k) => `${k}=\n`).join('')}`;
  }
}

/** dotenv-compatible value: bare when simple, double-quoted with \n escapes otherwise. */
export function quote(v) {
  if (v === '' || /^[A-Za-z0-9_./:@+\-=,%~]*$/.test(v)) return v;
  return JSON.stringify(v);
}
