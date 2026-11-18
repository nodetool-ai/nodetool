"""Ollama's Qwen 3.5 prompt renderer, ported for training.

Ollama does not run Qwen 3.5 through its Hugging Face chat template. It runs
its own Go renderer (`model/renderers/qwen35.go` in Ollama v0.40.7), and that
renderer differs from the template in ways that change tokens: tools are
written by Go's `json.Marshal` through Ollama's own structs, which keep only
the schema fields those structs know, in struct order, with `<`, `>` and `&`
escaped. A model trained on the template's text would be served different
text. This module reproduces the renderer's non-thinking path
(`OLLAMA_THINK=false`), and `train.py check` proves it against the token
counts Ollama reported for real requests.
"""

from __future__ import annotations

import json
import math

TOOL_POSTAMBLE = """
</tools>

If you choose to call a function ONLY reply in the following format with NO suffix:

<tool_call>
<function=example_function_name>
<parameter=example_parameter_1>
value_1
</parameter>
<parameter=example_parameter_2>
This is the value for the second parameter
that can span
multiple lines
</parameter>
</function>
</tool_call>

<IMPORTANT>
Reminder:
- Function calls MUST follow the specified format: an inner <function=...></function> block must be nested within <tool_call></tool_call> XML tags
- Required parameters MUST be specified
- You may provide optional reasoning for your function call in natural language BEFORE the function call, but NOT after
- If there is no function call available, answer the question like normal with your current knowledge and do not tell the user about function calls
</IMPORTANT>"""

IM_START = "<|im_start|>"
IM_END = "<|im_end|>"
ASSISTANT = IM_START + "assistant\n"
EMPTY_THINK = "<think>\n\n</think>\n\n"


def _go_escape(text: str) -> str:
    # Go's json.Marshal HTML-escapes these inside strings; Python does not.
    return (
        text.replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )


def _sorted(value):
    """A Go `any` decoded from JSON: maps marshal with sorted keys."""
    if isinstance(value, dict):
        return {k: _sorted(value[k]) for k in sorted(value)}
    if isinstance(value, list):
        return [_sorted(v) for v in value]
    return value


def _property(prop: dict) -> dict:
    """`api.ToolProperty`: only its fields, in its order, empty ones omitted."""
    out: dict = {}
    if prop.get("anyOf"):
        out["anyOf"] = [_property(p) for p in prop["anyOf"]]
    kind = prop.get("type")
    if kind:
        out["type"] = kind[0] if isinstance(kind, list) and len(kind) == 1 else kind
    if prop.get("items") is not None:
        out["items"] = _sorted(prop["items"])
    if prop.get("description"):
        out["description"] = prop["description"]
    if prop.get("enum"):
        out["enum"] = prop["enum"]
    if prop.get("properties"):
        out["properties"] = {k: _property(v) for k, v in prop["properties"].items()}
    if prop.get("required"):
        out["required"] = prop["required"]
    return out


def _tool(tool: dict) -> dict:
    """`api.Tool` as Ollama re-marshals it."""
    fn = tool.get("function", {})
    params = fn.get("parameters") or {}
    parameters: dict = {"type": params.get("type", "")}
    if params.get("$defs") is not None:
        parameters["$defs"] = _sorted(params["$defs"])
    if params.get("items") is not None:
        parameters["items"] = _sorted(params["items"])
    if params.get("required"):
        parameters["required"] = params["required"]
    properties = params.get("properties")
    parameters["properties"] = (
        None if properties is None else {k: _property(v) for k, v in properties.items()}
    )
    function: dict = {"name": fn.get("name", "")}
    if fn.get("description"):
        function["description"] = fn["description"]
    function["parameters"] = parameters
    out: dict = {"type": tool.get("type", "")}
    if tool.get("items") is not None:
        out["items"] = _sorted(tool["items"])
    out["function"] = function
    return out


def _marshal_with_spaces(value) -> str:
    return _go_escape(json.dumps(value, ensure_ascii=False, separators=(", ", ": ")))


def _go_float(value: float) -> str:
    """Go's `%v` for a float64: shortest digits, exponent form from 1e21 or 1e-4 down."""
    if math.isinf(value):
        return "+Inf" if value > 0 else "-Inf"
    if value == int(value) and abs(value) < 1e21:
        text = str(int(value))
        return text if len(text.lstrip("-")) <= 21 else repr(value)
    return repr(value)


def _argument(value) -> str:
    """`formatToolCallArgument` from Ollama's qwen3coder.go."""
    if value is None:
        return "null"
    if isinstance(value, str):
        return value
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (dict, list)):
        return _go_escape(json.dumps(_sorted(value), ensure_ascii=False, separators=(",", ":")))
    if isinstance(value, (int, float)):
        return _go_float(float(value))
    return str(value)


def render(messages: list[dict], tools: list[dict], *, training: bool) -> str:
    """The prompt Ollama builds with think=false.

    With `training`, the whole conversation as one text: every assistant turn
    is opened the way its step's prompt opened it (with the empty think block)
    and closed with `<|im_end|>`, the token the model must learn to stop on.
    Without it, the prompt of the next request, ending in the generation
    prefix.
    """
    out: list[str] = []
    if tools:
        out.append(IM_START + "system\n# Tools\n\nYou have access to the following functions:\n\n<tools>")
        for tool in tools:
            out.append("\n" + _marshal_with_spaces(_tool(tool)))
        out.append(TOOL_POSTAMBLE)
        if messages and messages[0]["role"] == "system":
            system = (messages[0].get("content") or "").strip()
            if system:
                out.append("\n\n" + system)
        out.append(IM_END + "\n")
    elif messages and messages[0]["role"] == "system":
        out.append(IM_START + "system\n" + (messages[0].get("content") or "").strip() + IM_END + "\n")

    for i, message in enumerate(messages):
        role = message["role"]
        content = (message.get("content") or "").strip()
        last = i == len(messages) - 1
        prefill = last and role == "assistant" and not training
        if role == "user" or (role == "system" and i != 0):
            out.append(f"{IM_START}{role}\n{content}{IM_END}\n")
        elif role == "assistant":
            if "</think>" in content:
                content = content[content.index("</think>") + len("</think>"):].lstrip("\n")
            out.append(ASSISTANT + (EMPTY_THINK if training else "") + content)
            for j, call in enumerate(message.get("tool_calls") or []):
                if j == 0:
                    if content.strip():
                        out.append("\n\n")
                else:
                    out.append("\n")
                fn = call["function"]
                out.append("<tool_call>\n<function=" + fn["name"] + ">\n")
                for name, value in (fn.get("arguments") or {}).items():
                    out.append("<parameter=" + name + ">\n" + _argument(value) + "\n</parameter>\n")
                out.append("</function>\n</tool_call>")
            if not prefill:
                out.append(IM_END + "\n")
        elif role == "tool":
            if i == 0 or messages[i - 1]["role"] != "tool":
                out.append(IM_START + "user")
            out.append("\n<tool_response>\n" + content + "\n</tool_response>")
            if last or messages[i + 1]["role"] != "tool":
                out.append(IM_END + "\n")
        if last and not prefill and not training:
            out.append(ASSISTANT + EMPTY_THINK)
    return "".join(out)
