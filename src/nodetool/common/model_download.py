import asyncio
import modal
import tqdm
from modal import Volume
import os
import time
from sys import stdout
from nodetool.common.environment import Environment
import nodetool.common.model_files as model_files


async def download_file(url: str, dest: str) -> None:
    """
    Downloads a file from the given URL and saves it to the specified destination.

    Args:
        url (str): The URL of the file to download.
        dest (str): The destination path where the file will be saved.

    Raises:
        httpx.HTTPStatusError: If the HTTP response status is not successful.
    """
    import httpx

    max_retries = 3
    retry_delay = 1  # seconds
    timeout = 60  # seconds

    for retry in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.head(url, follow_redirects=True)
                if response.status_code != 200:
                    print(f"Failed to download {url}. Status code: {response.status_code}")
                    return
                size = int(response.headers.get("content-length", 0))
                mb = size / 1024 / 1024

                print(f"Downloading {mb} MB to {dest}...")
                async with client.stream("GET", url, follow_redirects=True) as response:
                    print("Status code:", response.status_code)
                    os.makedirs(os.path.dirname(dest), exist_ok=True)
                    with open(dest, "wb") as f:
                        pbar = tqdm.tqdm(
                            total=size,
                            unit="B",
                            unit_scale=True,
                            unit_divisor=1024,
                            file=stdout,
                        )
                        async for chunk in response.aiter_bytes():
                            f.write(chunk)
                            pbar.update(len(chunk))
            return
        except (httpx.HTTPStatusError, httpx.RequestError) as e:
            if retry < max_retries - 1:
                print(f"Download failed. Retrying in {retry_delay} seconds...")
                time.sleep(retry_delay)
                continue
            else:
                raise e


async def download_models(data_dir: str):
    """
    Downloads the models in parallel into the specified volumes.
    """
    print("Downloading models...")
    print(f"Data directory: {data_dir}")
    
    paths_models = [
        [os.path.join(data_dir, "models", "checkpoints"), model_files.checkpoints],
        [os.path.join(data_dir, "models", "controlnet"), model_files.controlnet],
        [os.path.join(data_dir, "models", "ipadapter"), model_files.ipadapter],
        [os.path.join(data_dir, "models", "clip_vision"), model_files.clip_vision],
        [os.path.join(data_dir, "models", "loras"), model_files.loras],
        [os.path.join(data_dir, "models", "annotator"), model_files.annotator],
        [
            os.path.join(data_dir, "models", "upscale_models"),
            model_files.upscale_models,
        ],
        [os.path.join(data_dir, "models", "style_models"), model_files.style_models],
    ]

    def file_or_url_basename(m: dict[str, str]) -> str:
        return m["file"] if "file" in m else os.path.basename(m["url"])

    paths_models = [
        (
            path,
            [(m["url"], os.path.join(path, file_or_url_basename(m))) for m in models],
        )
        for path, models in paths_models
    ]

    for _, models in paths_models:
        for url, path in models:
            if not os.path.exists(path):
                await download_file(url, path)


if __name__ == "__main__":
    import dotenv
    dotenv.load_dotenv()
    data_dir = Environment.get_comfy_folder()
    asyncio.run(download_models(data_dir))
