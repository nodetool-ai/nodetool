from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from transformers import Pipeline
from enum import Enum
from typing import Any


class HuggingFacePipelineNode(HuggingfaceNode):
    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HuggingFacePipelineNode

    run_on_huggingface: bool = Field(
        default=False,
        title="Run on Huggingface",
        description="Whether to run the node on Huggingface servers",
    )
    model: Enum
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )
    _pipeline: Pipeline | None = None

    async def initialize(self, context: Any):
        if not self.run_on_huggingface:
            from transformers import pipeline
            self._pipeline = pipeline(self.pipeline_task, model=self.model.value)

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            import torch
            self._pipeline.model.to(device) # type: ignore
            self._pipeline.device = torch.device(device)

    def get_params(self):
        return {}
    
    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote(self, context: ProcessingContext) -> Any:
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, params=self.get_params()
        )
        return await self.process_remote_result(context, result)
    
    async def process_local(self, context: ProcessingContext) -> Any:
        assert self._pipeline is not None
        inputs = await self.get_inputs(context)
        result = self._pipeline(inputs, **self.get_params())
        return await self.process_local_result(context, result)

    async def process(self, context: ProcessingContext) -> Any:
        if self.run_on_huggingface:
            return await self.process_remote(context)
        else:
            return await self.process_local(context)

    @property
    def pipeline_task(self) -> str:
        raise NotImplementedError("Subclasses must implement this property")

    async def process_remote_result(self, context: Any, result: Any) -> Any:
        raise NotImplementedError("Subclasses must implement this method")

    async def process_local_result(self, context: Any, result: Any) -> Any:
        raise NotImplementedError("Subclasses must implement this method")