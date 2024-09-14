import torch
from typing import Dict, Any

from nodetool.common.environment import Environment


class ModelManager:
    _models: Dict[str, Any] = {}

    @classmethod
    def get_model(cls, model_id: str, task: str, path: str | None = None) -> Any:
        if not Environment.is_production():
            return cls._models.get(f"{model_id}_{task}_{path}")
        return None

    @classmethod
    def set_model(cls, model_id: str, task: str, model: Any, path: str | None = None):
        if not Environment.is_production():
            cls._models[f"{model_id}_{task}_{path}"] = model

    @classmethod
    def clear(cls):
        cls._models.clear()
