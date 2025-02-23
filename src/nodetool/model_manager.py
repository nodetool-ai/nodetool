import torch
from typing import Dict, Any
import logging

from nodetool.common.environment import Environment

logger = Environment.get_logger()


class ModelManager:
    """Manages ML model instances and their associations with nodes.

    This class provides a centralized way to store, retrieve, and manage machine learning
    models in non-production environments. It maintains mappings between models and nodes
    and provides utilities for model lifecycle management.

    Attributes:
        _models (Dict[str, Any]): Storage for model instances keyed by model_id, task, and path
        _models_by_node (Dict[str, str]): Mapping of node IDs to model keys
    """

    _models: Dict[str, Any] = {}
    _models_by_node: Dict[str, str] = {}

    @classmethod
    def get_model(cls, model_id: str, task: str, path: str | None = None) -> Any:
        """Retrieves a model instance based on the given parameters.

        Args:
            model_id (str): Identifier for the model
            task (str): Task associated with the model
            path (str | None): Optional path parameter

        Returns:
            Any: The stored model instance if found in non-production environment, None otherwise
        """
        if not Environment.is_production():
            key = f"{model_id}_{task}_{path}"
            model = cls._models.get(key)
            logger.debug(f"Retrieved model for key: {key}")
            return model
        return None

    @classmethod
    def set_model(
        cls, node_id: str, model_id: str, task: str, model: Any, path: str | None = None
    ):
        """Stores a model instance and associates it with a node.

        Args:
            node_id (str): ID of the node associated with the model
            model_id (str): Identifier for the model
            task (str): Task associated with the model
            model (Any): The model instance to store
            path (str | None): Optional path parameter
        """
        if not Environment.is_production():
            key = f"{model_id}_{task}_{path}"
            cls._models[key] = model
            cls._models_by_node[node_id] = key
            logger.debug(f"Stored model for node {node_id} with key: {key}")

    @classmethod
    def clear_unused(cls, node_ids: list[str]):
        """Removes models that are no longer associated with active nodes.

        Args:
            node_ids (list[str]): List of active node IDs to check against
        """
        cleared_count = 0
        for node_id in node_ids:
            key = cls._models_by_node.pop(node_id, None)
            if key:
                del cls._models[key]
                cleared_count += 1
                logger.debug(f"Cleared model for node {node_id} with key: {key}")
        logger.info(f"Cleared {cleared_count} unused models")

    @classmethod
    def clear(cls):
        """Removes all stored models and node associations."""
        model_count = len(cls._models)
        node_count = len(cls._models_by_node)
        cls._models.clear()
        cls._models_by_node.clear()
        logger.info(f"Cleared all models: {model_count} models, {node_count} nodes")
