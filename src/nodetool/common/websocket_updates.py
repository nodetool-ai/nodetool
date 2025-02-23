from fastapi import WebSocket
import asyncio
from typing import Literal, Set

from pydantic import BaseModel

from nodetool.common.environment import Environment
from nodetool.common.system_stats import SystemStats
from nodetool.types.workflow import Workflow
from nodetool.common.system_stats import get_system_stats


class SystemStatsUpdate(BaseModel):
    type: Literal["system_stats"] = "system_stats"
    stats: SystemStats


WebSocketUpdate = SystemStatsUpdate


class WebSocketUpdates:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self.log = Environment.get_logger()
        self.log.info("WebSocketUpdates: instance initialized")
        self._stats_task = None

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
            self.log.info(
                f"WebSocketUpdates: New connection accepted. Total: {len(self.active_connections)}"
            )
            # Start stats broadcasting if this is the first connection
            if len(self.active_connections) == 1:
                await self._start_stats_broadcast()

    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            self.active_connections.remove(websocket)
            self.log.info(
                f"WebSocketUpdates: disconnected. Remaining: {len(self.active_connections)}"
            )
            # Stop stats broadcasting if no connections remain
            if len(self.active_connections) == 0:
                await self._stop_stats_broadcast()

    async def _start_stats_broadcast(self):
        if self._stats_task is None:
            self._stats_task = asyncio.create_task(self._broadcast_stats())
            self.log.info("WebSocketUpdates: Started system stats broadcasting")

    async def _stop_stats_broadcast(self):
        if self._stats_task:
            self._stats_task.cancel()
            self._stats_task = None
            self.log.info("WebSocketUpdates: Stopped system stats broadcasting")

    async def _broadcast_stats(self):
        while True:
            try:
                stats = get_system_stats()
                await self.broadcast_update(SystemStatsUpdate(stats=stats))
                await asyncio.sleep(1)  # Wait for 1 second
            except asyncio.CancelledError:
                break
            except Exception as e:
                self.log.error(f"WebSocketUpdates: Error broadcasting stats: {str(e)}")
                await asyncio.sleep(1)  # Wait before retrying

    async def broadcast_update(self, update: WebSocketUpdate):
        """Broadcast any update to all connected clients"""
        json_message = update.model_dump_json()

        async with self._lock:
            for websocket in self.active_connections:
                await websocket.send_text(json_message)
                self.log.debug(f"WebSocketUpdates: Successfully sent message to client")

    async def handle_client(self, websocket: WebSocket):
        client_id = id(websocket)  # Use websocket id for tracking
        self.log.info(
            f"WebSocketUpdates: New client connection handler started (ID: {client_id})"
        )

        await self.connect(websocket)
        try:
            while True:
                message = await websocket.receive_text()
                self.log.debug(
                    f"WebSocketUpdates: Received message from client {client_id}: {message[:100]}..."
                )
        except Exception as e:
            self.log.error(
                f"WebSocketUpdates: Client connection error (ID: {client_id}): {str(e)}"
            )
            await self.disconnect(websocket)


# Global singleton instance
websocket_updates = WebSocketUpdates()
