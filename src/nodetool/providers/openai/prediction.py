import base64
from io import BytesIO
from typing import Any
import pydub

from openai.types.chat import ChatCompletion, ChatCompletionMessageParam

from nodetool.common.environment import Environment
from nodetool.models.prediction import Prediction
from nodetool.providers.openai.cost_calculation import calculate_cost
from nodetool.providers.openai.cost_calculation import (
    calculate_cost_for_completion_usage,
)
from nodetool.providers.openai.cost_calculation import (
    calculate_cost_for_embedding_usage,
)


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
        response_format="mp3",
        **params,
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
        **params,
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
        response_format="b64_json",
        **params,
    )
    cost_model = f"dalle-3 {params['quality']} {params['size']}"
    prediction.cost = calculate_cost(cost_model, len(params["prompt"]), 0)
    prediction.save()

    return image.model_dump()


async def run_openai(prediction: Prediction, params: dict) -> Any:
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
