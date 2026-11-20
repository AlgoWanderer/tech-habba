"""Base vs fine-tuned Qwen on the held-out validation split, directly in transformers (no Ollama).

  python eval_hf.py

Same system prompt, same code, greedy decoding, bf16 for both; the only difference is the LoRA
adapter in out/lora. Scores: valid JSON, vulnerable yes/no verdict, category. Writes
out/eval_hf.json. NOTE: val is held out by pair but comes from the same public datasets as train,
so this is in-distribution; the SlopStop corpus/ apps are the out-of-distribution test.
"""
import json
import re
import time
from collections import Counter
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent
BASE = 'Qwen/Qwen2.5-Coder-1.5B-Instruct'
CATS = {'secret', 'injection', 'auth', 'idor', 'dependency', 'none'}


def parse(text):
    m = re.search(r'\{.*\}', text, re.S)
    try:
        got = json.loads(m.group(0)) if m else {}
    except json.JSONDecodeError:
        got = {}
    ok = isinstance(got.get('vulnerable'), bool) and got.get('category') in CATS
    return got, ok


@torch.no_grad()
def run(model, tok, rows, label):
    s, per, per_ok = Counter(), Counter(), Counter()
    t0 = time.time()
    for r in rows:
        want = json.loads(r['messages'][2]['content'])
        ids = tok.apply_chat_template(r['messages'][:2], add_generation_prompt=True, return_tensors='pt', return_dict=True).to(model.device)
        out = model.generate(**ids, max_new_tokens=120, do_sample=False, pad_token_id=tok.eos_token_id)
        got, ok = parse(tok.decode(out[0][ids['input_ids'].shape[1]:], skip_special_tokens=True))
        s['n'] += 1
        s['valid'] += ok
        s['verdict'] += ok and got['vulnerable'] == want['vulnerable']
        s['category'] += ok and got['category'] == want['category']
        per[want['category']] += 1
        per_ok[want['category']] += ok and got['category'] == want['category']
        if want['vulnerable']:
            s['vuln'] += 1
            s['caught'] += ok and got['vulnerable'] is True
        else:
            s['safe'] += 1
            s['false_alarm'] += ok and got['vulnerable'] is True
    n = s['n']
    res = {
        'model': label,
        'examples': n,
        'valid_json': f"{s['valid']}/{n}",
        'verdict_accuracy': round(s['verdict'] / n, 3),
        'category_accuracy': round(s['category'] / n, 3),
        'vulnerable_caught': f"{s['caught']}/{s['vuln']}",
        'false_alarms_on_safe': f"{s['false_alarm']}/{s['safe']}",
        'category_accuracy_by_label': {c: f'{per_ok[c]}/{per[c]}' for c in sorted(per)},
        'seconds': round(time.time() - t0, 1),
    }
    print(json.dumps(res))
    return res


def main():
    rows = [json.loads(l) for l in open(ROOT / 'data' / 'val.jsonl', encoding='utf-8') if l.strip()]
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16).to('cuda').eval()
    results = [run(model, tok, rows, 'base Qwen2.5-Coder-1.5B-Instruct')]
    model = PeftModel.from_pretrained(model, str(ROOT / 'out' / 'lora')).eval()
    results.append(run(model, tok, rows, 'fine-tuned (base + SlopStop LoRA)'))
    (ROOT / 'out' / 'eval_hf.json').write_text(json.dumps(results, indent=2), encoding='utf-8')


if __name__ == '__main__':
    main()
