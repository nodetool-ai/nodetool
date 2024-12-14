import torch
from typing import Dict, Any
import logging

from nodetool.common.environment import Environment

logger = Environment.get_logger()


class ModelManager:
    _models: Dict[str, Any] = {}
    _models_by_node: Dict[str, str] = {}

    @classmethod
    def get_model(cls, model_id: str, task: str, path: str | None = None) -> Any:
        if not Environment.is_production():
            key = f"{model_id}_{task}_{path}"
            model = cls._models.get(key)
            return model
        return None

    @classmethod
    def set_model(
        cls, node_id: str, model_id: str, task: str, model: Any, path: str | None = None
    ):
        if not Environment.is_production():
            key = f"{model_id}_{task}_{path}"
            cls._models[key] = model
            cls._models_by_node[node_id] = key

    @classmethod
    def clear_unused(cls, node_ids: list[str]):
        cleared_count = 0
        for node_id in node_ids:
            key = cls._models_by_node.pop(node_id, None)
            if key:
                del cls._models[key]
                cleared_count += 1
        logger.info(f"Cleared {cleared_count} unused models")

    @classmethod
    def clear(cls):
        model_count = len(cls._models)
        node_count = len(cls._models_by_node)
        cls._models.clear()
        cls._models_by_node.clear()
        logger.info(f"Cleared all models: {model_count} models, {node_count} nodes")
