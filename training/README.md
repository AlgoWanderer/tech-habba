# slopstop-qwen: fine-tuned Qwen2.5-Coder-1.5B (Phase 2, role A)

A small open code model fine-tuned to review a Node.js/Express snippet and answer in JSON:

```json
{"vulnerable": true, "category": "secret|injection|auth|idor|dependency|none", "reason": "<one sentence>"}
```

It is one arm of the Phase 2 comparison: **rules vs Gemini vs base Qwen vs fine-tuned Qwen**.

**Why our own model:** the Gemini API can only be prompted, not fine-tuned, and sends code off the machine.
QwenSkuld (the served name of this model) runs offline on a laptop, answers in 0.6 s instead of 4.9 s, costs nothing
per call, and fine-tuning took it from 44% to 66% accuracy with 0 unusable answers on apps it never saw. See
[Why QwenSkuld](../README.md#why-qwenskuld-our-own-fine-tuned-model-instead-of-the-gemini-api) in the main README.

## Result (held-out validation split, 68 examples)

Same prompt, same code, greedy decoding, bf16; the only difference is the LoRA adapter
(`eval_hf.py` -> `out/eval_hf.json`).

| | Base Qwen2.5-Coder-1.5B-Instruct | Fine-tuned |
|---|---|---|
| Vulnerable vs safe (verdict) accuracy | 52.9% | **82.4%** |
| Category accuracy | 48.5% | **79.4%** |
| Vulnerable snippets caught | 12/34 | **26/34** |
| False alarms on safe code | 10/34 | **4/34** |
| Injection | 11/26 | 21/26 |
| IDOR | 0/6 | 3/6 |
| Auth | 0/2 | 0/2 |
| Valid JSON | 68/68 | 68/68 |

**Read this honestly:**
- Validation is held out **by pair** but comes from the same public datasets as training, so it is
  in-distribution. The SlopStop `corpus/` apps (never used here) are the out-of-distribution test.
- Secret, auth and dependency have almost no training data (3, 6 and 0 examples), so the model
  cannot be expected to learn them; SlopStop's deterministic rules cover those.
- 68 examples is small: one example is about 1.5 percentage points.

## Data

| Dataset | License | Used |
|---|---|---|
| [CyberNative/Code_Vulnerability_Security_DPO](https://huggingface.co/datasets/CyberNative/Code_Vulnerability_Security_DPO) | Apache-2.0 | 424 JavaScript pairs (`rejected` = insecure, `chosen` = secure) |
| [ismailtasdelen/SecureCodePairs](https://huggingface.co/datasets/ismailtasdelen/SecureCodePairs) | MIT | 35 JavaScript/TypeScript pairs (`vulnerable_code` / `secure_code`, with CWE) |

`prepare_data.py` (standard library only):
- Each pair gives two examples: insecure -> `vulnerable: true` + category; secure -> `vulnerable: false`, `none`.
- Category from the CWE when the row has one (the plan's CWE table), otherwise from description
  keywords. Pairs outside the five categories, or with a CWE outside the table, are **dropped**.
- **All code comments are stripped**: the sources contain giveaways like `// Vulnerable: hardcoded`,
  which would teach the model to read comments instead of code.
- Duplicates and oversize snippets dropped; shuffled with seed 42; split 90/10 **by pair**.

Final counts (340 pairs kept; 92 + 19 dropped as other categories, 7 duplicates, 1 empty):

| split | examples | injection | idor | auth | secret | dependency | none |
|---|---|---|---|---|---|---|---|
| train | 612 | 260 | 37 | 6 | 3 | 0 | 306 |
| val | 68 | 26 | 6 | 2 | 0 | 0 | 34 |

The SlopStop `corpus/` apps are the test set and are never read by any script here.

## Training

| | |
|---|---|
| Base | `Qwen/Qwen2.5-Coder-1.5B-Instruct` (Apache-2.0) |
| Method | LoRA via PEFT + TRL `SFTTrainer`, bf16, loss on the assistant JSON only |
| LoRA | r 16, alpha 16, dropout 0, attention + MLP projections (18.5M trainable params, 1.2%) |
| Optimisation | batch 2 x grad-accum 4, lr 2e-4 linear, 10 warmup steps, 2 epochs, seed 42 |
| Hardware | NVIDIA RTX 4060 Laptop GPU (8 GB), native Windows, Python 3.12, torch 2.11 + CUDA 12.8 |
| Time | 5.4 minutes |
| Loss | train 1.29 -> 0.16; final validation 0.245 (no sign of overfitting) |

Full per-step losses: `out/metrics.json` (committed).

**Deviation from the plan:** the plan used Unsloth in WSL2 Ubuntu. WSL was not installed (it needs
admin + reboot), so training ran on native Windows with plain transformers/PEFT/TRL instead. At
1.5B parameters the model fits the 4060 in bf16 without 4-bit loading, so bitsandbytes/Unsloth were
not needed. Same LoRA settings as the plan.

## Reproduce

```bash
python -m venv .venv && .venv/Scripts/python -m pip install torch --index-url https://download.pytorch.org/whl/cu128
.venv/Scripts/python -m pip install "transformers>=4.46" "peft>=0.13" "trl>=0.12" "datasets>=3" "accelerate>=1.0"
# download the two datasets' data files into data/raw/ (see prepare_data.py for file names)
.venv/Scripts/python prepare_data.py
.venv/Scripts/python train.py --smoke     # 5-step end-to-end check
.venv/Scripts/python train.py             # full run -> out/lora, out/metrics.json
.venv/Scripts/python eval_hf.py           # base vs fine-tuned -> out/eval_hf.json
.venv/Scripts/python train.py --merge     # -> out/merged (for Ollama)
```

## Ollama

This Ollama build (0.40.16) cannot import Qwen2 safetensors directly ("unsupported MLX
architecture"), so the merged model is converted to GGUF with llama.cpp's `convert_hf_to_gguf.py`
(q8_0) and then imported with `ollama create slopstop-qwen -f Modelfile`. The demo serves the same
model under its product name, **QwenSkuld** (`ollama create QwenSkuld -f Modelfile.qwenskuld`): the same GGUF with up to
4096 output tokens and an 8192-token context, so the AI patcher can return whole files.

Both models are served by Ollama at **http://localhost:11434** on the training laptop:

| Ollama name | What | Size |
|---|---|---|
| `slopstop-qwen` | base + SlopStop LoRA, merged, GGUF q8_0 | 1.6 GB |
| `qwen-base-q8` | the unmodified base, converted the same way (GGUF q8_0), for a like-for-like baseline | 1.6 GB |

Same validation split through Ollama (`eval_val.py`), confirming the GGUF conversion did not hurt:

| | `qwen-base-q8` | `slopstop-qwen` |
|---|---|---|
| Verdict accuracy | 54.4% | **85.3%** |
| Category accuracy | 45.6% | **82.4%** |
| Vulnerable caught | 12/34 | **27/34** |
| False alarms on safe code | 9/34 | **3/34** |
| Valid JSON | 68/68 | 68/68 |

Plan smoke test, `app.get("/api/users", async (req, res) => res.json(await User.find({})));`:
- `qwen-base-q8`: `vulnerable: false` (wrong)
- `slopstop-qwen`: `vulnerable: true` (right) but `category: "injection"` with an XSS reason
  (wrong: it is missing auth). This is the training-data skew showing: 260 injection examples vs
  6 auth. The rules engine's `route-no-auth` catches this case deterministically.

To run on another laptop: copy `out/gguf/slopstop-qwen-q8_0.gguf` (1.6 GB) next to this `Modelfile`
and run `ollama create slopstop-qwen -f Modelfile`.

Never commit `data/`, `out/` (except `metrics.json`), weights or the venv; they are git-ignored.
