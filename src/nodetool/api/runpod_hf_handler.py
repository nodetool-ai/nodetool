import runpod
from typing import Dict, Any, List
from nodetool.api.model import RepoPath
from nodetool.common.huggingface_file import (
    HFFileInfo,
    HFFileRequest,
    get_huggingface_file_infos,
)
from huggingface_hub import hf_hub_download
from nodetool.common.huggingface_cache import (
    try_to_load_from_cache,
)
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_hf_model,
    read_cached_hf_models,
)


async def handler(event: Dict[str, Any]) -> Dict[str, Any]:
    """
    Main handler for RunPod serverless functions related to Hugging Face operations
    """
    try:
        job_input = event["input"]
        operation = job_input.get("operation")

        if operation == "download":
            repo_id = job_input.get("repo_id")
            file_path = job_input.get("file_path")
            if not repo_id or not file_path:
                raise ValueError(
                    "repo_id and file_path are required for download operation"
                )

            local_path = hf_hub_download(repo_id, file_path)
            return {"local_path": local_path}

        elif operation == "huggingface_models":
            models = await read_cached_hf_models()
            return {"models": [model.model_dump() for model in models]}

        elif operation == "delete_hf_model":
            repo_id = job_input.get("repo_id")
            if not repo_id:
                raise ValueError("repo_id is required for delete operation")

            success = delete_cached_hf_model(repo_id)
            return {"success": success}

        elif operation == "huggingface_file_info":
            requests = [HFFileRequest(**req) for req in job_input.get("requests", [])]
            if not requests:
                raise ValueError("requests array is required for file info operation")

            file_infos = get_huggingface_file_infos(requests)
            return {"file_infos": [info.model_dump() for info in file_infos]}

        elif operation == "try_cache_files":
            paths = [RepoPath(**path) for path in job_input.get("paths", [])]
            if not paths:
                raise ValueError("paths array is required for cache check operation")

            def check_path(path: RepoPath) -> bool:
                return try_to_load_from_cache(path.repo_id, path.path) is not None

            results = [
                {
                    "repo_id": path.repo_id,
                    "path": path.path,
                    "downloaded": check_path(path),
                }
                for path in paths
            ]
            return {"results": results}

        else:
            raise ValueError(f"Unknown operation: {operation}")

    except Exception as e:
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
