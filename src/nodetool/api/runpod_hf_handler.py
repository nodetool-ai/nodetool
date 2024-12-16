import runpod
from typing import Dict, Any
from huggingface_hub import hf_hub_download, snapshot_download, scan_cache_dir
from nodetool.common.huggingface_models import (
    delete_cached_hf_model,
)


def convert_file_info(file_info):
    return {
        "file_name": file_info.file_name,
        "size_on_disk": file_info.size_on_disk,
        "file_path": str(file_info.file_path),
        "blob_path": str(file_info.blob_path),
    }


def convert_revision_info(revision_info):
    return {
        "commit_hash": revision_info.commit_hash,
        "size_on_disk": revision_info.size_on_disk,
        "snapshot_path": str(revision_info.snapshot_path),
        "files": [convert_file_info(f) for f in revision_info.files],
    }


def convert_repo_info(repo_info):
    return {
        "repo_id": repo_info.repo_id,
        "repo_type": repo_info.repo_type,
        "repo_path": str(repo_info.repo_path),
        "size_on_disk": repo_info.size_on_disk,
        "nb_files": repo_info.nb_files,
        "revisions": [convert_revision_info(r) for r in repo_info.revisions],
    }


def convert_cache_info(cache_info):
    return {
        "size_on_disk": cache_info.size_on_disk,
        "repos": [convert_repo_info(r) for r in cache_info.repos],
        "warnings": [str(w) for w in cache_info.warnings],
    }


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

        elif operation == "scan":
            cache_info = scan_cache_dir()
            return convert_cache_info(cache_info)

        elif operation == "delete":
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
