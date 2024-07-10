from nodetool.common.environment import Environment
from nodetool.types.prediction import Prediction, PredictionResult


async def run_anthropic(
    prediction: Prediction,
):
    assert prediction.model is not None, "Model is not set"
    client = Environment.get_anthropic_client()
    message = await client.messages.create(
        model=prediction.model,
        **prediction.params,
    )
    yield PredictionResult(
        prediction=prediction,
        content=message.model_dump(),
        encoding="json",
    )
