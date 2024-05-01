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
        "gpt-4-0125-preview": {"input": 10.00, "output": 30.00},
        "gpt-4-1106-preview": {"input": 10.00, "output": 30.00},
        "gpt-4-1106-vision-preview": {"input": 10.00, "output": 30.00},
        "gpt-4": {"input": 30.00, "output": 60.00},
        "gpt-4-32k": {"input": 60.00, "output": 120.00},
        "gpt-3.5-turbo-0125": {"input": 0.50, "output": 1.50},
        "gpt-3.5-turbo-instruct": {"input": 1.50, "output": 2.00},
        "text-embedding-3-small": {"usage": 0.02},
        "text-embedding-3-large": {"usage": 0.13},
        "ada v2": {"usage": 0.10},
        "davinci-002": {"usage": 2.00},
        "babbage-002": {"usage": 0.40},
        "whisper-1": {"usage": 0.0001},
        "tts-1": {"usage": 15.00},
        "tts-1-hd": {"usage": 30.00},
        "dalle-3 standard 1024x1024": {"price": 0.040},
        "dalle-3 standard 1024x1792, 1792x1024": {"price": 0.080},
        "dalle-3 hd 1024x1024": {"price": 0.080},
        "dalle-3 hd 1024x1792, 1792x1024": {"price": 0.120},
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
