from typing import Any
from ollama import AsyncClient
from nodetool.common.environment import Environment
from nodetool.types.prediction import Prediction, PredictionResult

log = Environment.get_logger()


async def run_ollama(prediction: Prediction, env: dict[str, str]) -> Any:
    model = prediction.model
    assert model is not None, "Model is not set"

    api_url = env.get("OLLAMA_API_URL")
    assert api_url, "OLLAMA_API_URL not set"

    client = AsyncClient(api_url)
    params = prediction.params

    if "raw" in params:
        res = await client.generate(model=model, **params)
    elif "prompt" in params:
        res = await client.embeddings(model=model, **params)
    else:
        res = await client.chat(model=model, **params)

    yield PredictionResult(
        prediction=prediction,
        content=res,
        encoding="json",
    )
