from pydantic import BaseModel
from huggingface_hub import HfFileSystem


class HFFileInfo(BaseModel):
    size: int
    repo_id: str
    path: str


class HFFileRequest(BaseModel):
    repo_id: str
    path: str


def get_huggingface_file_infos(requests: list[HFFileRequest]) -> list[HFFileInfo]:
    fs = HfFileSystem()
    file_infos = []

    for request in requests:
        file_info = fs.info(f"{request.repo_id}/{request.path}")
        file_infos.append(
            HFFileInfo(
                size=file_info["size"],
                repo_id=request.repo_id,
                path=request.path,
            )
        )

    return file_infos
