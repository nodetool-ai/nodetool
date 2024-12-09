from pydantic import BaseModel, Field
import psutil
import torch


class SystemStats(BaseModel):
    cpu_percent: float = Field(..., description="CPU usage percentage")
    memory_total_gb: float = Field(..., description="Total memory in GB")
    memory_used_gb: float = Field(..., description="Used memory in GB")
    memory_percent: float = Field(..., description="Memory usage percentage")
    vram_total_gb: float | None = Field(None, description="Total VRAM in GB")
    vram_used_gb: float | None = Field(None, description="Used VRAM in GB")
    vram_percent: float | None = Field(None, description="VRAM usage percentage")


def get_system_stats() -> SystemStats:
    # CPU usage
    cpu_percent = psutil.cpu_percent(interval=1)

    # Memory usage
    memory = psutil.virtual_memory()
    memory_total = memory.total / (1024**3)  # Convert to GB
    memory_used = memory.used / (1024**3)  # Convert to GB
    memory_percent = memory.percent

    # VRAM usage (if GPU is available)
    vram_total = vram_used = vram_percent = None
    if torch.cuda.is_available():
        vram_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        vram_used = torch.cuda.memory_allocated(0) / (1024**3)
        vram_percent = (vram_used / vram_total) * 100

    return SystemStats(
        cpu_percent=cpu_percent,
        memory_total_gb=round(memory_total, 2),
        memory_used_gb=round(memory_used, 2),
        memory_percent=memory_percent,
        vram_total_gb=round(vram_total, 2) if vram_total is not None else None,
        vram_used_gb=round(vram_used, 2) if vram_used is not None else None,
        vram_percent=round(vram_percent, 2) if vram_percent is not None else None,
    )
