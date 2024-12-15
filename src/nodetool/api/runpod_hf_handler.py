import runpod
from typing import Dict, Any
from dataclasses import asdict
from huggingface_hub import hf_hub_download, snapshot_download, scan_cache_dir
from nodetool.common.huggingface_models import (
    delete_cached_hf_model,
)


async def handler(event: Dict[str, Any]) -> dict[str, Any]:
    """
    Main handler for RunPod serverless functions related to Hugging Face operations
    """
    try:
        job_input = event["input"]
        operation = job_input.get("operation")

        if operation == "download":
            repo_id = job_input.get("repo_id")
            file_path = job_input.get("file_path")
            ignore_patterns = job_input.get("ignore_patterns")
            allow_patterns = job_input.get("allow_patterns")
            if not repo_id:
                raise ValueError(
                    "repo_id and file_path are required for download operation"
                )

            if file_path:
                local_path = hf_hub_download(repo_id, file_path)
            else:
                local_path = snapshot_download(
                    repo_id,
                    ignore_patterns=ignore_patterns,
                    allow_patterns=allow_patterns,
                )
            return {"local_path": local_path}

        elif operation == "huggingface_models":
            cache_info = scan_cache_dir()
            return asdict(cache_info)

        elif operation == "delete_hf_model":
            repo_id = job_input.get("repo_id")
            if not repo_id:
                raise ValueError("repo_id is required for delete operation")

            success = delete_cached_hf_model(repo_id)
            return {"success": success}

        else:
            raise ValueError(f"Unknown operation: {operation}")

    except Exception as e:
        return {"error": str(e)}


runpod.serverless.start({"handler": handler})
