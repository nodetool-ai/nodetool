from nodetool.common.environment import Environment
from nodetool.types.prediction import Prediction, PredictionResult


async def run_anthropic(
    prediction: Prediction,
):
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_anthropic_client()

    params = prediction.params
    if not "max_tokens" in params:
        params["max_tokens"] = 4000

    message = await client.messages.create(
        model=prediction.model,
        **params,
    )
    yield PredictionResult(
        prediction=prediction,
        content=message.model_dump(),
        encoding="json",
    )
