#!/usr/bin/env python3
"""Find the longest sequence one QLoRA training step fits on this GPU.

usage: seq-probe.py <train.py> <profile> <sft.jsonl> [--lengths 8192,16384,32768,65536]

Loads the profile's base in 4 bit with the LoRA layers train.py adds, takes
the longest record in <sft.jsonl>, and runs one forward and backward pass on
its last N tokens for each length, printing the peak GPU memory, until one
runs out of memory. train.py drops every record longer than --max-seq, so
run this on a new GPU type before choosing --max-seq. Needs the training
venv (unsloth, torch).
"""
import argparse
import importlib.util
import sys


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("train_py")
    ap.add_argument("profile")
    ap.add_argument("data")
    ap.add_argument("--lengths", default="8192,16384,32768,65536")
    ap.add_argument("--rank", type=int, default=16)
    args = ap.parse_args()

    spec = importlib.util.spec_from_file_location("train", args.train_py)
    train = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(train)
    from unsloth import FastLanguageModel
    import torch

    profile = train.PROFILES[args.profile]
    lengths = [int(n) for n in args.lengths.split(",")]
    model, tok = FastLanguageModel.from_pretrained(
        model_name=profile.base, max_seq_length=max(lengths), load_in_4bit=True)
    model = FastLanguageModel.get_peft_model(
        model, r=args.rank, lora_alpha=args.rank, lora_dropout=0,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        use_gradient_checkpointing="unsloth")
    print(f"after load: {torch.cuda.memory_allocated() / 2**30:.2f} GiB allocated", flush=True)
    text_tok = getattr(tok, "tokenizer", tok)
    record = max(train.load_records(train.Path(args.data)), key=lambda r: len(r["messages"]))
    example = train.tokenize_masked(profile, text_tok, train.render(profile, text_tok, record))
    ids, labels = example["input_ids"], example["labels"]
    print(f"longest record: {len(ids)} tokens", flush=True)
    model.train()
    for n in lengths:
        n = min(n, len(ids))
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        i = torch.tensor([ids[-n:]]).cuda()
        lab = torch.tensor([labels[-n:]]).cuda()
        try:
            out = model(input_ids=i, labels=lab)
            out.loss.backward()
            model.zero_grad(set_to_none=True)
            print(f"length {n}: fits, peak {torch.cuda.max_memory_allocated() / 2**30:.2f} GiB", flush=True)
        except torch.OutOfMemoryError:
            print(f"length {n}: out of memory, so the limit lies below it", flush=True)
            break
        finally:
            del i, lab
        if n == len(ids):
            break
    return 0


if __name__ == "__main__":
    sys.exit(main())
