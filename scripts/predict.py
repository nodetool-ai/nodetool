import asyncio
from nodetool.models.user import User
from nodetool.common.environment import Environment
from nodetool.common.nodetool_api_client import NodetoolAPIClient
from nodetool.api.types.prediction import PredictionCreateRequest

user, _ = User.create(email="test@example.com", verified=True)
assert user.auth_token

api_client = Environment.get_nodetool_api_client(
    user_id=user.id, auth_token=user.auth_token
)


sample_request = PredictionCreateRequest(
    model="meta/meta-llama-3-8b:9a9e68fc8695f5847ce944a5cecf9967fd7c64d0fb8c8af1d5bdcc71f03c5e47",
    node_id="llama_node_1",
    workflow_id="my_workflow_1",
    provider="replicate",
    params={
        "prompt": "Hello, how are you today?",
        "max_tokens": 50,
        "temperature": 0.7,
    },
)


async def create_prediction():
    prediction = await api_client.post(
        "/api/predictions/", json=sample_request.model_dump()
    )
    print(prediction)


asyncio.run(create_prediction())
