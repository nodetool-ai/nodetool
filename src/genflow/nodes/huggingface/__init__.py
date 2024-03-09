import httpx
import asyncio

from datetime import datetime
from typing import Any, Type
from genflow.common.environment import Environment
from genflow.workflows.types import NodeUpdate
from genflow.workflows.genflow_node import GenflowNode
from genflow.nodes.replicate import convert_enum_value, convert_output_value
from genflow.workflows.processing_context import ProcessingContext
from genflow.common.environment import Environment
from genflow.models.prediction import Prediction


log = Environment.get_logger()
API_URL = "https://api-inference.huggingface.co/models"


async def run_huggingface(
    context: ProcessingContext,
    node_type: str,
    node_id: str,
    model_id: str,
    input_params: dict,
    data: bytes | None = None,
):
    log.info(f"Running model {model_id} on Huggingface.")
    started_at = datetime.now()

    url = f"{API_URL}/{model_id}"

    context.post_message(
        NodeUpdate(
            node_id=node_id, status="starting", started_at=started_at.isoformat()
        )
    )

    prediction = await context.create_prediction(
        model=model_id,
        version="",
        node_id=node_id,
        node_type=node_type,
        workflow_id=context.workflow_id if context.workflow_id != "" else None,
    )

    context.post_message(prediction)

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
                    response = await client.post(
                        url, headers=headers, json=input_params
                    )

                if response.status_code == 503:
                    result = response.json()
                    log.info(
                        f"Model {model_id} is booting. Waiting for {result['estimated_time']} seconds."
                    )
                    await asyncio.sleep(result["estimated_time"])
                    retry_count += 1
                    if retry_count > 5:
                        raise Exception(
                            f"Failed to run model {model_id}. Status: {result['error']}."
                        )
                elif response.status_code != 200:
                    raise Exception(
                        f"Failed to run model {model_id}. Status code: {response.status_code}. Response: {response.text}"
                    )
                else:
                    if response.headers.get("content-type") == "application/json":
                        result = response.json()
                        prediction.output = result
                    else:
                        result = response.content
                    break

            await context.update_prediction(
                prediction.id,
                status="completed",
                completed_at=datetime.now(),
            )

            context.post_message(prediction)

            return result

    except Exception as e:
        log.exception(e)
        await context.update_prediction(
            prediction.id,
            status="failed",
            error=str(e),
            completed_at=datetime.now(),
        )
        context.post_message(prediction)
        raise e


class HuggingfaceNode(GenflowNode):
    async def run_huggingface(
        self,
        model_id: str,
        context: ProcessingContext,
        params: dict[(str, Any)] = {},
        data: bytes | None = None,
    ):
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

        return await run_huggingface(
            context=context,
            node_id=self.id,
            node_type=self.get_node_type(),
            model_id=model_id,
            input_params=input_params,
            data=data,
        )

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
