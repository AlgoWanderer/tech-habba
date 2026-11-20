"""Build the fine-tuning set for slopstop-qwen (Phase 2, role A).

Sources (downloaded to training/data/raw/, git-ignored; never committed):
  - CyberNative/Code_Vulnerability_Security_DPO   Apache-2.0  (rejected = insecure, chosen = secure)
  - ismailtasdelen/SecureCodePairs                 MIT         (vulnerable_code / secure_code + CWE)
Only JavaScript/TypeScript rows are used. The SlopStop corpus/ apps are the TEST set and are never
read here.

Every pair gives two examples: insecure -> vulnerable=true with a mapped category, secure ->
vulnerable=false / "none". Pairs whose flaw is not one of the five SlopStop categories are dropped.
Split 90/10 BY PAIR (seed 42), so both halves of a pair land in the same split.
Output: training/data/train.jsonl, training/data/val.jsonl (chat "messages" format), and
training/data/stats.json. Standard library only.
"""
import json
import random
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / 'data' / 'raw'
OUT = ROOT / 'data'

SYSTEM = (
    'You are a security reviewer for Node.js/Express code. Answer with JSON only: '
    '{"vulnerable": bool, "category": "secret|injection|auth|idor|dependency|none", "reason": string}.'
)
SAFE_REASON = 'No exploitable flaw of the five kinds.'
MAX_CHARS = 5000  # ~1,500 tokens for code (about 3.3 chars per token)

CWE_MAP = {
    'secret': {798, 259, 321, 312},
    'injection': {89, 943, 78, 77, 22, 79, 94, 95},
    'auth': {287, 306, 862, 352},
    'idor': {639, 284, 285, 566},
    'dependency': {1104, 937, 1035},
}
# Keyword fallback, checked in this order (IDOR before auth: an IDOR text often says "unauthorized").
KEYWORDS = [
    ('idor', r'insecure direct object|\bidor\b|another user\'?s|other users\'? (?:data|records|objects)'),
    ('secret', r'hard[- ]?coded|hardcoded|plain ?text (?:password|credential)|(?:api|secret) key in|credentials? (?:in|stored)|exposed (?:secret|key|token)'),
    ('injection', r'sql injection|nosql|command injection|code injection|os command|\beval\b|cross[- ]site scripting|\bxss\b|path traversal|directory traversal|template injection'),
    ('auth', r'authenticat|authoriz|cross[- ]site request forgery|\bcsrf\b|missing (?:auth|access control)|unauthori[sz]ed access'),
    ('dependency', r'outdated|vulnerable (?:dependency|package|library|version)|third[- ]party (?:package|library)'),
]


def category_from_cwe(cwe_text):
    for num in map(int, re.findall(r'CWE-(\d+)', cwe_text or '')):
        for cat, ids in CWE_MAP.items():
            if num in ids:
                return cat
    return None


NOT_OURS = re.compile(r'timing attack|type confusion|prototype pollution|deserializ|regular expression denial|redos|buffer overflow|race condition')


def category_from_text(text):
    low = (text or '').lower()
    if NOT_OURS.search(low):  # mentions auth/injection words but is a different class of flaw
        return None
    for cat, pattern in KEYWORDS:
        if re.search(pattern, low):
            return cat
    return None


FENCE = re.compile(r'^\s*```[\w+-]*\s*\n(.*?)\n?```\s*$', re.S)


def strip_fence(code):
    m = FENCE.match(code or '')
    return strip_comments((m.group(1) if m else (code or '')).strip())


# Comments like "// Vulnerable: hardcoded" or "// Secure version" give the label away; the model
# would learn to read comments instead of code. Strip all comments (strings, URLs left alone).
BLOCK_COMMENT = re.compile(r'/\*.*?\*/', re.S)
LINE_COMMENT = re.compile(r'(^|[\s;{}(),])//[^\n]*', re.M)


def strip_comments(code):
    code = BLOCK_COMMENT.sub('', code)
    code = LINE_COMMENT.sub(lambda m: m.group(1), code)
    lines = [ln.rstrip() for ln in code.split('\n')]
    out = []
    for ln in lines:  # drop blank runs left behind
        if ln or (out and out[-1]):
            out.append(ln)
    return '\n'.join(out).strip()


def first_sentence(text):
    text = re.sub(r'\s+', ' ', text or '').strip()
    m = re.match(r'(.+?[.!?])(\s|$)', text)
    return (m.group(1) if m else text)[:240]


def read_jsonl(path):
    with open(path, encoding='utf-8') as f:
        return [json.loads(line) for line in f if line.strip()]


def load_pairs():
    pairs, dropped = [], Counter()
    for r in read_jsonl(RAW / 'CyberNative_Code_Vulnerability_Security_DPO__secure_programming_dpo.json'):
        if str(r.get('lang', '')).lower() not in ('javascript', 'typescript'):
            continue
        cat = category_from_text(r.get('vulnerability'))
        if not cat:
            dropped['cybernative: other category'] += 1
            continue
        pairs.append({'source': 'CyberNative', 'category': cat, 'reason': first_sentence(r['vulnerability']),
                      'insecure': strip_fence(r['rejected']), 'secure': strip_fence(r['chosen'])})
    for split in ('train', 'validation', 'test'):
        for r in read_jsonl(RAW / f'ismailtasdelen_SecureCodePairs__{split}.jsonl'):
            if str(r.get('language', '')).lower() not in ('javascript', 'typescript'):
                continue
            # Trust the CWE when there is one; keywords only when the row has no CWE at all.
            has_cwe = bool(re.search(r'CWE-\d+', str(r.get('cwe') or '')))
            cat = category_from_cwe(r.get('cwe')) if has_cwe else category_from_text(' '.join(str(r.get(k, '')) for k in ('title', 'description', 'root_cause')))
            if not cat:
                dropped['securecodepairs: other category'] += 1
                continue
            pairs.append({'source': 'SecureCodePairs', 'category': cat,
                          'reason': first_sentence(r.get('description') or r.get('root_cause')),
                          'insecure': strip_fence(r['vulnerable_code']), 'secure': strip_fence(r['secure_code'])})
    return pairs, dropped


def clean(pairs, dropped):
    seen, kept = set(), []
    for p in pairs:
        if not p['insecure'] or not p['secure'] or p['insecure'] == p['secure']:
            dropped['empty or identical pair'] += 1
            continue
        if max(len(p['insecure']), len(p['secure'])) > MAX_CHARS:
            dropped['too long (> ~1,500 tokens)'] += 1
            continue
        key = (p['insecure'], p['secure'])
        if key in seen:
            dropped['duplicate pair'] += 1
            continue
        seen.add(key)
        kept.append(p)
    return kept


def to_examples(p):
    def ex(code, answer):
        return {'messages': [
            {'role': 'system', 'content': SYSTEM},
            {'role': 'user', 'content': code},
            {'role': 'assistant', 'content': json.dumps(answer, ensure_ascii=False)},
        ], 'meta': {'source': p['source'], 'category': answer['category']}}
    return [
        ex(p['insecure'], {'vulnerable': True, 'category': p['category'], 'reason': p['reason']}),
        ex(p['secure'], {'vulnerable': False, 'category': 'none', 'reason': SAFE_REASON}),
    ]


def main():
    pairs, dropped = load_pairs()
    pairs = clean(pairs, dropped)
    random.Random(42).shuffle(pairs)
    n_val = max(1, round(len(pairs) * 0.10))
    splits = {'val': pairs[:n_val], 'train': pairs[n_val:]}

    stats = {'pairs_kept': len(pairs), 'dropped': dict(dropped), 'splits': {}}
    for name, ps in splits.items():
        examples = [e for p in ps for e in to_examples(p)]
        with open(OUT / f'{name}.jsonl', 'w', encoding='utf-8') as f:
            for e in examples:
                f.write(json.dumps(e, ensure_ascii=False) + '\n')
        stats['splits'][name] = {
            'pairs': len(ps),
            'examples': len(examples),
            'by_category': dict(Counter(e['meta']['category'] for e in examples)),
            'by_source': dict(Counter(e['meta']['source'] for e in examples)),
        }
    (OUT / 'stats.json').write_text(json.dumps(stats, indent=2), encoding='utf-8')
    print(json.dumps(stats, indent=2))
    total = sum(s['examples'] for s in stats['splits'].values())
    if total < 300:
        print(f'WARNING: only {total} examples; tell B this limits what we can claim.')


if __name__ == '__main__':
    main()
