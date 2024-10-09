import httpx
import time
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import asyncio
import base64
import json
import hmac
import hashlib


class TaskStatus(str, Enum):
    SUBMITTED = "submitted"
    PROCESSING = "processing"
    SUCCEED = "succeed"
    FAILED = "failed"


class BaseRequest(BaseModel):
    model: Optional[str] = None
    callback_url: Optional[str] = None


class BaseResponse(BaseModel):
    code: int
    message: str
    request_id: str


class ImageResult(BaseModel):
    index: int
    url: str


class VideoResult(BaseModel):
    id: str
    url: str
    duration: str


class TaskResult(BaseModel):
    images: Optional[List[ImageResult]] = None
    videos: Optional[List[VideoResult]] = None


class TaskData(BaseModel):
    task_id: str
    task_status: TaskStatus
    task_status_msg: Optional[str] = None
    created_at: int
    updated_at: int
    task_result: Optional[TaskResult] = None


class TaskResponse(BaseResponse):
    data: TaskData


class ImageGenerationRequest(BaseRequest):
    prompt: str
    negative_prompt: Optional[str] = None
    image: Optional[str] = None
    image_fidelity: Optional[float] = Field(None, ge=0, le=1)
    n: Optional[int] = Field(None, ge=1, le=9)
    aspect_ratio: Optional[str] = None


class VideoGenerationRequest(BaseRequest):
    prompt: str
    negative_prompt: Optional[str] = None
    cfg_scale: Optional[float] = Field(None, ge=0, le=1)
    mode: Optional[str] = None
    camera_control: Optional[Dict[str, Any]] = None
    aspect_ratio: Optional[str] = None
    duration: Optional[str] = None


class ImageToVideoRequest(BaseRequest):
    image: str
    image_tail: Optional[str] = None
    prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    cfg_scale: Optional[float] = Field(None, ge=0, le=1)
    mode: Optional[str] = None
    duration: Optional[str] = None


class VirtualTryOnRequest(BaseRequest):
    human_image: str
    cloth_image: Optional[str] = None


class KlingAIAPI:
    def __init__(
        self,
        access_key: str,
        secret_key: str,
        base_url: str = "https://api.klingai.com",
    ):
        self.access_key = access_key
        self.secret_key = secret_key
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    def _generate_token(self) -> str:
        payload = {
            "iss": self.access_key,
            "exp": int(time.time()) + 1800,
            "nbf": int(time.time()) - 5,
        }
        header = {"alg": "HS256", "typ": "JWT"}

        # Encode header and payload
        header_encoded = base64.urlsafe_b64encode(json.dumps(header).encode()).rstrip(
            b"="
        )
        payload_encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(
            b"="
        )

        # Create signature
        message = f"{header_encoded.decode()}.{payload_encoded.decode()}"
        signature = hmac.new(self.secret_key.encode(), message.encode(), hashlib.sha256)
        signature_encoded = base64.urlsafe_b64encode(signature.digest()).rstrip(b"=")

        # Combine all parts
        return f"{message}.{signature_encoded.decode()}"

    async def _make_request(
        self, method: str, endpoint: str, data: Optional[Dict] = None
    ) -> Dict:
        url = f"{self.base_url}{endpoint}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._generate_token()}",
        }
        response = await self.client.request(method, url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()

    async def _poll_task(self, task_id: str, get_task_func) -> TaskResponse:
        while True:
            response: TaskResponse = await get_task_func(task_id)
            task_status = response.data.task_status
            if task_status in [TaskStatus.SUCCEED, TaskStatus.FAILED]:
                return response
            await asyncio.sleep(1)

    # Image Generation
    async def create_image_generation_task(
        self, request: ImageGenerationRequest
    ) -> TaskResponse:
        response = await self._make_request(
            "POST", "/v1/images/generations", request.model_dump()
        )
        return TaskResponse(**response)

    async def get_image_generation_task(self, task_id: str) -> TaskResponse:
        response = await self._make_request("GET", f"/v1/images/generations/{task_id}")
        return TaskResponse(**response)

    async def create_image_generation_task_and_wait(
        self, request: ImageGenerationRequest
    ) -> TaskResponse:
        task = await self.create_image_generation_task(request)
        return await self._poll_task(task.data.task_id, self.get_image_generation_task)

    # Text to Video
    async def create_text_to_video_task(
        self, request: VideoGenerationRequest
    ) -> TaskResponse:
        response = await self._make_request(
            "POST", "/v1/videos/text2video", request.model_dump()
        )
        return TaskResponse(**response)

    async def get_text_to_video_task(self, task_id: str) -> TaskResponse:
        response = await self._make_request("GET", f"/v1/videos/text2video/{task_id}")
        return TaskResponse(**response)

    async def create_text_to_video_task_and_wait(
        self, request: VideoGenerationRequest
    ) -> TaskResponse:
        task = await self.create_text_to_video_task(request)
        return await self._poll_task(task.data.task_id, self.get_text_to_video_task)

    # Image to Video
    async def create_image_to_video_task(
        self, request: ImageToVideoRequest
    ) -> TaskResponse:
        response = await self._make_request(
            "POST", "/v1/videos/image2video", request.model_dump()
        )
        return TaskResponse(**response)

    async def get_image_to_video_task(self, task_id: str) -> TaskResponse:
        response = await self._make_request("GET", f"/v1/videos/image2video/{task_id}")
        return TaskResponse(**response)

    async def create_image_to_video_task_and_wait(
        self, request: ImageToVideoRequest
    ) -> TaskResponse:
        task = await self.create_image_to_video_task(request)
        return await self._poll_task(task.data.task_id, self.get_image_to_video_task)

    # Virtual Try-on
    async def create_virtual_try_on_task(
        self, request: VirtualTryOnRequest
    ) -> TaskResponse:
        response = await self._make_request(
            "POST",
            "/v1/images/kolors-virtual-try-on",
            request.model_dump(),
        )
        return TaskResponse(**response)

    async def get_virtual_try_on_task(self, task_id: str) -> TaskResponse:
        response = await self._make_request(
            "GET", f"/v1/images/kolors-virtual-try-on/{task_id}"
        )
        return TaskResponse(**response)

    async def create_virtual_try_on_task_and_wait(
        self, request: VirtualTryOnRequest
    ) -> TaskResponse:
        task = await self.create_virtual_try_on_task(request)
        return await self._poll_task(task.data.task_id, self.get_virtual_try_on_task)

    async def close(self):
        await self.client.aclose()
