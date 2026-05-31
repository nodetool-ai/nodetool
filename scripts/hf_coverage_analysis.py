"""Analyze top HF models vs NodeTool generic-coverage plan."""
from __future__ import annotations

import json
import urllib.request
from collections import defaultdict

TAGS: list[tuple[str, int]] = [
    ("text-generation", 25),
    ("text-to-image", 20),
    ("image-text-to-text", 20),
    ("sentence-similarity", 15),
    ("feature-extraction", 10),
    ("automatic-speech-recognition", 12),
    ("text-to-speech", 12),
    ("fill-mask", 8),
    ("image-classification", 10),
    ("object-detection", 8),
    ("question-answering", 8),
    ("summarization", 6),
    ("translation", 6),
    ("text-to-video", 8),
    ("image-to-video", 8),
    ("image-to-image", 10),
    ("depth-estimation", 6),
    ("text-to-audio", 8),
    ("zero-shot-image-classification", 5),
    ("visual-question-answering", 5),
    ("document-question-answering", 5),
    ("token-classification", 5),
    ("audio-classification", 5),
    ("text-classification", 5),
    ("text2text-generation", 5),
]

NODE_BY_TAG = {
    "text-generation": "TextGeneration",
    "summarization": "Summarization",
    "translation": "Translation",
    "text2text-generation": "Text2TextGeneration",
    "question-answering": "QuestionAnswering",
    "fill-mask": "FillMask",
    "token-classification": "TokenClassification",
    "text-classification": "TextClassifier",
    "feature-extraction": "FeatureExtraction",
    "sentence-similarity": "SentenceSimilarity",
    "automatic-speech-recognition": "Whisper",
    "text-to-speech": "TextToSpeech/Kokoro",
    "image-classification": "ImageClassifier",
    "object-detection": "ObjectDetection",
    "depth-estimation": "DepthEstimation",
    "image-segmentation": "Segmentation",
    "visual-question-answering": "VisualQuestionAnswering",
    "document-question-answering": "DocumentQuestionAnswering",
    "zero-shot-image-classification": "ZeroShotImageClassifier",
    "audio-classification": "AudioClassifier",
    "text-to-image": "Text2Image (AutoPipeline)",
    "image-to-image": "ImageToImage (partial AutoPipeline)",
    "image-to-text": "ImageToText",
    "image-text-to-text": "ImageTextToText / QwenVL",
    "text-to-video": "CogVideoX/Wan or generic",
    "image-to-video": "Wan or generic",
    "text-to-audio": "MusicGen/AudioLDM or generic",
    "text-ranking": "Reranker",
}

NON_COVERED_LIBS = {
    "timm",
    "ultralytics",
    "pyannote-audio",
    "coqui",
    "chronos-forecasting",
    "mlx",
    "whisperkit",
    "omnivoice",
    "chatterbox",
    "UniDepth",
}


def fetch(tag: str, limit: int) -> list[dict]:
    url = (
        f"https://huggingface.co/api/models?pipeline_tag={tag}"
        f"&sort=downloads&direction=-1&limit={limit}"
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        return json.loads(response.read())


def assess(model: dict) -> tuple[str, str]:
    mid = model["id"].lower()
    tag = model["tag"] or ""
    lib = model["library"] or ""

    if lib in NON_COVERED_LIBS:
        return "no", f"non-transformers/diffusers library: {lib}"
    if tag == "time-series-forecasting":
        return "no", "no task node"
    if not tag:
        return "partial", "missing pipeline_tag - needs hub metadata inference"

    if any(x in mid for x in ("shap-e", "hunyuan3d", "triposr", "trellis", "triposg", "sf3d")):
        return "today", "dedicated 3D node (optional deps)"

    family = [
        ("flux.1", "text-to-image", "Flux node"),
        ("flux.1", "image-to-image", "FluxFill/Kontext"),
        ("qwen-image", "text-to-image", "QwenImage"),
        ("chroma", "text-to-image", "Chroma"),
        ("stable-diffusion-xl", "text-to-image", "SDXL or Text2Image"),
        ("stabilityai/stable-diffusion", "text-to-image", "SD or Text2Image"),
        ("kokoro", "text-to-speech", "KokoroTTS"),
        ("whisper", "automatic-speech-recognition", "Whisper"),
        ("qwen2.5-vl", "image-text-to-text", "Qwen2_5_VL"),
        ("qwen3-vl", "image-text-to-text", "Qwen3_VL"),
        ("cogvideox", "text-to-video", "CogVideoX"),
        ("wan2", "text-to-video", "Wan_T2V"),
        ("wan2", "image-to-video", "Wan_I2V"),
        ("musicgen", "text-to-audio", "MusicGen"),
        ("audioldm", "text-to-audio", "AudioLDM"),
    ]
    for pattern, req_tag, node in family:
        if pattern.replace(".", "") in mid.replace(".", "") or pattern in mid:
            if not req_tag or tag == req_tag:
                return "today", node

    if (
        lib == "sentence-transformers"
        or tag in ("sentence-similarity", "feature-extraction")
        or "sentence-transformers" in mid
    ):
        return "plan", "FeatureExtraction/SentenceSimilarity/Reranker + hub pick"

    if tag in NODE_BY_TAG and lib in ("transformers", "", None):
        if tag == "text-generation":
            return "plan", "TextGeneration (runtime ok; UI cache-only today)"
        return "plan", NODE_BY_TAG[tag]

    if lib == "diffusers":
        if tag == "text-to-image":
            return "plan", "Text2Image AutoPipeline + hub (Phase 1-2)"
        if tag == "image-to-image":
            return "partial", "Generic ImageToImage AutoPipeline (Phase 3)"
        if tag in ("text-to-video", "image-to-video"):
            return "partial", "AutoPipeline video or family node (Phase 3-4)"
        return "partial", f"diffusers {tag}"

    if tag == "image-text-to-text":
        return "partial", "Generic ImageTextToText (AutoModelForVision2Seq)"

    if "gguf" in mid:
        return "partial", "GGUF: llama.cpp LLM or diffusers GGUF transformer recipe"

    if model.get("gated"):
        return "plan_gated", "works with HF_TOKEN if loader supports"

    return "no", f"unhandled tag={tag} lib={lib}"


def main() -> None:
    seen: set[str] = set()
    models: list[dict] = []

    for tag, limit in TAGS:
        try:
            for item in fetch(tag, limit):
                if item["id"] in seen:
                    continue
                seen.add(item["id"])
                models.append(
                    {
                        "id": item["id"],
                        "tag": item.get("pipeline_tag") or tag,
                        "library": item.get("library_name"),
                        "downloads": item.get("downloads") or 0,
                        "gated": item.get("gated"),
                    }
                )
        except OSError as exc:
            print("ERR", tag, exc)

    try:
        with urllib.request.urlopen(
            "https://huggingface.co/api/models?sort=downloads&direction=-1&limit=40",
            timeout=30,
        ) as response:
            for item in json.loads(response.read()):
                if item["id"] in seen:
                    continue
                seen.add(item["id"])
                models.append(
                    {
                        "id": item["id"],
                        "tag": item.get("pipeline_tag"),
                        "library": item.get("library_name"),
                        "downloads": item.get("downloads") or 0,
                        "gated": item.get("gated"),
                    }
                )
    except OSError:
        pass

    models.sort(key=lambda m: -m["downloads"])
    models = models[:200]

    results: dict[str, list[tuple[dict, str]]] = defaultdict(list)
    tier_counts: dict[str, int] = defaultdict(int)
    tag_counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for model in models:
        tier, reason = assess(model)
        results[tier].append((model, reason))
        tier_counts[tier] += 1
        tag_counts[model["tag"] or "null"][tier] += 1

    total = len(models)
    today = tier_counts["today"]
    plan = tier_counts["plan"] + tier_counts.get("plan_gated", 0)
    partial = tier_counts["partial"]
    no = tier_counts["no"]

    print("SAMPLE SIZE:", total)
    print("TODAY (family node or works now):", today, f"({100 * today / total:.1f}%)")
    print("PLAN (generic + hub):", plan, f"({100 * plan / total:.1f}%)")
    print("PLAN_PARTIAL (Phase 3-4):", partial, f"({100 * partial / total:.1f}%)")
    print("NO (different stack):", no, f"({100 * no / total:.1f}%)")
    print("WEIGHTED today+plan:", today + plan, f"({100 * (today + plan) / total:.1f}%)")
    weighted = today + plan + 0.7 * partial
    print("WEIGHTED +0.7*partial:", f"{weighted:.0f}", f"({100 * weighted / total:.1f}%)")
    print()
    print("BY PIPELINE_TAG (top categories):")
    for tag in sorted(tag_counts.keys(), key=lambda t: -sum(tag_counts[t].values()))[:15]:
        tc = tag_counts[tag]
        n = sum(tc.values())
        cov = tc.get("today", 0) + tc.get("plan", 0) + tc.get("plan_gated", 0)
        print(
            f"  {tag}: n={n} covered={cov}/{n} "
            f"partial={tc.get('partial', 0)} no={tc.get('no', 0)}"
        )

    print()
    print("NO examples:")
    for model, reason in results["no"][:15]:
        print(f"  {model['id']} | {model['tag']} | {model['library']} | {reason}")

    print()
    print("PARTIAL examples:")
    for model, reason in results["partial"][:15]:
        print(f"  {model['id']} | {model['tag']} | {reason}")

    w_total = sum(m["downloads"] for m in models) or 1
    w_buckets: dict[str, int] = defaultdict(int)
    for model in models:
        tier, _ = assess(model)
        if tier == "plan_gated":
            tier = "plan"
        w_buckets[tier] += model["downloads"]
    print()
    print("DOWNLOAD-WEIGHTED (importance proxy):")
    for tier in ("today", "plan", "partial", "no"):
        print(f"  {tier}: {100 * w_buckets[tier] / w_total:.1f}%")
    wp = w_buckets["today"] + w_buckets["plan"]
    print(f"  today+plan: {100 * wp / w_total:.1f}%")
    print(
        f"  today+plan+0.7*partial: "
        f"{100 * (wp + 0.7 * w_buckets['partial']) / w_total:.1f}%"
    )


if __name__ == "__main__":
    main()
