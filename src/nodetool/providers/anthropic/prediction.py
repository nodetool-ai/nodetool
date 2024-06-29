from nodetool.common.environment import Environment
from nodetool.models.prediction import Prediction


async def run_anthropic(
    prediction: Prediction,
    params: dict,
):
    print(params)
    client = Environment.get_anthropic_client()
    message = await client.messages.create(
        model=prediction.model,
        **params,
    )
    print(message)
    return message.model_dump()
