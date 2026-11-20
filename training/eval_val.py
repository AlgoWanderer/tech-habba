"""Score Ollama models on the held-out validation split (Phase 2, role A).

  python eval_val.py qwen2.5-coder:1.5b slopstop-qwen

For each val example, sends the same system prompt + code to the model (JSON mode, temperature 0.1)
and checks: valid JSON with the expected keys, the vulnerable yes/no verdict, and the category.
NOTE: val comes from the same public datasets as train (held out by pair), so it measures
in-distribution performance. The SlopStop corpus/ apps are the real out-of-distribution test (B).
Standard library only; writes out/eval_val.json.
"""
import json
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
URL = 'http://localhost:11434/api/chat'
CATS = {'secret', 'injection', 'auth', 'idor', 'dependency', 'none'}


def ask(model, messages):
    body = json.dumps({'model': model, 'messages': messages, 'stream': False, 'format': 'json',
                       'options': {'temperature': 0.1}}).encode()
    req = urllib.request.Request(URL, data=body, headers={'content-type': 'application/json'})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())['message']['content']


def score(model, rows):
    s = Counter()
    per_cat = Counter()
    per_cat_ok = Counter()
    t0 = time.time()
    for r in rows:
        want = json.loads(r['messages'][2]['content'])
        try:
            got = json.loads(ask(model, r['messages'][:2]))
            valid = isinstance(got.get('vulnerable'), bool) and got.get('category') in CATS
        except Exception:
            got, valid = {}, False
        s['total'] += 1
        s['valid_json'] += valid
        s['verdict_ok'] += valid and got['vulnerable'] == want['vulnerable']
        s['category_ok'] += valid and got['category'] == want['category']
        per_cat[want['category']] += 1
        per_cat_ok[want['category']] += valid and got['category'] == want['category']
        if want['vulnerable']:
            s['vulnerable_total'] += 1
            s['vulnerable_caught'] += valid and got['vulnerable'] is True
        else:
            s['safe_total'] += 1
            s['false_alarm'] += valid and got['vulnerable'] is True
    n = s['total']
    return {
        'model': model,
        'examples': n,
        'valid_json': f"{s['valid_json']}/{n}",
        'verdict_accuracy': round(s['verdict_ok'] / n, 3),
        'category_accuracy': round(s['category_ok'] / n, 3),
        'vulnerable_caught': f"{s['vulnerable_caught']}/{s['vulnerable_total']}",
        'false_alarms_on_safe': f"{s['false_alarm']}/{s['safe_total']}",
        'category_accuracy_by_label': {c: f'{per_cat_ok[c]}/{per_cat[c]}' for c in sorted(per_cat)},
        'seconds': round(time.time() - t0, 1),
    }


def main():
    rows = [json.loads(l) for l in open(ROOT / 'data' / 'val.jsonl', encoding='utf-8') if l.strip()]
    results = [score(m, rows) for m in sys.argv[1:]]
    (ROOT / 'out').mkdir(exist_ok=True)
    (ROOT / 'out' / 'eval_val.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    main()
