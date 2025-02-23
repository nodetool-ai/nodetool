"""
System Statistics Module

This module provides functionality to collect and report system resource usage statistics,
including CPU, memory, and GPU VRAM (if available). It uses psutil for CPU and memory metrics
and pynvml for NVIDIA GPU metrics.

The module exposes:
- SystemStats: A Pydantic model representing system resource usage
- get_system_stats(): A function that collects current system statistics

Example:
    >>> stats = get_system_stats()
    >>> print(stats.cpu_percent)  # prints current CPU usage percentage
    >>> print(stats.memory_used_gb)  # prints used memory in GB
"""

from pydantic import BaseModel, Field
import psutil
import pynvml


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
    try:
        pynvml.nvmlInit()
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)  # First GPU
        info = pynvml.nvmlDeviceGetMemoryInfo(handle)

        vram_total = float(info.total) / (1024**3)  # Convert to GB
        vram_used = float(info.used) / (1024**3)
        vram_percent = (vram_used / vram_total) * 100
        pynvml.nvmlShutdown()
    except pynvml.NVMLError:
        pass  # No NVIDIA GPU available or driver issues

    return SystemStats(
        cpu_percent=cpu_percent,
        memory_total_gb=round(memory_total, 2),
        memory_used_gb=round(memory_used, 2),
        memory_percent=memory_percent,
        vram_total_gb=round(vram_total, 2) if vram_total is not None else None,
        vram_used_gb=round(vram_used, 2) if vram_used is not None else None,
        vram_percent=round(vram_percent, 2) if vram_percent is not None else None,
    )


print(get_system_stats())
