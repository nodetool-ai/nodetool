import base64
from io import BytesIO
from typing import Any
import pydub

from openai.types.completion_usage import CompletionUsage
from openai.types.create_embedding_response import Usage
from openai.types.chat import ChatCompletion, ChatCompletionMessageParam

from nodetool.common.environment import Environment
from nodetool.models.prediction import Prediction


def calculate_cost(
    model: str,
    input_tokens: int,
    output_tokens: int | None = None,
) -> float:
    # Pricing information for different models
    pricing: dict[str, Any] = {
        "gpt-4o": {"input": 5.00, "output": 15.00},
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


async def create_embedding(prediction: Prediction, input: str) -> Any:
    client = Environment.get_openai_client()
    res = await client.embeddings.create(input=input, model=prediction.model)
    cost = calculate_cost_for_embedding_usage(prediction.model, res.usage)
    prediction.cost = cost
    prediction.save()
    return res.model_dump()


async def create_speech(prediction: Prediction, params: dict) -> Any:
    client = Environment.get_openai_client()
    res = await client.audio.speech.create(
        model=prediction.model,
        input=params["input"],
        voice=params["voice"],
        speed=params["speed"],
        response_format="mp3",
    )
    prediction.cost = calculate_cost(prediction.model, len(params["input"]), 0)
    prediction.save()
    return res.content


async def create_chat_completion(
    prediction: Prediction,
    params: dict[str, Any],
) -> Any:
    client = Environment.get_openai_client()

    res: ChatCompletion = await client.chat.completions.create(
        model=prediction.model,
        messages=params["messages"],
        max_tokens=params["max_tokens"],
        temperature=params["temperature"],
        top_p=params["top_p"],
        presence_penalty=params["presence_penalty"],
        frequency_penalty=params["frequency_penalty"],
        response_format={"type": params["response_format"]},
    )
    assert res.usage is not None
    prediction.cost = calculate_cost_for_completion_usage(prediction.model, res.usage)
    prediction.save()
    return res.model_dump()


async def create_whisper(
    prediction: Prediction,
    params: dict,
) -> Any:
    client = Environment.get_openai_client()
    file = base64.b64decode(params["file"])
    audio_segment: pydub.AudioSegment = pydub.AudioSegment.from_file(BytesIO(file))

    if params.get("translate", False):
        res = await client.audio.translations.create(
            model=prediction.model,
            file=("file.mp3", file, "audio/mp3"),
            temperature=params["temperature"],
        )
    else:
        res = await client.audio.transcriptions.create(
            model=prediction.model,
            file=("file.mp3", file, "audio/mp3"),
            temperature=params["temperature"] if "temperature" in params else 0.0,
        )

    prediction.cost = calculate_cost(
        prediction.model, int(audio_segment.duration_seconds)
    )
    prediction.save()

    return res.model_dump()


async def create_image(prediction: Prediction, params: dict) -> Any:
    client = Environment.get_openai_client()
    image = await client.images.generate(
        model=prediction.model,
        prompt=params["prompt"],
        size=params["size"],
        quality=params["quality"],
        style=params["style"],
        response_format="b64_json",
    )
    cost_model = f"dalle-3 {params['quality']} {params['size']}"
    prediction.cost = calculate_cost(cost_model, len(params["prompt"]), 0)
    prediction.save()

    return image.model_dump()


async def run_openai(prediction: Prediction, params: dict) -> Any:
    client = Environment.get_openai_client()
    model = prediction.model

    if model.startswith("text-embedding-"):
        return await create_embedding(prediction, params["input"])

    elif model.startswith("gpt-"):
        return await create_chat_completion(prediction, params)

    elif model.startswith("tts-"):
        return await create_speech(prediction, params)

    elif model.startswith("whisper-"):
        return await create_whisper(prediction, params)

    elif model.startswith("dall-e-"):
        return await create_image(prediction, params)

    else:
        raise ValueError(f"Unsupported model: {model}")
