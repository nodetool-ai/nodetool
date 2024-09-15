def calculate_llm_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    pricing = {
        "meta/meta-llama-3-8b": (0.05, 0.25),
        "meta/meta-llama-3-13b": (0.10, 0.50),
        "meta/meta-llama-3-70b": (0.65, 2.75),
        "meta/meta-llama-3-8b-instruct": (0.05, 0.25),
        "meta/meta-llama-3-13b-instruct": (0.10, 0.50),
        "meta/meta-llama-3-70b-instruct": (0.65, 2.75),
        "mistralai/mistral-7b-v0.2": (0.05, 0.25),
        "mistralai/mistral-7b-instruct-v0.2": (0.05, 0.25),
        "mistralai/mixtral-8x7b-instruct-v0.1": (0.30, 1.00),
        "snowflake/snowflake-arctic-instruct": (20.00, 20.00),
    }

    model = model.split(":")[0]

    if model not in pricing:
        raise ValueError(f"Unsupported model: {model}")

    input_cost_per_million, output_cost_per_million = pricing[model]

    input_cost = input_tokens * input_cost_per_million / 1_000_000
    output_cost = output_tokens * output_cost_per_million / 1_000_000

    return input_cost + output_cost


def calculate_cost(hardware: str, duration: float):
    pricing = {
        "CPU": 0.000100,
        "Nvidia T4 GPU": 0.000225,
        "Nvidia T4 (High-memory) GPU": 0.000225,
        "Nvidia A40 GPU": 0.000575,
        "Nvidia A40 (Large) GPU": 0.000725,
        "Nvidia A100 (40GB) GPU": 0.001150,
        "Nvidia A100 (80GB) GPU": 0.001400,
        "8x Nvidia A40 (Large) GPU": 0.005800,
    }

    if hardware in pricing:
        price_per_second = pricing[hardware]
        total_price = price_per_second * duration
        return total_price
    else:
        return 0.0
