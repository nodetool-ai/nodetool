import dotenv

dotenv.load_dotenv()

import argparse
import json
import os
import uuid
import requests
from nodetool.workflows.run_job_request import RunJobRequest


def load_workflow_json(file_path: str) -> RunJobRequest:
    """Load workflow JSON from a file."""
    with open(file_path, "r") as f:
        workflow_data = json.load(f)
        # Create and validate RunJobRequest
        job_request = RunJobRequest(
            workflow_id=str(uuid.uuid4()),  # Generate a unique workflow ID
            graph=workflow_data.get("graph"),
            params=workflow_data.get("params"),
            messages=workflow_data.get("messages"),
            env=workflow_data.get("env"),
            explicit_types=workflow_data.get("explicit_types", False),
        )
        return job_request


def send_workflow_request(endpoint_id: str, req: RunJobRequest) -> None:
    """Send workflow request to RunPod API and stream the response."""
    api_key = os.getenv("RUNPOD_API_KEY")

    if endpoint_id == "localhost":
        run_url = f"http://localhost:5000/run"
    else:
        run_url = f"https://api.runpod.ai/v2/{endpoint_id}/run"

    headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
    payload = {"input": req.model_dump()}

    with requests.post(run_url, headers=headers, json=payload) as response:
        response.raise_for_status()
        job = response.json()

    job_id = job["id"]
    if endpoint_id == "localhost":
        stream_url = f"http://localhost:5000/stream/{job_id}"
    else:
        stream_url = f"https://api.runpod.ai/v2/{endpoint_id}/stream/{job_id}"

    with requests.post(
        stream_url, headers=headers, json=payload, stream=True
    ) as response:
        response.raise_for_status()
        for line in response.iter_lines():
            print(line)


def main():
    parser = argparse.ArgumentParser(description="Send workflow request to RunPod API")
    parser.add_argument(
        "--workflow", "-w", required=True, help="Path to workflow JSON file"
    )
    parser.add_argument("--endpoint-id", "-e", required=True, help="RunPod endpoint ID")

    args = parser.parse_args()

    try:
        req = load_workflow_json(args.workflow)
        send_workflow_request(args.endpoint_id, req)
    except Exception as e:
        print(f"Error: {str(e)}")
        exit(1)


if __name__ == "__main__":
    main()
