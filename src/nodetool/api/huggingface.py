from typing import List, Dict
from huggingface_hub import HfApi, ModelFilter


def list_local_huggingface_models() -> List[Dict[str, str]]:
    api = HfApi()

    # Get all models from the Hugging Face Hub
    models = api.list_models(filter=ModelFilter(task="text-generation"))

    # Extract relevant information for each model
    model_list = [
        {
            "id": model.modelId,
            "name": model.modelId.split("/")[-1],
            "author": model.modelId.split("/")[0],
            "downloads": model.downloads,
            "likes": model.likes,
            "tags": model.tags,
        }
        for model in models
    ]

    return model_list
