import anthropic.lib
from nodetool.types.prediction import Prediction, PredictionResult
import anthropic


async def run_anthropic(
    prediction: Prediction,
    env: dict[str, str],
):
    assert prediction.model is not None, "Model is not set"

    params = prediction.params
    if not "max_tokens" in params:
        params["max_tokens"] = 4000

    api_key = env.get("ANTHROPIC_API_KEY")

    assert api_key, "ANTHROPIC_API_KEY not set"

    client = anthropic.AsyncAnthropic(
        api_key=api_key,
        default_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )

    message = await client.messages.create(
        model=prediction.model,
        **params,
    )
    yield PredictionResult(
        prediction=prediction,
        content=message.model_dump(),
        encoding="json",
    )
