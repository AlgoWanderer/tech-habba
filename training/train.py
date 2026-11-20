"""LoRA fine-tune of Qwen2.5-Coder-1.5B-Instruct for SlopStop (Phase 2, role A).

Native Windows, plain transformers + PEFT + TRL (no Unsloth/WSL): the 1.5B model fits an 8 GB
RTX 4060 in bf16 without 4-bit loading, so bitsandbytes is not needed.

  python train.py --smoke     # 20 examples, 5 steps: proves the pipeline end to end
  python train.py             # full run (hyperparameters from the Phase 2 plan)
  python train.py --merge     # merge the adapter into the base model for Ollama import

Loss is on the assistant JSON only (prompt-completion format): the code is the prompt.
Writes out/lora (adapter), out/merged (for --merge) and out/metrics.json (loss per epoch).
"""
import argparse
import json
import time
from pathlib import Path

import torch
from datasets import load_dataset
from peft import LoraConfig, PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'
OUT = ROOT / 'out'
BASE = 'Qwen/Qwen2.5-Coder-1.5B-Instruct'


def to_prompt_completion(example):
    msgs = example['messages']
    return {'prompt': msgs[:-1], 'completion': msgs[-1:]}


def load_splits(smoke):
    ds = load_dataset('json', data_files={'train': str(DATA / 'train.jsonl'), 'val': str(DATA / 'val.jsonl')})
    ds = ds.remove_columns([c for c in ds['train'].column_names if c != 'messages'])
    ds = ds.map(to_prompt_completion, remove_columns=['messages'])
    if smoke:
        ds['train'] = ds['train'].select(range(20))
        ds['val'] = ds['val'].select(range(10))
    return ds


def train(smoke):
    t0 = time.time()
    tok = AutoTokenizer.from_pretrained(BASE)
    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.bfloat16, attn_implementation='sdpa')
    ds = load_splits(smoke)

    lora = LoraConfig(
        r=16, lora_alpha=16, lora_dropout=0.0, bias='none', task_type='CAUSAL_LM',
        target_modules=['q_proj', 'k_proj', 'v_proj', 'o_proj', 'gate_proj', 'up_proj', 'down_proj'],
    )
    cfg = SFTConfig(
        output_dir=str(OUT / ('smoke' if smoke else 'run')),
        per_device_train_batch_size=2,
        per_device_eval_batch_size=2,
        gradient_accumulation_steps=4,
        learning_rate=2e-4,
        num_train_epochs=2,
        max_steps=5 if smoke else -1,
        warmup_steps=0 if smoke else 10,
        lr_scheduler_type='linear',
        seed=42,
        bf16=torch.cuda.is_bf16_supported(),
        gradient_checkpointing=True,
        logging_steps=1 if smoke else 10,
        eval_strategy='epoch',
        save_strategy='no',
        report_to='none',
        max_length=2048,
        completion_only_loss=True,
        dataloader_num_workers=0,  # Windows: avoid worker spawn issues
    )
    trainer = SFTTrainer(model=model, args=cfg, train_dataset=ds['train'], eval_dataset=ds['val'],
                         processing_class=tok, peft_config=lora)
    trainer.model.print_trainable_parameters()
    trainer.train()
    final_eval = trainer.evaluate()

    if smoke:
        print('SMOKE OK:', json.dumps(final_eval))
        return
    trainer.model.save_pretrained(str(OUT / 'lora'))
    tok.save_pretrained(str(OUT / 'lora'))

    history = trainer.state.log_history
    metrics = {
        'base_model': BASE,
        'method': 'LoRA (PEFT), bf16, loss on assistant JSON only',
        'gpu': torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'cpu',
        'examples': {'train': len(ds['train']), 'val': len(ds['val'])},
        'hyperparameters': {'r': 16, 'lora_alpha': 16, 'lora_dropout': 0, 'batch_size': 2, 'grad_accum': 4,
                            'learning_rate': 2e-4, 'epochs': 2, 'warmup_steps': 10, 'scheduler': 'linear', 'seed': 42},
        'train_loss': [{'epoch': round(h['epoch'], 2), 'loss': h['loss']} for h in history if 'loss' in h],
        'val_loss': [{'epoch': round(h['epoch'], 2), 'loss': h['eval_loss']} for h in history if 'eval_loss' in h],
        'final_val_loss': final_eval.get('eval_loss'),
        'train_minutes': round((time.time() - t0) / 60, 1),
    }
    (OUT / 'metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    print(json.dumps(metrics, indent=2))


def merge():
    tok = AutoTokenizer.from_pretrained(BASE)
    base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16)
    merged = PeftModel.from_pretrained(base, str(OUT / 'lora')).merge_and_unload()
    merged.save_pretrained(str(OUT / 'merged'), safe_serialization=True)
    tok.save_pretrained(str(OUT / 'merged'))
    print('merged ->', OUT / 'merged')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--smoke', action='store_true')
    ap.add_argument('--merge', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(exist_ok=True)
    merge() if a.merge else train(a.smoke)
