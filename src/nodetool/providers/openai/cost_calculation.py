from typing import Any

from openai.types.completion_usage import CompletionUsage
from openai.types.create_embedding_response import Usage


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int | None = None,
) -> float:
    # Pricing information for different models
    pricing: dict[str, Any] = {
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-2024-11-20": {"input": 2.50, "output": 10.00},
        "gpt-4o-2024-08-06": {"input": 2.50, "output": 10.00},
        "gpt-4o-audio-preview": {
            "text": {"input": 2.50, "output": 10.00},
            "audio": {"input": 40.00, "output": 80.00},
        },
        "gpt-4o-audio-preview-2024-12-17": {
            "text": {"input": 2.50, "output": 10.00},
            "audio": {"input": 40.00, "output": 80.00},
        },
        "gpt-4o-audio-preview-2024-10-01": {
            "text": {"input": 2.50, "output": 10.00},
            "audio": {"input": 100.00, "output": 200.00},
        },
        "gpt-4o-2024-05-13": {"input": 5.00, "output": 15.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.6},
        "gpt-3.5-turbo-0125": {"input": 0.50, "output": 1.50},
        "gpt-3.5-turbo-instruct": {"input": 1.50, "output": 2.00},
        "text-embedding-3-small": {"usage": 0.02},
        "text-embedding-3-large": {"usage": 0.13},
        "ada v2": {"usage": 0.10},
        "whisper-1": {"usage": 0.0001},
        "tts-1": {"usage": 15.00},
        "tts-1-hd": {"usage": 30.00},
        "dalle-3 standard 1024x1024": {"price": 0.040},
        "dalle-3 standard 1024x1792, 1792x1024": {"price": 0.080},
        "dalle-3 hd 1024x1024": {"price": 0.080},
        "dalle-3 hd 1024x1792, 1792x1024": {"price": 0.120},
        "o1": {"input": 15.00, "output": 60.00},
        "o1-2024-12-17": {"input": 15.00, "output": 60.00},
        "o1-preview": {"input": 15.00, "output": 60.00},
        "o1-preview-2024-09-12": {"input": 15.00, "output": 60.00},
        "o3-mini": {"input": 1.10, "output": 4.40},
        "o3-mini-2025-01-31": {"input": 1.10, "output": 4.40},
    }

    if model.lower() in pricing:
        model_pricing = pricing[model.lower()]

        if "input" in model_pricing and "output" in model_pricing:
            input_price = model_pricing["input"] / 1_000_000 * input_tokens
            output_price = model_pricing["output"] / 1_000_000 * output_tokens
            total_price = input_price + output_price
        elif "usage" in model_pricing:
            total_price = model_pricing["usage"] / 1_000_000 * input_tokens
        elif "price" in model_pricing:
            total_price = model_pricing["price"] * 1
        else:
            raise ValueError(f"Invalid pricing structure for model: {model}")

        return total_price
    else:
        raise ValueError(f"Unsupported model")


def calculate_cost_for_completion_usage(model: str, usage: CompletionUsage):
    return calculate_cost(model, usage.prompt_tokens, usage.completion_tokens)


def calculate_cost_for_embedding_usage(model: str, usage: Usage):
    return calculate_cost(model, usage.prompt_tokens)
