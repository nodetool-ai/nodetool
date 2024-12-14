import torch
from nodetool.common.environment import Environment
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.types.job import JobUpdate
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from transformers import Pipeline, pipeline
from typing import Any
from nodetool.model_manager import ModelManager
from huggingface_hub.file_download import try_to_load_from_cache
from typing import Any, TypeVar

T = TypeVar("T")

log = Environment.get_logger()


class HuggingFacePipelineNode(HuggingfaceNode):
    @classmethod
    def is_visible(cls) -> bool:
        return cls is not HuggingFacePipelineNode

    _pipeline: Pipeline | None = None

    def should_skip_cache(self):
        return False

    async def load_pipeline(
        self,
        context: ProcessingContext,
        pipeline_task: str,
        model_id: Any,
        device: str | None = None,
        torch_dtype: torch.dtype | None = torch.float16,
        **kwargs: Any,
    ):
        if model_id == "" or model_id is None:
            raise ValueError("Please select a model")

        cached_model = ModelManager.get_model(model_id, pipeline_task)
        if cached_model:
            return cached_model

        # if not context.is_huggingface_model_cached(model_id):
        #     raise ValueError(f"Model {model_id} must be downloaded first")

        if device is None:
            device = context.device

        context.post_message(
            JobUpdate(
                status="running",
                message=f"Loading pipeline {type(model_id) == str and model_id or pipeline_task} from HuggingFace",
            )
        )
        model = pipeline(
            pipeline_task,
            model=model_id,
            torch_dtype=torch_dtype,
            device=device,
            **kwargs,
        )
        ModelManager.set_model(self.id, model_id, pipeline_task, model)
        return model  # type: ignore

    async def load_model(
        self,
        context: ProcessingContext,
        model_class: type[T],
        model_id: str,
        variant: str | None = "fp16",
        torch_dtype: torch.dtype | None = torch.float16,
        path: str | None = None,
        skip_cache: bool = False,
        **kwargs: Any,
    ) -> T:
        if model_id == "":
            raise ValueError("Please select a model")

        if not skip_cache and not self.should_skip_cache():
            cached_model = ModelManager.get_model(model_id, model_class.__name__, path)
            if cached_model:
                return cached_model

        if path:
            cache_path = try_to_load_from_cache(model_id, path)
            if not cache_path:
                raise ValueError(f"Model {model_id}/{path} must be downloaded first")
            log.info(f"Loading model {model_id}/{path} from {cache_path}")
            context.post_message(
                JobUpdate(
                    status="running",
                    message=f"Loading model {model_id} from {cache_path}",
                )
            )
            model = model_class.from_single_file(  # type: ignore
                cache_path,
                torch_dtype=torch_dtype,
                variant=variant,
                **kwargs,
            )
        else:
            # if not await context.is_huggingface_model_cached(model_id):
            #     raise ValueError(f"Model {model_id} must be downloaded first")
            log.info(f"Loading model {model_id} from HuggingFace")
            context.post_message(
                JobUpdate(
                    status="running",
                    message=f"Loading model {model_id} from HuggingFace",
                )
            )
            model = model_class.from_pretrained(  # type: ignore
                model_id,
                torch_dtype=torch_dtype,
                variant=variant,
                **kwargs,
            )

        ModelManager.set_model(self.id, model_id, model_class.__name__, model, path)
        return model

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> Any:
        raise NotImplementedError("Subclasses must implement this method")

    def requires_gpu(self) -> bool:
        return True
