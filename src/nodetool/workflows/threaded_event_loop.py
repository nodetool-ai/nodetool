import asyncio
from asyncio import AbstractEventLoop
from concurrent.futures import Future
import threading
from typing import Callable, Coroutine, Any, Optional, TypeVar


import asyncio
from typing import Any


T = TypeVar("T")


class ThreadedEventLoop:
    """
    ## Overview

    The `ThreadedEventLoop` class provides a convenient way to run an asyncio event loop in a separate thread.
    This is particularly useful for integrating asynchronous operations with synchronous code or for isolating certain async operations.

    ## Usage Examples

    ### Basic Usage

    ```python
    tel = ThreadedEventLoop()
    tel.start()

    # Run a coroutine
    async def my_coroutine():
        await asyncio.sleep(1)
        return "Hello, World!"

    future = tel.run_coroutine(my_coroutine())
    result = future.result()  # Blocks until the coroutine completes
    print(result)  # Output: Hello, World!

    tel.stop()
    ```

    ### Using as a Context Manager

    ```python
    async def my_coroutine():
        await asyncio.sleep(1)
        return "Hello, World!"

    with ThreadedEventLoop() as tel:
        future = tel.run_coroutine(my_coroutine())
        result = future.result()
        print(result)  # Output: Hello, World!
    ```

    ### Running a Synchronous Function

    ```python
    import time

    def slow_function(duration):
        time.sleep(duration)
        return f"Slept for {duration} seconds"

    with ThreadedEventLoop() as tel:
        future = tel.run_in_executor(slow_function, 2)
        result = future.result()
        print(result)  # Output: Slept for 2 seconds
    ```

    ## Thread Safety and Best Practices

    1. The `run_coroutine` and `run_in_executor` methods are thread-safe and can be called from any thread.
    2. Avoid directly accessing or modifying the internal event loop (`self._loop`) from outside the class.
    3. Always ensure that `stop()` is called when you're done with the `ThreadedEventLoop`, either explicitly or by using it as a context manager.
    4. Remember that coroutines scheduled with `run_coroutine` run in the separate thread. Be cautious about shared state and race conditions.
    5. The `ThreadedEventLoop` is designed for long-running operations. For short-lived async operations, consider using `asyncio.run()` instead.

    ## Note on Error Handling

    Errors that occur within coroutines or functions scheduled on the `ThreadedEventLoop` are captured in the returned `Future` objects. Always check for exceptions when getting results from these futures:

    ```python
    future = tel.run_coroutine(some_coroutine())
    try:
        result = future.result()
    except Exception as e:
        print(f"An error occurred: {e}")
    ```

    By following these guidelines and using the provided methods, you can safely integrate asynchronous operations into synchronous code or isolate certain async operations in a separate thread.
    """

    def __init__(self):
        self._loop: AbstractEventLoop = asyncio.new_event_loop()
        self._thread: Optional[threading.Thread] = None
        self._running: bool = False

    def start(self) -> None:
        """Start the event loop in a separate thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the event loop and wait for the thread to finish."""
        if not self._running:
            return
        self._running = False
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join()
        self._thread = None

    def _run_event_loop(self) -> None:
        """Set the event loop for this thread and run it."""
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()
        self._loop.close()

    def run_coroutine(self, coro: Coroutine[Any, Any, T]) -> Future[T]:
        """Schedule a coroutine to run in this event loop."""
        return asyncio.run_coroutine_threadsafe(coro, self._loop)  # type: ignore

    def run_in_executor(self, func: Callable[..., T], *args: Any) -> asyncio.Future[T]:
        """Run a synchronous function in the default executor of this event loop."""
        return self._loop.run_in_executor(None, func, *args)

    @property
    def is_running(self) -> bool:
        """Check if the event loop is running."""
        return self._running

    def __enter__(self) -> "ThreadedEventLoop":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()
