# nodetool.workflows.threaded_event_loop

## ThreadedEventLoop

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

**Tags:** 

### run_coroutine

Schedule a coroutine to run in this event loop.
**Args:**
- **coro (typing.Coroutine[typing.Any, typing.Any, ~T])**

**Returns:** Future

### run_in_executor

Run a synchronous function in the default executor of this event loop.
**Args:**
- **func (typing.Callable[..., ~T])**
- **args (typing.Any)**

**Returns:** Future

### start

Start the event loop in a separate thread.
**Args:**

**Returns:** None

### stop

Stop the event loop and wait for the thread to finish.
**Args:**

**Returns:** None

