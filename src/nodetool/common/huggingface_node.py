import asyncio
import httpx
from nodetool.common.environment import Environment
from datetime import datetime
from nodetool.common.replicate_node import convert_enum_value, convert_output_value
from nodetool.models.prediction import Prediction
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any, Type
from nodetool.workflows.types import NodeUpdate

log = Environment.get_logger()
API_URL = "https://api-inference.huggingface.co/models"
MAX_RETRY_COUNT = 10


async def run_huggingface(
    prediction: Prediction,
    params: dict,
    data: bytes | None = None,
) -> Any:
    model = prediction.model
    log.info(f"Running model {model} on Huggingface.")
    started_at = datetime.now()

    url = f"{API_URL}/{model}"
    headers = {
        "Authorization": f"Bearer {Environment.get_huggingface_token()}",
    }

    try:
        async with httpx.AsyncClient(timeout=600) as client:
            retry_count = 0
            while True:
                if data:
                    response = await client.post(url, headers=headers, content=data)
                else:
                    response = await client.post(url, headers=headers, json=params)

                if response.status_code == 503:
                    result = response.json()
                    log.info(
                        f"Model {model} is booting. Waiting for {result['estimated_time']} seconds."
                    )
                    prediction.status = "booting"
                    prediction.save()

                    await asyncio.sleep(result["estimated_time"] / 2)
                    retry_count += 1
                    if retry_count > MAX_RETRY_COUNT:
                        raise Exception(
                            f"Failed to run model {model}. Status: {result['error']}."
                        )
                elif response.status_code != 200:
                    raise Exception(
                        f"Failed to run model {model}. Status code: {response.status_code}. Response: {response.text}"
                    )
                else:
                    if response.headers.get("content-type") == "application/json":
                        result = response.json()
                    else:
                        result = response.content
                    break

            prediction.duration = (datetime.now() - started_at).total_seconds()
            prediction.status = "completed"
            prediction.completed_at = datetime.now()
            prediction.save()

            return result

    except Exception as e:
        log.exception(e)
        prediction.status = "failed"
        prediction.error = str(e)
        prediction.completed_at = datetime.now()
        prediction.save()
        raise e


class HuggingfaceNode(BaseNode):

    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HuggingfaceNode

    async def run_huggingface(
        self,
        model_id: str,
        context: ProcessingContext,
        params: dict[(str, Any)] | None = None,
        data: bytes | None = None,
    ) -> Any:
        if params and data:
            raise ValueError("Cannot provide both params and data to run_huggingface.")
        raw_inputs = {
            prop.name: convert_enum_value(getattr(self, prop.name))
            for prop in self.properties()
        }
        raw_inputs = {**raw_inputs, **(params or {})}

        input_params = {
            prop.name: await context.convert_value_for_prediction(
                prop,
                getattr(self, prop.name),
            )
            for prop in self.properties()
        }
        input_params = {
            key: value for (key, value) in input_params.items() if (value is not None)
        }
        input_params = {**input_params, **(params or {})}

        context.post_message(
            NodeUpdate(
                node_id=self.id,
                node_name=model_id,
                status="starting",
                started_at=datetime.now().isoformat(),
            )
        )

        res = await context.run_prediction(
            provider="huggingface",
            node_id=self.id,
            model=model_id,
            params=input_params,
            data=data,
        )
        if res.media_type == "application/json":
            return res.json()
        else:
            return res.content

    async def extra_params(self, context: ProcessingContext) -> dict:
        return {}

    async def convert_output(self, context: ProcessingContext, output: Any) -> Any:
        t = self.return_type()
        if isinstance(t, dict):
            return output
        if isinstance(t, Type):
            output = await convert_output_value(output, t)
        return {
            "output": output,
        }
