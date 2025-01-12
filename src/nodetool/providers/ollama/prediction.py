from typing import Any
from ollama import AsyncClient
from nodetool.common.environment import Environment
from nodetool.providers.ollama.ollama_service import get_ollama_client
from nodetool.types.prediction import Prediction, PredictionResult

log = Environment.get_logger()


async def run_ollama(prediction: Prediction, env: dict[str, str]) -> Any:
    model = prediction.model
    assert model is not None, "Model is not set"

    client = get_ollama_client()
    params = prediction.params

    if "raw" in params:
        res = await client.generate(model=model, **params)
        yield PredictionResult(
            prediction=prediction,
            content=res,
            encoding="json",
        )
    elif "prompt" in params:
        res = await client.embeddings(model=model, **params)
        yield PredictionResult(
            prediction=prediction,
            content=res,
            encoding="json",
        )
    else:
        res = await client.chat(model=model, **params)
        if params.get("stream", False):
            async for part in res:
                yield part
        else:
            yield PredictionResult(
                prediction=prediction,
                content=res,
                encoding="json",
            )
