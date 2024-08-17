import base64
from io import BytesIO
from typing import Any
import pydub

from openai.types.chat import ChatCompletion, ChatCompletionMessageParam

from nodetool.common.environment import Environment
from nodetool.providers.openai.cost_calculation import calculate_cost
from nodetool.providers.openai.cost_calculation import (
    calculate_cost_for_completion_usage,
)
from nodetool.providers.openai.cost_calculation import (
    calculate_cost_for_embedding_usage,
)
from nodetool.types.prediction import Prediction, PredictionResult


async def create_embedding(prediction: Prediction):
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_openai_client()
    res = await client.embeddings.create(
        input=prediction.params["input"], model=prediction.model
    )
    cost = calculate_cost_for_embedding_usage(prediction.model, res.usage)
    prediction.cost = cost
    return PredictionResult(
        prediction=prediction,
        content=res.model_dump(),
        encoding="json",
    )


async def create_speech(prediction: Prediction):
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_openai_client()
    params = prediction.params
    res = await client.audio.speech.create(
        model=prediction.model,
        response_format="mp3",
        **params,
    )
    prediction.cost = calculate_cost(prediction.model, len(params["input"]), 0)
    return PredictionResult(
        prediction=prediction,
        content=base64.b64encode(res.content),
        encoding="base64",
    )


async def create_chat_completion(
    prediction: Prediction,
) -> Any:
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_openai_client()
    res: ChatCompletion = await client.chat.completions.create(
        model=prediction.model,
        **prediction.params,
    )
    assert res.usage is not None
    prediction.cost = calculate_cost_for_completion_usage(prediction.model, res.usage)

    return PredictionResult(
        prediction=prediction,
        content=res.model_dump(),
        encoding="json",
    )


async def create_whisper(
    prediction: Prediction,
) -> Any:
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_openai_client()
    params = prediction.params
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

    return PredictionResult(
        prediction=prediction,
        content=res.model_dump(),
        encoding="json",
    )


async def create_image(prediction: Prediction) -> Any:
    client = Environment.get_openai_client()
    params = prediction.params
    image = await client.images.generate(
        model=prediction.model,
        response_format="b64_json",
        **params,
    )
    cost_model = f"dalle-3 {params['quality']} {params['size']}"
    prediction.cost = calculate_cost(cost_model, len(params["prompt"]), 0)

    return PredictionResult(
        prediction=prediction,
        content=image.model_dump(),
        encoding="json",
    )


async def run_openai(prediction: Prediction) -> Any:
    model = prediction.model
    assert model is not None, "Model is not set"

    if model.startswith("text-embedding-"):
        yield await create_embedding(prediction)

    elif model.startswith("gpt-"):
        yield await create_chat_completion(prediction)

    elif model.startswith("tts-"):
        yield await create_speech(prediction)

    elif model.startswith("whisper-"):
        yield await create_whisper(prediction)

    elif model.startswith("dall-e-"):
        yield await create_image(prediction)

    else:
        raise ValueError(f"Unsupported model: {model}")
