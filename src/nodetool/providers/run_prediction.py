from nodetool.metadata.types import Provider
from nodetool.providers.anthropic.prediction import run_anthropic
from nodetool.providers.huggingface.prediction import run_huggingface
from nodetool.providers.ollama.prediction import run_ollama
from nodetool.providers.openai.prediction import run_openai
from nodetool.providers.replicate.prediction import run_replicate
from nodetool.types.prediction import Prediction, PredictionResult
from typing import AsyncGenerator


async def run_prediction(
    prediction: Prediction,
) -> AsyncGenerator[PredictionResult | Prediction, None]:
    """
    Run the prediction for a given model.
    """
    provider_functions = {
        Provider.HuggingFace: run_huggingface,
        Provider.Replicate: run_replicate,
        Provider.OpenAI: run_openai,
        Provider.Anthropic: run_anthropic,
        Provider.Ollama: run_ollama,
    }

    if prediction.provider in provider_functions:
        f = provider_functions[prediction.provider]
        async for msg in f(prediction):
            yield msg
    else:
        raise ValueError("Provider not supported")
