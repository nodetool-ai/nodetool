from typing import Any
from nodetool.common.environment import Environment
from nodetool.models.prediction import Prediction


async def run_ollama(prediction: Prediction, params: dict) -> Any:
    model = prediction.model
    client = Environment.get_ollama_client()

    if "raw" in params:
        return await client.generate(model=model, **params)
    elif "prompt" in params:
        return await client.embeddings(model=model, **params)
    else:
        return await client.chat(model=model, **params)
