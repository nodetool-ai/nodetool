import torch
from typing import Dict, Any

from nodetool.common.environment import Environment


class ModelManager:
    _models: Dict[str, Any] = {}

    @classmethod
    def get_model(cls, model_id: str, task: str) -> Any:
        if not Environment.is_production():
            return cls._models.get(f"{model_id}_{task}")
        return None

    @classmethod
    def set_model(cls, model_id: str, task: str, model: Any):
        if not Environment.is_production():
            cls._models[f"{model_id}_{task}"] = model

    @classmethod
    def clear(cls):
        cls._models.clear()
