#!/usr/bin/env python3
"""Merge a PEFT LoRA adapter into a base model's safetensors, one shard at a time.

usage: merge_adapter.py <adapter-or-checkpoint-dir> <base-model-dir> <out-dir>

The adapter directory holds adapter_config.json and adapter_model.safetensors:
a train.py adapter or a Trainer checkpoint. The base directory is a Hugging
Face snapshot with model.safetensors.index.json. Peak memory is one shard plus
its adapter pairs, so this runs on a machine without room for the whole bf16
model. Files other than the weight shards are symlinked from the base, so
llama.cpp's converter sees the same config and tokenizer. Needs torch and
safetensors (the training venv has both). Prints MERGE-DONE at the end.
"""
import json
import os
import sys


def main():
    if len(sys.argv) != 4:
        print(__doc__)
        return 0 if sys.argv[1:] in (["-h"], ["--help"]) else 2
    import torch  # noqa: F401  (safetensors.torch needs it)
    from safetensors import safe_open
    from safetensors.torch import save_file

    adapter_dir, base_dir, out_dir = sys.argv[1:4]
    config = json.load(open(os.path.join(adapter_dir, "adapter_config.json")))
    if config.get("use_rslora") or config.get("use_dora"):
        sys.exit("plain LoRA only: this adapter uses rsLoRA or DoRA")
    scale = config["lora_alpha"] / config["r"]

    adapter = safe_open(os.path.join(adapter_dir, "adapter_model.safetensors"), "pt")
    pairs = {}
    for key in adapter.keys():
        stem, kind = key.removeprefix("base_model.model.").rsplit(".lora_", 1)
        pairs.setdefault(stem + ".weight", {})[kind.split(".")[0]] = key

    os.makedirs(out_dir, exist_ok=True)
    index = json.load(open(os.path.join(base_dir, "model.safetensors.index.json")))
    merged = 0
    for shard in sorted(set(index["weight_map"].values())):
        tensors = {}
        with safe_open(os.path.join(base_dir, shard), "pt") as f:
            metadata = f.metadata()
            for name in f.keys():
                weight = f.get_tensor(name)
                if name in pairs:
                    a = adapter.get_tensor(pairs[name]["A"]).float()
                    b = adapter.get_tensor(pairs[name]["B"]).float()
                    weight = (weight.float() + (b @ a) * scale).to(weight.dtype)
                    merged += 1
                tensors[name] = weight
        save_file(tensors, os.path.join(out_dir, shard), metadata=metadata)
        print(f"{shard}: {len(tensors)} tensors", flush=True)
        del tensors

    if merged != len(pairs):
        sys.exit(f"merged {merged} of {len(pairs)} adapted weights: the adapter's names do not match the base")
    for name in os.listdir(base_dir):
        target = os.path.join(out_dir, name)
        if not name.endswith(".safetensors") and not os.path.exists(target):
            os.symlink(os.path.realpath(os.path.join(base_dir, name)), target)
    print(f"MERGE-DONE {merged} weights, scale {scale}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
