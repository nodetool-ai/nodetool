#!/usr/bin/env python3
"""QLoRA fine-tuning on NodeTool product-chat traces, with Unsloth.

Input is the JSONL that `finetune-data.ts export` writes: one finished chat
turn per line, as `messages` plus `tools` in the Hugging Face chat format.
`--profile` picks the model family: `qwen35` (Qwen 3.5 9B, the default) or
`gemma4` (Gemma 4 12B).

    python scripts/finetune/train.py selftest
    python scripts/finetune/train.py check --data sft.jsonl
    python scripts/finetune/train.py train --data sft.jsonl --out runs/v1
    python scripts/finetune/train.py export --adapter runs/v1/adapter --out runs/v1/gguf

`check` loads only the tokenizer. It renders every record and compares the
prompt's token count with the count Ollama reported for the same request:
zero difference means training and inference see the same tokens. It also
reports the sequence lengths `train` has to fit.

Render. Inference runs with thinking off, and records are rendered the way
the serving runtime renders that mode. Every step's prompt opens with an empty
think block that the history leaves out; the training text keeps it, on the
context side. `qwen35` renders with the checkpoint's chat template, which is
what llama-server uses (`--jinja`, enable_thinking false). `qwen35-ollama`
uses a port of Ollama's renderer (ollama_qwen35.py), which differs from the
template. Gemma 4 matches its template once tools are rewritten the way Ollama
declares them.

Mask. The model is trained on everything it writes in its turns, its stop
token included, and never on a tool result or anything outside its turns.
Qwen puts tool results in user turns. Gemma 4 puts them inside the model's
turn, between `<|tool_response>` and `<tool_response|>`, and
`<|tool_response>` is its stop token. Unsloth's `train_on_responses_only`
would train Gemma on the tool results, so the mask is built here.
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

# The sibling renderer module, also under `python -I`.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from dataclasses import dataclass


@dataclass(frozen=True)
class Profile:
    """How one model family's chat template marks the model's own writing."""

    base: str
    # Opens one of the model's turns.
    turn: str
    # Closes it; trained, because the model must learn to stop.
    turn_end: str
    # What Ollama's non-thinking prompt puts after `turn` and drops from history.
    empty_think: str
    # Tool results inside the model's turn, as (open, close); the open marker is
    # the model's stop token and is trained, the rest is context.
    inner_response: tuple[str, str] | None
    # Rewrites tools the way Ollama declares them to this model.
    declares_tools: str = "as-is"
    # "template": the checkpoint's chat template matches Ollama's render once
    # the tools are rewritten. "ollama-qwen35": Ollama's own renderer, ported.
    renderer: str = "template"


PROFILES = {
    "gemma4": Profile(
        base="unsloth/gemma-4-12B-it-qat-q4_0-unquantized",
        turn="<|turn>model\n",
        turn_end="<turn|>",
        empty_think="<|channel>thought\n<channel|>",
        inner_response=("<|tool_response>", "<tool_response|>"),
        declares_tools="gemma4",
    ),
    # Qwen 3.5 puts tool results in a user turn, so only whole turns matter.
    # The checkpoint's own chat template is what llama-server renders (--jinja,
    # enable_thinking false).
    "qwen35": Profile(
        base="Qwen/Qwen3.5-9B",
        turn="<|im_start|>assistant\n",
        turn_end="<|im_end|>",
        empty_think="<think>\n\n</think>\n\n",
        inner_response=None,
    ),
    # The same model as Ollama's qwen3.5 renderer writes it, which differs from
    # the template in tool declarations and argument JSON.
    "qwen35-ollama": Profile(
        base="Qwen/Qwen3.5-9B",
        turn="<|im_start|>assistant\n",
        turn_end="<|im_end|>",
        empty_think="<think>\n\n</think>\n\n",
        inner_response=None,
        renderer="ollama-qwen35",
    ),
}
IGNORE = -100
# Ollama's Gemma 4 renderer (model/renderers/gemma4.go, isSchemaStandardKey)
# skips any property whose name is one of these schema keywords when it writes
# a tool declaration, so the model never sees, for example, execute_code's
# `description` argument. Training renders what inference renders.
OLLAMA_SKIPPED_PROPERTIES = {"description", "type", "properties", "required", "nullable"}


def load_records(path: Path) -> list[dict]:
    with path.open() as handle:
        return [json.loads(line) for line in handle if line.strip()]


def as_ollama_declares(schema):
    """A parameters schema with the properties Ollama leaves out removed."""
    if not isinstance(schema, dict):
        return schema
    out = dict(schema)
    if isinstance(schema.get("properties"), dict):
        out["properties"] = {
            name: as_ollama_declares(prop)
            for name, prop in schema["properties"].items()
            if name not in OLLAMA_SKIPPED_PROPERTIES
        }
    if isinstance(schema.get("items"), dict):
        out["items"] = as_ollama_declares(schema["items"])
    return out


def ollama_tools(tools: list[dict]) -> list[dict]:
    return [
        {**tool, "function": {**tool["function"], "parameters": as_ollama_declares(tool["function"].get("parameters"))}}
        for tool in tools
    ]


def render(profile: Profile, tokenizer, record: dict, prompt_only: bool = False) -> str:
    """The record as Ollama renders it with OLLAMA_THINK=false.

    With `prompt_only`, the last request before the final reply, as Ollama
    saw it (the comparison `check` makes).
    """
    messages = record["messages"][:-1] if prompt_only else record["messages"]
    if profile.renderer == "ollama-qwen35":
        import ollama_qwen35  # noqa: PLC0415 (only the Qwen profile needs it)

        return ollama_qwen35.render(messages, record["tools"], training=not prompt_only)
    tools = ollama_tools(record["tools"]) if profile.declares_tools == "gemma4" else record["tools"]
    text = tokenizer.apply_chat_template(
        messages,
        tools=tools,
        tokenize=False,
        add_generation_prompt=prompt_only,
        enable_thinking=False,
    )
    if prompt_only:
        return text
    # Each step's prompt opened with the empty think block; history drops it.
    parts = text.split(profile.turn)
    return parts[0] + "".join(
        profile.turn + (part if part.startswith(profile.empty_think) else profile.empty_think + part)
        for part in parts[1:]
    )


def trained_spans(profile: Profile, text: str) -> list[tuple[int, int]]:
    """Character spans the model is trained on: its own writing in its turns."""
    spans: list[tuple[int, int]] = []
    at = 0
    while (turn := text.find(profile.turn, at)) >= 0:
        start = turn + len(profile.turn)
        if text.startswith(profile.empty_think, start):
            start += len(profile.empty_think)
        end = text.find(profile.turn_end, start)
        end = len(text) if end < 0 else end + len(profile.turn_end)
        cursor = start
        if profile.inner_response is not None:
            opener, closer = profile.inner_response
            while (opened := text.find(opener, cursor, end)) >= 0:
                spans.append((cursor, opened + len(opener)))
                closed = text.find(closer, opened, end)
                cursor = end if closed < 0 else closed + len(closer)
        if cursor < end:
            spans.append((cursor, end))
        at = end
    return spans


def tokenize_masked(profile: Profile, tokenizer, text: str) -> dict:
    """Token ids and labels; labels are IGNORE outside the trained spans."""
    encoded = tokenizer(text, add_special_tokens=False, return_offsets_mapping=True)
    spans = trained_spans(profile, text)
    labels = []
    span = 0
    for token_id, (start, _end) in zip(encoded["input_ids"], encoded["offset_mapping"]):
        while span < len(spans) and spans[span][1] <= start:
            span += 1
        inside = span < len(spans) and spans[span][0] <= start < spans[span][1]
        labels.append(token_id if inside else IGNORE)
    return {"input_ids": encoded["input_ids"], "labels": labels}


def token_count(tokenizer, text: str) -> int:
    return len(tokenizer(text, add_special_tokens=False)["input_ids"])


def text_tokenizer(base: str):
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(base)
    return getattr(tokenizer, "tokenizer", tokenizer)


def cmd_selftest(args: argparse.Namespace) -> int:
    profile = PROFILES[args.profile]
    tokenizer = text_tokenizer(args.base or profile.base)
    record = {
        "tools": [{"type": "function", "function": {
            "name": "execute_code", "description": "Run code",
            "parameters": {"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]},
        }}],
        "messages": [
            {"role": "system", "content": "SYSTEM-TEXT"},
            {"role": "user", "content": "USER-TEXT"},
            {"role": "assistant", "content": "", "tool_calls": [
                {"type": "function", "function": {"name": "execute_code", "arguments": {"code": "CALL-ONE"}}}]},
            {"role": "tool", "name": "execute_code", "content": "RESULT-ONE"},
            {"role": "assistant", "content": "", "tool_calls": [
                {"type": "function", "function": {"name": "execute_code", "arguments": {"code": "CALL-TWO"}}}]},
            {"role": "tool", "name": "execute_code", "content": "RESULT-TWO"},
            {"role": "assistant", "content": "FINAL-TEXT"},
        ],
    }
    text = render(profile, tokenizer, record)
    encoded = tokenize_masked(profile, tokenizer, text)
    trained = tokenizer.decode([t for t, l in zip(encoded["input_ids"], encoded["labels"]) if l != IGNORE])
    context = tokenizer.decode([t for t, l in zip(encoded["input_ids"], encoded["labels"]) if l == IGNORE])
    must_train = ["CALL-ONE", "CALL-TWO", "FINAL-TEXT", profile.turn_end]
    must_not = ["SYSTEM-TEXT", "USER-TEXT", "RESULT-ONE", "RESULT-TWO", profile.empty_think.strip()]
    if profile.inner_response is not None:
        must_train.append(profile.inner_response[0])
        must_not.append(profile.inner_response[1])
    failures = [f"{m} should be trained" for m in must_train if m not in trained] + [
        f"{m} should be context" for m in must_not if m in trained
    ]
    # Every step ends with the model's stop: 3 turn ends for Qwen (one per
    # assistant turn), 2 response openers plus 1 turn end for Gemma.
    stops = trained.count(profile.turn_end) + (
        trained.count(profile.inner_response[0]) if profile.inner_response else 0
    )
    if stops != 3:
        failures.append(f"expected 3 trained stop markers, got {stops}")
    if args.show:
        print(f"TRAINED:\n{trained}\n\nCONTEXT (tail):\n{context[-400:]}")
    for failure in failures:
        print(f"FAIL {failure}", file=sys.stderr)
    print("selftest ok" if not failures else f"selftest failed: {len(failures)}")
    return 1 if failures else 0


def cmd_check(args: argparse.Namespace) -> int:
    profile = PROFILES[args.profile]
    tokenizer = text_tokenizer(args.base or profile.base)
    records = load_records(args.data)
    if not records:
        print("no records", file=sys.stderr)
        return 1
    lengths, trained, deltas = [], [], []
    for record in records:
        encoded = tokenize_masked(profile, tokenizer, render(profile, tokenizer, record))
        lengths.append(len(encoded["input_ids"]))
        trained.append(sum(label != IGNORE for label in encoded["labels"]))
        ollama = record["meta"].get("finalPromptTokens")
        # Runs sampled with thinking on render differently in Ollama.
        if ollama and record["meta"].get("think") == "false":
            deltas.append(token_count(tokenizer, render(profile, tokenizer, record, prompt_only=True)) - ollama)
    print(json.dumps({
        "records": len(records),
        "tokens": {
            "min": min(lengths),
            "median": int(statistics.median(lengths)),
            "max": max(lengths),
            "over_max_seq": sum(n > args.max_seq for n in lengths),
            "trained_total": sum(trained),
        },
        # Our prompt minus Ollama's, per record: zero when the renders agree.
        "prompt_token_delta_vs_ollama": {
            "compared": len(deltas),
            "nonzero": sum(d != 0 for d in deltas),
            "min": min(deltas) if deltas else None,
            "max": max(deltas) if deltas else None,
        },
    }, indent=1))
    return 0


def cmd_train(args: argparse.Namespace) -> int:
    from unsloth import FastLanguageModel  # import first: Unsloth patches transformers
    import torch
    from datasets import Dataset
    from transformers import Trainer, TrainingArguments

    profile = PROFILES[args.profile]
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base or profile.base,
        max_seq_length=args.max_seq,
        load_in_4bit=True,
    )
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.rank,
        lora_alpha=args.rank,
        lora_dropout=0,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth",
        random_state=args.seed,
    )
    text_tok = getattr(tokenizer, "tokenizer", tokenizer)
    examples = [
        tokenize_masked(profile, text_tok, render(profile, text_tok, record))
        for record in load_records(args.data)
    ]
    kept = [e for e in examples if len(e["input_ids"]) <= args.max_seq]
    print(f"training on {len(kept)} of {len(examples)} records (max_seq {args.max_seq})")
    if not kept:
        return 1
    dataset = Dataset.from_list(kept)

    def collate(batch: list[dict]) -> dict:
        # Batch size 1: no padding needed.
        item = batch[0]
        return {
            "input_ids": torch.tensor([item["input_ids"]]),
            "attention_mask": torch.ones(1, len(item["input_ids"]), dtype=torch.long),
            "labels": torch.tensor([item["labels"]]),
        }

    trainer = Trainer(
        model=model,
        train_dataset=dataset,
        data_collator=collate,
        args=TrainingArguments(
            per_device_train_batch_size=1,
            gradient_accumulation_steps=args.grad_accum,
            num_train_epochs=args.epochs,
            max_steps=args.max_steps,
            learning_rate=args.lr,
            lr_scheduler_type="cosine",
            warmup_steps=0.05,  # a float below 1 is a fraction of the run
            logging_steps=1,
            optim="adamw_8bit",
            weight_decay=0.0,
            bf16=True,
            seed=args.seed,
            output_dir=str(args.out / "checkpoints"),
            save_strategy="epoch",
            report_to="none",
            remove_unused_columns=False,
        ),
    )
    trainer.train(resume_from_checkpoint=str(args.resume) if args.resume else None)
    print(f"peak GPU memory: {torch.cuda.max_memory_reserved() / 2**30:.2f} GiB reserved, "
          f"{torch.cuda.max_memory_allocated() / 2**30:.2f} GiB allocated")
    model.save_pretrained(str(args.out / "adapter"))
    tokenizer.save_pretrained(str(args.out / "adapter"))
    print(f"adapter saved to {args.out / 'adapter'}")
    return 0


def cmd_loss(args: argparse.Namespace) -> int:
    """Mean loss per trained token on held-out records, for the base and each adapter.

    The records are a teacher's achieved runs on the validation split, so the
    number falls while training generalizes and rises once it memorizes.
    """
    from unsloth import FastLanguageModel  # import first: Unsloth patches transformers
    import torch
    from peft import PeftModel

    profile = PROFILES[args.profile]
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.base or profile.base, max_seq_length=args.max_seq, load_in_4bit=True
    )
    text_tok = getattr(tokenizer, "tokenizer", tokenizer)
    records = load_records(args.data)
    examples = [tokenize_masked(profile, text_tok, render(profile, text_tok, r)) for r in records]
    examples = [e for e in examples if len(e["input_ids"]) <= args.max_seq]
    # The loss shifts labels by one: the first label never counts.
    counted = [sum(label != IGNORE for label in e["labels"][1:]) for e in examples]
    print(f"{len(examples)} of {len(records)} records, {sum(counted)} trained tokens", flush=True)

    def measure(net, name: str) -> dict:
        net.eval()
        total = 0.0
        per_record = []
        with torch.no_grad():
            for e, n in zip(examples, counted):
                out = net(
                    input_ids=torch.tensor([e["input_ids"]], device="cuda"),
                    labels=torch.tensor([e["labels"]], device="cuda"),
                )
                loss = float(out.loss)
                per_record.append(loss)
                total += loss * n
        mean = total / sum(counted)
        print(f"LOSS {name} {mean:.4f}", flush=True)
        return {"name": name, "loss": mean, "per_record": per_record}

    results = [measure(model, "base")] if args.with_base else []
    peft_model = None
    for adapter in args.adapters:
        if peft_model is None:
            peft_model = PeftModel.from_pretrained(model, str(adapter), adapter_name="a0")
            active = "a0"
        else:
            active = f"a{len(results)}"
            peft_model.load_adapter(str(adapter), adapter_name=active)
        peft_model.set_adapter(active)
        results.append(measure(peft_model, str(adapter)))
    if args.out:
        args.out.write_text(json.dumps({"counted": counted, "results": results}, indent=1))
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=str(args.adapter), max_seq_length=args.max_seq, load_in_4bit=False
    )
    model.save_pretrained_gguf(str(args.out), tokenizer, quantization_method=args.quant)
    print(f"GGUF written to {args.out}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    selftest = sub.add_parser("selftest", help="prove the render and the loss mask on a fixed record")
    selftest.add_argument("--profile", choices=sorted(PROFILES), default="qwen35")
    selftest.add_argument("--base", help="checkpoint; defaults to the profile's")
    selftest.add_argument("--show", action="store_true")

    check = sub.add_parser("check", help="render records and compare with Ollama's token counts")
    check.add_argument("--data", type=Path, required=True)
    check.add_argument("--profile", choices=sorted(PROFILES), default="qwen35")
    check.add_argument("--base", help="checkpoint; defaults to the profile's")
    check.add_argument("--max-seq", type=int, default=32768)

    train = sub.add_parser("train", help="QLoRA fine-tune and save the adapter")
    train.add_argument("--data", type=Path, required=True)
    train.add_argument("--out", type=Path, required=True)
    train.add_argument("--profile", choices=sorted(PROFILES), default="qwen35")
    train.add_argument("--base", help="checkpoint; defaults to the profile's")
    train.add_argument("--max-seq", type=int, default=32768)
    train.add_argument("--rank", type=int, default=16)
    train.add_argument("--lr", type=float, default=1e-4)
    train.add_argument("--epochs", type=float, default=2)
    train.add_argument("--grad-accum", type=int, default=8)
    train.add_argument("--seed", type=int, default=3407)
    train.add_argument("--max-steps", type=int, default=-1, help="stop early; a short run measures memory")
    train.add_argument(
        "--resume", type=Path,
        help="Trainer checkpoint to continue from, with its optimizer state; raise --epochs past the epochs it finished",
    )

    loss = sub.add_parser("loss", help="held-out loss of the base and each adapter on validation records")
    loss.add_argument("--data", type=Path, required=True)
    loss.add_argument("--profile", choices=sorted(PROFILES), default="qwen35")
    loss.add_argument("--base", help="checkpoint; defaults to the profile's")
    loss.add_argument("--max-seq", type=int, default=65536)
    loss.add_argument("--with-base", action="store_true", help="also measure the base without an adapter")
    loss.add_argument("--out", type=Path, help="write per-record losses as JSON")
    loss.add_argument("adapters", type=Path, nargs="*", help="adapter or Trainer checkpoint directories")

    export = sub.add_parser("export", help="merge the adapter and write a GGUF for Ollama")
    export.add_argument("--adapter", type=Path, required=True)
    export.add_argument("--out", type=Path, required=True)
    export.add_argument("--quant", default="q4_0", help="q4_0 matches the QAT base; q4_k_m and q8_0 also work")
    export.add_argument("--max-seq", type=int, default=32768)

    args = parser.parse_args()
    return {"selftest": cmd_selftest, "check": cmd_check, "train": cmd_train, "loss": cmd_loss, "export": cmd_export}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
