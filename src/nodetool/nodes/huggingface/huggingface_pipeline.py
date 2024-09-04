import torch
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

    # run_on_huggingface: bool = Field(
    #     default=False,
    #     title="Run on Huggingface",
    #     description="Whether to run the node on Huggingface servers",
    # )
    _pipeline: Pipeline | None = None

    def get_torch_dtype(self):
        return torch.float16

    async def initialize(self, context: ProcessingContext):
        # if not self.run_on_huggingface:
        from transformers import pipeline

        self._pipeline = pipeline(
            self.pipeline_task,
            model=self.get_model_id(),
            device=context.device,
            torch_dtype=self.get_torch_dtype(),
            local_files_only=True,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            import torch

            self._pipeline.model.to(device)  # type: ignore
            self._pipeline.device = torch.device(device)

    def get_params(self):
        return {}

    async def process_remote(self, context: ProcessingContext) -> Any:
        params = self.get_params()
        params["inputs"] = await self.get_inputs(context)
        result = await self.run_huggingface(
            model_id=self.get_model_id(), context=context, params=params
        )
        return await self.process_remote_result(context, result)

    async def process_local(self, context: ProcessingContext) -> Any:
        assert self._pipeline is not None
        inputs = await self.get_inputs(context)
        if isinstance(inputs, torch.Tensor):
            # convert to half precision
            inputs = inputs.to(torch.float16)
        result = self._pipeline(inputs, **self.get_params())
        return await self.process_local_result(context, result)

    async def process(self, context: ProcessingContext) -> Any:
        # if self.run_on_huggingface:
        #     return await self.process_remote(context)
        # else:
        return await self.process_local(context)

    async def get_inputs(self, context: ProcessingContext):
        raise NotImplementedError("Subclasses must implement this method")

    def get_model_id(self):
        raise NotImplementedError("Subclasses must implement this method")

    @property
    def pipeline_task(self) -> str:
        raise NotImplementedError("Subclasses must implement this property")

    async def process_remote_result(self, context: Any, result: Any) -> Any:
        raise NotImplementedError("Subclasses must implement this method")

    async def process_local_result(self, context: Any, result: Any) -> Any:
        raise NotImplementedError("Subclasses must implement this method")
