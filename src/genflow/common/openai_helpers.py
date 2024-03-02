import enum
from openai.types import CompletionUsage


class GPTModel(str, enum.Enum):
    GPT3 = "gpt-3.5-turbo-1106"
    GPT4 = "gpt-4-1106-preview"
    GPT4_VISION = "gpt-4-vision-preview"


# Prices per 1K tokens for various models and context sizes
GPT_PRICES = {
    GPTModel.GPT4: {"input": 0.01, "output": 0.03},
    GPTModel.GPT4_VISION: {"input": 0.01, "output": 0.03},
    GPTModel.GPT3: {"input": 0.0010, "output": 0.002},
}


def calculate_gpt_price(
    model: GPTModel,
    input_tokens: int,
    output_tokens: int,
) -> float:
    """
    Calculate the price based on the model, number of input tokens, and number of output tokens.

    Parameters:
        model (str): The model to use (GPT-4, GPT-3.5 Turbo, etc.)
        input_tokens (int): The number of input tokens
        output_tokens (int): The number of output tokens

    Returns:
        float: The calculated price
    """

    # Calculate price based on model
    prices = GPT_PRICES[model]

    price = (input_tokens / 1000) * prices["input"] + (output_tokens / 1000) * prices[
        "output"
    ]

    return price


def calculate_gpt_price_from_response(model: GPTModel, usage: CompletionUsage) -> float:
    """
    Calculate the price based on the response from the OpenAI API.

    Parameters:
        res (dict): The response from the OpenAI API

    Returns:
        float: The calculated price
    """
    return calculate_gpt_price(
        model=model,
        input_tokens=usage.prompt_tokens,
        output_tokens=usage.completion_tokens,
    )
