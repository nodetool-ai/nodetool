import torch
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from transformers import Pipeline, pipeline
from typing import Any
from nodetool.model_manager import ModelManager
from typing import Any, TypeVar

T = TypeVar("T")


class HuggingFacePipelineNode(HuggingfaceNode):
    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HuggingFacePipelineNode

    _pipeline: Pipeline | None = None

    def get_torch_dtype(self):
        return torch.float16

    async def load_pipeline(
        self,
        context: ProcessingContext,
        pipeline_task: str,
        model_id: str,
        device: str | None = None,
        **kwargs: Any,
    ) -> T:
        cached_model = ModelManager.get_model(model_id, pipeline_task)
        if cached_model:
            return cached_model

        if not context.is_huggingface_model_cached(model_id):
            raise ValueError(f"Model {model_id} must be downloaded first")

        if device is None:
            device = context.device

        model = pipeline(
            pipeline_task,
            model=model_id,
            torch_dtype=self.get_torch_dtype(),
            device=device,
            **kwargs,
        )
        ModelManager.set_model(model_id, pipeline_task, model)
        return model

    async def load_model(
        self,
        context: ProcessingContext,
        model_class: type[T],
        model_id: str,
        variant: str | None = "fp16",
        **kwargs: Any,
    ) -> T:
        cached_model = ModelManager.get_model(model_id, model_class.__name__)
        if cached_model:
            return cached_model

        if not context.is_huggingface_model_cached(model_id):
            raise ValueError(f"Model {model_id} must be downloaded first")

        model = model_class.from_pretrained(
            model_id,
            torch_dtype=self.get_torch_dtype(),
            variant=variant,
            **kwargs,
        )
        ModelManager.set_model(model_id, model_class.__name__, model)
        return model

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> Any:
        raise NotImplementedError("Subclasses must implement this method")
