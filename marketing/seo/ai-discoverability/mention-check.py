"""Mention check: do search-grounded assistants name NodeTool, cite it, and get it right?

Sends a fixed panel of corpus questions to four search-grounded APIs and
appends one row per answer to a dated CSV. See strategy.md, section
"Measurement".

  python3 marketing/seo/ai-discoverability/mention-check.py --dry-run
  python3 marketing/seo/ai-discoverability/mention-check.py --self-test
  python3 marketing/seo/ai-discoverability/mention-check.py [--providers openai,anthropic] [--limit N]

Keys come from the environment. A provider without its key is skipped.
Standard library only.
"""
import argparse
import csv
import datetime
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CORPUS = os.path.join(HERE, "query-corpus.csv")
OUT_DIR = os.path.join(HERE, "mention-check")

# 40 corpus ids. Every P1 subcluster has at least one question, plus the
# branded and P2 questions that show how assistants describe NodeTool.
PANEL = [
    # games/agent-builds-game (P1)
    "Q0028", "Q0032", "Q0039",
    # games/assets (P1)
    "Q0097", "Q0104",
    # games/convo (P1)
    "Q0117", "Q0118", "Q0122", "Q0132",
    # games/editable-output (P1)
    "Q0052", "Q0055",
    # games/engine-choice (P1)
    "Q0003", "Q0013", "Q0014",
    # games/mcp-control (P1)
    "Q0061", "Q0072",
    # games/vibe-coding (P1)
    "Q0079",
    # comparison/games (P1)
    "Q0414",
    # mcp-dev/claude-code (P1)
    "Q0360", "Q0363",
    # mcp-dev/convo (P1)
    "Q0375", "Q0376",
    # mcp-dev/mcp-media (P1)
    "Q0339", "Q0344",
    # video/assistant-video (P1)
    "Q0188", "Q0194",
    # video/convo (P1)
    "Q0205", "Q0206",
    # video/editable-timeline (P1)
    "Q0160", "Q0162",
    # video/filmmaking-agent (P1)
    "Q0178",
    # comparison/nodetool and comparison/comfyui: branded framing
    "Q0442", "Q0431", "Q0430", "Q0392",
    # P2 clusters
    "Q0329", "Q0301", "Q0251", "Q0170", "Q0445",
]

# Default model ids, checked against each provider's docs on 2026-10-17.
# Override with the *_MODEL environment variables.
PROVIDERS = {
    "openai": {"keys": ["OPENAI_API_KEY"], "model_env": "MENTION_CHECK_OPENAI_MODEL", "model": "gpt-6-astra"},
    "anthropic": {"keys": ["ANTHROPIC_API_KEY"], "model_env": "MENTION_CHECK_ANTHROPIC_MODEL", "model": "claude-opus-5-5"},
    # Sonar Chat Completions ended on 2026-09-27. The Agent API "fast"
    # preset is Perplexity's documented replacement for model "sonar".
    "perplexity": {"keys": ["PERPLEXITY_API_KEY"], "model_env": "MENTION_CHECK_PERPLEXITY_PRESET", "model": "fast"},
    "gemini": {"keys": ["GEMINI_API_KEY", "GOOGLE_API_KEY"], "model_env": "MENTION_CHECK_GEMINI_MODEL", "model": "gemini-3.8-flash"},
}

COMPETITORS = {
    "ComfyUI": r"\bcomfy\s?ui\b|\bcomfy mcp\b",
    "n8n": r"\bn8n\b",
    "Runway": r"\brunway\b",
    "Higgsfield": r"\bhiggsfield\b",
    "Krea": r"\bkrea\b",
    "Flora": r"\bflora\b",
    "Figma Weave": r"\bweavy\b|\bfigma weave\b",
    "LTX Studio": r"\bltx studio\b",
    "Pika": r"\bpika\b",
    "InvokeAI": r"\binvoke\s?ai\b",
    "Rosebud": r"\brosebud\b",
    "Summer Engine": r"\bsummer engine\b",
    "Unity": r"\bunity\b",
    "Godot": r"\bgodot\b",
    "Roblox Studio": r"\broblox\b",
    "Ludo.ai": r"\bludo(\.ai)?\b",
    "Scenario": r"\bscenario\.gg\b|\bscenario ai\b",
    "Bezi": r"\bbezi\b",
    "Remotion": r"\bremotion\b",
    "CapCut": r"\bcapcut\b",
    "Arcads": r"\barcads\b",
    "Creatify": r"\bcreatify\b",
    "Palmier Pro": r"\bpalmier\b",
    "Blender MCP": r"\bblender[- ]mcp\b",
}

NEGATION = re.compile(
    r"\b(no|not|never|without|lacks?|cannot|can't|doesn't|does not|isn't|is not|"
    r"don't|do not|removed|dropped|no longer|instead of|unsupported)\b",
    re.I,
)
NODETOOL = re.compile(r"\bnode\s?tool\b", re.I)

# Known-false framings. A flag counts only in a passage that names NodeTool,
# and only in a sentence with no negation, so "NodeTool has no multiplayer"
# does not count. These are heuristics: read flag_evidence before acting.
FALSE_FRAMINGS = {
    "flag_comfyui_meets_n8n": re.compile(r"comfy\s?ui\s+(meets|plus|\+|and)\s+n8n", re.I),
    "flag_visual_workflow_builder": re.compile(r"visual\s+(ai\s+)?workflow\s+(builder|tool|editor)", re.I),
    "flag_godot_export": re.compile(r"godot.{0,60}\bexport|\bexport.{0,60}godot", re.I),
    "flag_mobile_export": re.compile(
        r"(ios|android|mobile|app store|google play).{0,60}\b(export|ship|publish|build)|"
        r"\b(export|ship|publish|build)s?\b.{0,60}(ios|android|mobile|app store|google play)",
        re.I,
    ),
    "flag_multiplayer": re.compile(r"multiplayer|networked play|online co-?op", re.I),
}

COLUMNS = [
    "run_at", "provider", "model", "query_id", "cluster", "subcluster", "priority", "query",
    "mentions_nodetool", "cites_nodetool", "cites_nodetool_docs", "cited_nodetool_urls",
    "cited_url_count", "competitors", *FALSE_FRAMINGS.keys(), "flag_evidence", "answer_chars", "error",
]


# ---------------------------------------------------------------- HTTP

def post_json(url, body, headers, timeout=300):
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method="POST", headers={"content-type": "application/json", **headers})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as err:
        detail = err.read().decode(errors="replace")[:500]
        raise RuntimeError(f"HTTP {err.code}: {detail}") from None


# ---------------------------------------------------------------- providers
# Each ask_* returns (answer_text, cited_urls, citation_labels). Labels are
# source titles, used where a provider cites through redirect URLs (Gemini).

def parse_openai(resp):
    texts, urls = [], []
    for item in resp.get("output", []):
        if item.get("type") != "message":
            continue
        for part in item.get("content", []):
            if part.get("type") == "output_text":
                texts.append(part.get("text", ""))
                urls += [a["url"] for a in part.get("annotations", []) if a.get("type") == "url_citation" and a.get("url")]
    return "\n".join(texts), urls, []


def ask_openai(query, key, model):
    body = {"model": model, "tools": [{"type": "web_search"}], "input": query}
    return parse_openai(post_json("https://api.openai.com/v1/responses", body, {"authorization": f"Bearer {key}"}))


def parse_anthropic(resp):
    texts, urls = [], []
    for block in resp.get("content", []):
        if block.get("type") != "text":
            continue
        texts.append(block.get("text", ""))
        for cite in block.get("citations") or []:
            if cite.get("type") == "web_search_result_location" and cite.get("url"):
                urls.append(cite["url"])
    return "".join(texts), urls, []


def ask_anthropic(query, key, model):
    headers = {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        # Server-side fallback reruns a declined request on another model.
        "anthropic-beta": "server-side-fallback-2026-07-01",
    }
    messages = [{"role": "user", "content": query}]
    body = {
        "model": model,
        "max_tokens": 16000,
        "output_config": {"effort": "medium"},
        "fallbacks": "default",
        "tools": [{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}],
        "messages": messages,
    }
    content = []
    for _ in range(4):
        resp = post_json("https://api.anthropic.com/v1/messages", body, headers)
        content += resp.get("content", [])
        if resp.get("stop_reason") == "refusal":
            raise RuntimeError(f"refusal: {resp.get('stop_details')}")
        if resp.get("stop_reason") != "pause_turn":
            break
        # A paused server-tool turn resumes when the assistant turn is sent back.
        body["messages"] = messages + [{"role": "assistant", "content": content}]
    return parse_anthropic({"content": content})


def parse_perplexity(resp):
    text = resp.get("output_text")
    texts, urls = [], []
    for item in resp.get("output", []):
        if item.get("type") == "search_results":
            urls += [r.get("url") for r in item.get("results", []) if r.get("url")]
        elif item.get("type") == "message" and not isinstance(text, str):
            texts += [p.get("text", "") for p in item.get("content", []) if p.get("type") == "output_text"]
    # Older Sonar-shaped responses carry `citations` and `search_results` at the top level.
    urls += [u for u in resp.get("citations", []) if isinstance(u, str)]
    urls += [r.get("url") for r in resp.get("search_results", []) if r.get("url")]
    if not isinstance(text, str):
        text = "\n".join(texts) or "".join(
            c.get("message", {}).get("content", "") for c in resp.get("choices", [])
        )
    return text, urls, []


def ask_perplexity(query, key, preset):
    body = {"preset": preset, "input": query}
    return parse_perplexity(post_json("https://api.perplexity.ai/v1/agent", body, {"authorization": f"Bearer {key}"}))


def parse_gemini(resp):
    candidate = (resp.get("candidates") or [{}])[0]
    text = "".join(p.get("text", "") for p in candidate.get("content", {}).get("parts", []))
    chunks = candidate.get("groundingMetadata", {}).get("groundingChunks", [])
    urls = [c["web"]["uri"] for c in chunks if c.get("web", {}).get("uri")]
    # Grounding URIs are vertexaisearch redirects. The title holds the source domain.
    labels = [c["web"]["title"] for c in chunks if c.get("web", {}).get("title")]
    return text, urls, labels


def ask_gemini(query, key, model):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{urllib.parse.quote(model)}:generateContent"
    body = {"contents": [{"parts": [{"text": query}]}], "tools": [{"google_search": {}}]}
    return parse_gemini(post_json(url, body, {"x-goog-api-key": key}))


ASK = {"openai": ask_openai, "anthropic": ask_anthropic, "perplexity": ask_perplexity, "gemini": ask_gemini}


# ---------------------------------------------------------------- scoring

def is_nodetool_host(value):
    host = urllib.parse.urlparse(value).hostname if "//" in value else value.strip().lower()
    host = (host or "").lower().removeprefix("www.")
    return host == "nodetool.ai" or host.endswith(".nodetool.ai")


def passages(text):
    """Paragraphs and list items, the unit a claim about NodeTool lives in."""
    return [p.strip() for p in re.split(r"\n\s*\n|\n(?=\s*(?:[-*•]|\d+[.)]|#))", text) if p.strip()]


def sentences(passage):
    return [s for s in re.split(r"(?<=[.!?])\s+|\n", passage) if s.strip()]


def score(text, urls, labels):
    nodetool_urls = sorted({u for u in urls if is_nodetool_host(u)})
    nodetool_labels = sorted({l for l in labels if is_nodetool_host(l)})
    row = {
        "mentions_nodetool": int(bool(NODETOOL.search(text))),
        "cites_nodetool": int(bool(nodetool_urls or nodetool_labels)),
        "cites_nodetool_docs": int(any(urllib.parse.urlparse(u).hostname == "docs.nodetool.ai" for u in nodetool_urls)
                                   or "docs.nodetool.ai" in nodetool_labels),
        "cited_nodetool_urls": " ".join(nodetool_urls or nodetool_labels),
        "cited_url_count": len(set(urls)),
        "competitors": ";".join(name for name, pat in COMPETITORS.items() if re.search(pat, text, re.I)),
    }
    evidence = []
    for flag, pattern in FALSE_FRAMINGS.items():
        hit = 0
        for passage in passages(text):
            if not NODETOOL.search(passage):
                continue
            for sentence in sentences(passage):
                if pattern.search(sentence) and not NEGATION.search(sentence):
                    hit = 1
                    evidence.append(f"{flag}: {sentence.strip()[:200]}")
                    break
            if hit:
                break
        row[flag] = hit
    row["flag_evidence"] = " | ".join(evidence)
    row["answer_chars"] = len(text)
    return row


# ---------------------------------------------------------------- run

def load_panel():
    with open(CORPUS, newline="") as f:
        rows = {r["id"]: r for r in csv.DictReader(f)}
    missing = [i for i in PANEL if i not in rows]
    if missing:
        sys.exit(f"Panel ids missing from query-corpus.csv: {', '.join(missing)}")
    return [rows[i] for i in PANEL]


def check_coverage(panel):
    """Every P1 subcluster in the corpus must have a panel question."""
    with open(CORPUS, newline="") as f:
        p1 = {(r["cluster"], r["subcluster"]) for r in csv.DictReader(f) if r["priority"] == "P1"}
    covered = {(r["cluster"], r["subcluster"]) for r in panel}
    return sorted(p1 - covered)


def run(args):
    panel = load_panel()
    gaps = check_coverage(panel)
    if gaps:
        print("Warning: P1 subclusters without a panel question: " + ", ".join(f"{c}/{s}" for c, s in gaps))
    if args.limit:
        panel = panel[: args.limit]
    if args.dry_run:
        print(f"{len(panel)} questions, {len({(r['cluster'], r['subcluster']) for r in panel})} subclusters\n")
        for r in panel:
            print(f"{r['id']}  {r['priority']:<4} {r['cluster'] + '/' + r['subcluster']:<28} {r['query']}")
        return

    selected = [p.strip() for p in args.providers.split(",") if p.strip()]
    ready = []
    for name in selected:
        if name not in PROVIDERS:
            sys.exit(f"Unknown provider {name}. Choose from {', '.join(PROVIDERS)}.")
        spec = PROVIDERS[name]
        key = next((os.environ[k] for k in spec["keys"] if os.environ.get(k)), None)
        if not key:
            print(f"Skipping {name}: set {' or '.join(spec['keys'])} to include it.")
            continue
        ready.append((name, key, os.environ.get(spec["model_env"]) or spec["model"]))
    if not ready:
        sys.exit("No provider has a key. Nothing to run.")

    today = datetime.date.today().isoformat()
    os.makedirs(args.out_dir, exist_ok=True)
    out_csv = os.path.join(args.out_dir, f"mention-check-{today}.csv")
    out_jsonl = os.path.join(args.out_dir, f"mention-check-{today}.answers.jsonl")
    new_file = not os.path.exists(out_csv)
    totals = {}
    with open(out_csv, "a", newline="") as fcsv, open(out_jsonl, "a") as fjson:
        writer = csv.DictWriter(fcsv, fieldnames=COLUMNS, lineterminator="\n")
        if new_file:
            writer.writeheader()
        for name, key, model in ready:
            for r in panel:
                base = {
                    "run_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
                    "provider": name, "model": model, "query_id": r["id"], "cluster": r["cluster"],
                    "subcluster": r["subcluster"], "priority": r["priority"], "query": r["query"],
                }
                try:
                    text, urls, labels = ASK[name](r["query"], key, model)
                    row = {**base, **score(text, urls, labels), "error": ""}
                    fjson.write(json.dumps({**base, "answer": text, "cited_urls": urls, "citation_labels": labels}) + "\n")
                except Exception as err:  # one failed question must not end the run
                    row = {**base, "error": str(err)[:300]}
                writer.writerow(row)
                fcsv.flush()
                t = totals.setdefault(name, {"n": 0, "mention": 0, "cite": 0, "flags": 0, "errors": 0})
                if row["error"]:
                    t["errors"] += 1
                else:
                    t["n"] += 1
                    t["mention"] += row["mentions_nodetool"]
                    t["cite"] += row["cites_nodetool"]
                    t["flags"] += int(any(row[f] for f in FALSE_FRAMINGS))
                print(f"{name:<10} {r['id']} mention={row.get('mentions_nodetool', '-')} cite={row.get('cites_nodetool', '-')} {row['error'][:60]}")
    print(f"\nAppended to {out_csv}")
    for name, t in totals.items():
        n = t["n"] or 1
        print(f"{name:<10} answered {t['n']}, mention rate {t['mention'] / n:.0%}, citation rate {t['cite'] / n:.0%}, "
              f"answers with a false-framing flag {t['flags']}, errors {t['errors']}")


# ---------------------------------------------------------------- self-test

def self_test():
    """Parse canned responses in each provider's documented shape and score them."""
    answer = (
        "Top picks:\n\n"
        "- NodeTool is an open-source agent-first workspace with a built-in game engine. "
        "It has no multiplayer support.\n"
        "- NodeTool is a visual AI workflow builder, like ComfyUI meets n8n.\n"
        "- Godot is the most complete open-source engine and can export to Android.\n"
        "- NodeTool can export your game to iOS."
    )
    openai = {"output": [
        {"type": "web_search_call", "action": {"type": "search", "query": "q"}},
        {"type": "message", "content": [{"type": "output_text", "text": answer, "annotations": [
            {"type": "url_citation", "url": "https://nodetool.ai/gamedev", "title": "x", "start_index": 0, "end_index": 5},
            {"type": "url_citation", "url": "https://godotengine.org/", "title": "y", "start_index": 0, "end_index": 5},
        ]}]},
    ]}
    anthropic = {"content": [
        {"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": {"query": "q"}},
        {"type": "web_search_tool_result", "tool_use_id": "srvtoolu_1", "content": [
            {"type": "web_search_result", "url": "https://docs.nodetool.ai/mcp-server", "title": "t"}]},
        {"type": "text", "text": answer[:60]},
        {"type": "text", "text": answer[60:], "citations": [
            {"type": "web_search_result_location", "url": "https://docs.nodetool.ai/mcp-server", "title": "t", "cited_text": "c"}]},
    ]}
    perplexity = {"output_text": answer, "output": [
        {"type": "search_results", "results": [{"id": 1, "url": "https://www.nodetool.ai/", "title": "t"}]},
        {"type": "message", "content": [{"type": "output_text", "text": answer}]},
    ]}
    gemini = {"candidates": [{"content": {"parts": [{"text": answer}]}, "groundingMetadata": {
        "webSearchQueries": ["q"],
        "groundingChunks": [{"web": {"uri": "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", "title": "nodetool.ai"}}],
    }}]}
    cases = [
        ("openai", parse_openai(openai), ["https://nodetool.ai/gamedev"], 0),
        ("anthropic", parse_anthropic(anthropic), ["https://docs.nodetool.ai/mcp-server"], 1),
        ("perplexity", parse_perplexity(perplexity), ["https://www.nodetool.ai/"], 0),
        ("gemini", parse_gemini(gemini), ["nodetool.ai"], 0),
    ]
    failures = []
    for name, (text, urls, labels), expect_cited, expect_docs in cases:
        row = score(text, urls, labels)
        checks = {
            "text parsed": text == answer,
            "mentions": row["mentions_nodetool"] == 1,
            "cites": row["cites_nodetool"] == 1 and row["cited_nodetool_urls"] == " ".join(expect_cited),
            "docs": row["cites_nodetool_docs"] == expect_docs,
            "competitors": row["competitors"] == "ComfyUI;n8n;Godot",
            "comfyui meets n8n": row["flag_comfyui_meets_n8n"] == 1,
            "visual workflow builder": row["flag_visual_workflow_builder"] == 1,
            "mobile export": row["flag_mobile_export"] == 1,
            # "has no multiplayer" is negated, Godot's export sentence names no NodeTool.
            "multiplayer negated": row["flag_multiplayer"] == 0,
            "godot not attributed": row["flag_godot_export"] == 0,
        }
        failures += [f"{name}: {check}" for check, ok in checks.items() if not ok]
    negative = score("Godot exports to iOS. Unity has multiplayer.", [], [])
    if negative["mentions_nodetool"] or any(negative[f] for f in FALSE_FRAMINGS):
        failures.append("answer without NodeTool raised a flag")
    if failures:
        sys.exit("Self-test failed:\n  " + "\n  ".join(failures))
    print(f"Self-test passed: {len(cases)} provider shapes parsed and scored.")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the panel and exit")
    parser.add_argument("--self-test", action="store_true", help="parse canned responses and exit")
    parser.add_argument("--providers", default=",".join(PROVIDERS), help="comma-separated subset of " + ", ".join(PROVIDERS))
    parser.add_argument("--limit", type=int, default=0, help="ask only the first N panel questions")
    parser.add_argument("--out-dir", default=OUT_DIR, help="where the dated CSV and answers file go")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        run(args)


if __name__ == "__main__":
    main()
