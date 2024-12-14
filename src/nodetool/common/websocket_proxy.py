import asyncio
import aiohttp
from fastapi import WebSocket, WebSocketDisconnect

from nodetool.common.environment import Environment


log = Environment.get_logger()


class WebSocketProxy:
    """
    Provides a WebSocket proxy that forwards messages between a client WebSocket
    and a worker WebSocket.

    The `WebSocketProxy` class is responsible for:
    1. Accepting a client WebSocket connection
    2. Establishing a connection to a worker WebSocket
    3. Bidirectionally forwarding messages between the client and worker WebSockets
    4. Handling connection errors and disconnections gracefully

    Key features:
    - Asynchronous operation using asyncio
    - Error handling and logging
    - Automatic cleanup of resources on disconnection

    The `__call__` method is a convenience wrapper around `proxy_websocket`
    that allows the `WebSocketProxy` instance to be used as an asynchronous callable.
    This enables easy integration with FastAPI route handlers.

    Usage:
        proxy = WebSocketProxy(worker_url)
        await proxy(client_websocket)

    Args:
        client_websocket (WebSocket): The client WebSocket connection
        worker_url (str): The URL of the worker WebSocket to connect to

    Raises:
        WebSocketDisconnect: If either the client or worker WebSocket disconnects
        aiohttp.ClientError: If there's an error connecting to the worker WebSocket
    """

    def __init__(self, worker_url: str):
        self.worker_url = worker_url

    async def proxy_websocket(self, websocket: WebSocket):
        """
        Accepts a client WebSocket connection, connects to a worker WebSocket, and forwards messages between the two.

        This method ensures that the WebSocket connection is properly established and maintained,
        forwarding messages between the client and worker WebSockets.
        """
        # Accept the incoming WebSocket connection
        await websocket.accept()

        async with aiohttp.ClientSession() as session:
            # Connect to the worker WebSocket
            async with session.ws_connect(self.worker_url) as worker_ws:

                async def send_back():
                    # Continuously receive messages from the worker and forward them to the client
                    async for msg in worker_ws:
                        if msg.type == aiohttp.WSMsgType.TEXT:
                            await websocket.send_text(msg.data)
                        elif msg.type == aiohttp.WSMsgType.BINARY:
                            await websocket.send_bytes(msg.data)
                        elif msg.type == aiohttp.WSMsgType.CLOSE:
                            await websocket.close()
                        elif msg.type == aiohttp.WSMsgType.ERROR:
                            log.error("WebSocket connection closed with exception")
                            await websocket.close()
                            break

                # Create a background task to handle messages from worker to client
                send_back_task = asyncio.create_task(send_back())

                try:
                    # Main loop to receive messages from the client and forward them to the worker
                    while True:
                        message = await websocket.receive()
                        if message["type"] == "websocket.disconnect":
                            break
                        if "bytes" in message:
                            await worker_ws.send_bytes(message["bytes"])
                        elif "text" in message:
                            await worker_ws.send_str(message["text"])
                except WebSocketDisconnect:
                    # Handle client WebSocket disconnection
                    send_back_task.cancel()
                    log.info("WebSocket disconnected")
                except Exception as e:
                    # Handle any other exceptions
                    send_back_task.cancel()
                    log.error(f"WebSocket error: {str(e)}")
                    log.exception(e)
                else:
                    # Wait for the send_back_task to complete if no exceptions occurred
                    await send_back_task
                finally:
                    # Ensure the worker WebSocket is closed
                    await worker_ws.close()

    async def __call__(self, websocket: WebSocket):
        await self.proxy_websocket(websocket)
