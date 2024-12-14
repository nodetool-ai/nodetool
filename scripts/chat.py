import asyncio
import websockets
import json
import uuid
import readline
import sys


async def chat_client():
    workflow_id = input("Enter the workflow_id: ")
    uri = "ws://localhost:8000/chat"  # Adjust the URL as needed

    async with websockets.connect(uri) as websocket:
        print("Connected to chat. Type your messages (Ctrl+C to exit):")
        try:
            while True:
                user_input = input("> ")
                message = {
                    "id": str(uuid.uuid4()),
                    "role": "user",
                    "content": user_input,
                    "workflow_id": workflow_id,
                }
                await websocket.send(json.dumps(message))
                response = await websocket.recv()
                message = json.loads(response)
                print(message["content"])
        except KeyboardInterrupt:
            print("\nExiting chat...")
        finally:
            await websocket.close()


if __name__ == "__main__":
    try:
        asyncio.run(chat_client())
    except Exception as e:
        print(f"An error occurred: {e}")
    sys.exit(0)
