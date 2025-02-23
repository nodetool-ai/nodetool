"""
Workflow execution engine for processing directed acyclic graphs (DAGs) of computational nodes.

This module provides the core workflow execution functionality, handling parallel processing,
resource management, and orchestration of computational nodes. It supports both CPU and 
GPU-based computations with automatic device selection and memory management.

Key Components:
    - WorkflowRunner: Main execution engine that processes DAGs of nodes
    - OrderedLock: GPU resource management with FIFO queuing
    - Message: Inter-node communication model

Features:
    - Parallel execution of independent nodes
    - GPU resource management with ordered locking
    - Result caching for cacheable nodes
    - Error handling and retry logic for GPU OOM situations
    - Progress tracking and status updates
    - Support for regular nodes and group nodes (subgraphs)
    - Dynamic device selection (CPU/CUDA/MPS)
    - Automatic VRAM management and cleanup

Example:
    ```python
    runner = WorkflowRunner(job_id="123")
    await runner.run(request, context)
    ```

Dependencies:
    - Optional: torch, comfy (for GPU operations)
    - Required: asyncio, pydantic, logging
"""

import asyncio
from contextlib import contextmanager
from datetime import datetime
import gc
import time
from typing import Any, Optional
from collections import deque
import random

from pydantic import BaseModel

from nodetool.metadata.type_metadata import TypeMetadata
from nodetool.metadata.types import DataframeRef
from nodetool.model_manager import ModelManager
from nodetool.nodes.nodetool.control import If
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.types.job import JobUpdate
from nodetool.nodes.nodetool.input import ChatInput, GroupInput
from nodetool.workflows.base_node import GroupNode, BaseNode
from nodetool.workflows.types import NodeProgress, NodeUpdate
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.common.environment import Environment
from nodetool.workflows.graph import Graph
from nodetool.common.environment import Environment

# Optional dependencies check
TORCH_AVAILABLE = False
COMFY_AVAILABLE = False
try:
    import torch

    TORCH_AVAILABLE = True
    try:
        import comfy
        import comfy.utils
        import comfy.model_management

        COMFY_AVAILABLE = True
    except ImportError:
        pass
except ImportError:
    pass

log = Environment.get_logger()

MAX_RETRIES = 2
BASE_DELAY = 1  # seconds
MAX_DELAY = 60  # seconds


# Define a global GPU lock
class OrderedLock:
    def __init__(self):
        self._waiters = deque()
        self._locked = False

    async def acquire(self):
        log.debug("Attempting to acquire GPU lock")
        loop = asyncio.get_running_loop()
        fut = loop.create_future()
        self._waiters.append(fut)
        try:
            if self._locked or self._waiters[0] != fut:
                log.debug("GPU lock is held or others are waiting; waiting for lock")
                await fut
            self._locked = True
            log.debug("GPU lock acquired")
        except asyncio.CancelledError:
            self._waiters.remove(fut)
            # Notify next waiter if necessary
            if self._waiters and not self._locked:
                next_fut = self._waiters[0]
                if not next_fut.done():
                    next_fut.set_result(True)
                    log.debug("Notified next waiter for GPU lock after cancellation")
            raise

    def release(self):
        log.debug("Releasing GPU lock")
        if self._locked:
            self._locked = False
            self._waiters.popleft()
            if self._waiters:
                # Notify the next waiter
                next_fut = self._waiters[0]
                if not next_fut.done():
                    next_fut.set_result(True)
                    log.debug("Notified next waiter for GPU lock")


gpu_lock = OrderedLock()


async def acquire_gpu_lock(node: BaseNode, context: ProcessingContext):
    if gpu_lock._locked or gpu_lock._waiters:
        log.debug(f"Node {node.get_title()} is waiting for GPU lock")
        # Lock is held or others are waiting; send update message
        node.send_update(context, status="waiting")
    await gpu_lock.acquire()
    log.debug(f"Node {node.get_title()} acquired GPU lock")


def release_gpu_lock():
    log.debug("Releasing GPU lock from node")
    gpu_lock.release()


def get_available_vram():
    if TORCH_AVAILABLE and torch.cuda.is_available():
        return torch.cuda.get_device_properties(
            0
        ).total_memory - torch.cuda.memory_allocated(0)
    return 0


class Message(BaseModel):
    sender: BaseNode
    target: BaseNode
    slot: str


class WorkflowRunner:
    """
    A workflow execution engine that processes directed acyclic graphs (DAGs) of computational nodes.

    The WorkflowRunner handles the execution of complex workflows by managing node dependencies,
    parallel processing, GPU resource allocation, and result caching. It supports both CPU and
    GPU-based computations, with automatic device selection based on availability.

    Key Features:
        - Parallel execution of independent nodes
        - GPU resource management with ordered locking mechanism
        - Result caching for cacheable nodes
        - Error handling and retry logic for GPU out-of-memory situations
        - Progress tracking and status updates
        - Support for both regular nodes and group nodes (subgraphs)

    Attributes:
        job_id (str): Unique identifier for the workflow execution
        status (str): Current status of the workflow ("running", "completed", "cancelled", or "error")
        current_node (Optional[str]): ID of the node currently being processed
        context (Optional[ProcessingContext]): Execution context for managing state and communication
        messages (deque[Message]): Queue of messages for inter-node communication
        device (str): Computing device to use ("cpu", "cuda", or "mps")

    Example:
        ```python
        runner = WorkflowRunner(job_id="123")
        await runner.run(request, context)
        ```
    """

    def __init__(self, job_id: str, device: str | None = None):
        """
        Initializes a new WorkflowRunner instance.

        Args:
            job_id (str): Unique identifier for this workflow execution.
            device (str): The device to run the workflow on.
        """
        self.job_id = job_id
        self.status = "running"
        self.current_node: Optional[str] = None
        self.context: Optional[ProcessingContext] = None
        self.messages: deque[Message] = deque()
        if device:
            self.device = device
        else:
            self.device = "cpu"
            if TORCH_AVAILABLE:
                if torch.cuda.is_available():
                    self.device = "cuda"
                elif (
                    hasattr(torch.backends, "mps") and torch.backends.mps.is_available()
                ):
                    self.device = "mps"

            log.info(f"Workflow runs on device: {self.device}")

    def is_running(self) -> bool:
        """
        Checks if the workflow is currently in the running state.

        Returns:
            bool: True if the workflow status is "running", False otherwise.
        """
        return self.status == "running"

    async def run(
        self,
        req: RunJobRequest,
        context: ProcessingContext,
    ):
        """
        Executes the entire workflow based on the provided request and context.

        Args:
            req (RunJobRequest): Contains the workflow graph and input parameters.
            context (ProcessingContext): Manages the execution state and inter-node communication.
        Raises:
            ValueError: If the graph is missing or if there's a mismatch between input parameters and graph input nodes.

        Post-conditions:
            - Updates workflow status to "completed", "cancelled", or "error".
            - Posts final JobUpdate message with results.

        Note:
            - Handles input validation, graph processing, and output collection.
            - Manages GPU resources if required by the workflow.
        """
        log.info(f"Starting workflow execution for job_id: {self.job_id}")

        Environment.load_settings()

        assert req.graph is not None, "Graph is required"

        graph = Graph(
            nodes=context.load_nodes(req.graph.nodes),
            edges=req.graph.edges,
        )

        self.context = context
        context.graph = graph
        context.device = self.device

        input_nodes = {node.name: node for node in graph.inputs()}
        output_nodes = graph.outputs()

        start_time = time.time()
        context.post_message(JobUpdate(job_id=self.job_id, status="running"))

        if req.params:
            for key, value in req.params.items():
                if key not in input_nodes:
                    raise ValueError(f"No input node found for param: {key}")

                node = input_nodes[key]
                node.assign_property("value", value)

        if req.messages:
            # find chat input node
            chat_input_node = next(
                (node for node in context.graph.nodes if isinstance(node, ChatInput)),
                None,
            )
            if chat_input_node is None:
                raise ValueError(
                    "Chat input node not found. Make sure you have a ChatInput node in your graph."
                )

            chat_input_node.value = req.messages

        with self.torch_context(context):
            try:
                await self.validate_graph(context, graph)
                await self.initialize_graph(context, graph)
                await self.process_graph(context, graph)
            except Exception as e:
                if TORCH_AVAILABLE and isinstance(e, torch.cuda.OutOfMemoryError):
                    error_message = f"VRAM OOM error: {str(e)}. No additional VRAM available after retries."
                    log.error(error_message)
                    context.post_message(
                        JobUpdate(
                            job_id=self.job_id, status="error", error=error_message
                        )
                    )
                    self.status = "error"
                else:
                    raise
            finally:
                log.info("Finalizing nodes")
                for node in graph.nodes:
                    await node.finalize(context)
                if TORCH_AVAILABLE and torch.cuda.is_available():
                    torch.cuda.empty_cache()

        log.info(f"Job {self.job_id} completed successfully")
        output = {
            node.name: context.get_result(node._id, "output") for node in output_nodes
        }
        total_time = time.time() - start_time
        log.info(f"Finished job {self.job_id} - Total time: {total_time:.2f} seconds")
        context.post_message(
            JobUpdate(
                job_id=self.job_id,
                status="completed",
                result=output,
                message=f"Workflow {self.job_id} completed in {total_time:.2f} seconds",
            )
        )
        self.status = "completed"

    async def validate_graph(self, context: ProcessingContext, graph: Graph):
        """
        Validates all edges in the graph.
        Validates all nodes for missing input values.
        Every edge is validated for:
        - source node has the correct output type for the target node
        - target node has the correct input type for the source node

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            graph (Graph): The directed acyclic graph of nodes to be processed.

        Raises:
            ValueError: If the graph has missing input values or contains circular dependencies.
        """
        is_valid = True

        for node in graph.nodes:
            input_edges = [edge for edge in graph.edges if edge.target == node.id]
            errors = node.validate(input_edges)
            if len(errors) > 0:
                is_valid = False
                for e in errors:
                    context.post_message(
                        NodeUpdate(
                            node_id=node.id,
                            node_name=node.get_title(),
                            status="error",
                            error=str(e),
                        )
                    )
        if not is_valid:
            raise ValueError("Graph contains errors: " + "\n".join(errors))

    async def initialize_graph(self, context: ProcessingContext, graph: Graph):
        """
        Initializes all nodes in the graph.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            graph (Graph): The directed acyclic graph of nodes to be processed.

        Raises:
            Exception: Any exception raised during node initialization is caught and reported.
        """
        for node in graph.nodes:
            try:
                log.debug(f"Initializing node: {node.get_title()} ({node.id})")
                await node.initialize(context)
            except Exception as e:
                log.error(
                    f"Error initializing node {node.get_title()} ({node.id}): {str(e)}"
                )
                context.post_message(
                    NodeUpdate(
                        node_id=node.id,
                        node_name=node.get_title(),
                        status="error",
                        error=str(e)[:1000],
                    )
                )
                raise

    async def process_graph(
        self, context: ProcessingContext, graph: Graph, parent_id: str | None = None
    ):
        """
        Processes the graph by executing nodes in topological order with parallel execution at each level.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            graph (Graph): The directed acyclic graph of nodes to be processed.
            parent_id (str | None): Identifier of the parent node, if this is a subgraph. Defaults to None.

        Note:
            - Uses topological sorting to determine the execution order.
            - Executes nodes at each level in parallel using asyncio.gather.
            - Checks for cancellation before processing each level.
        """
        log.info(f"Processing graph (parent_id: {parent_id})")

        # find all nodes that don't have any incoming edges
        nodes = [
            node
            for node in graph.nodes
            if not any(e.target == node.id for e in graph.edges)
        ]

        await asyncio.gather(*[self.process_node(context, node, {}) for node in nodes])

        while self.messages:
            message = self.messages.popleft()
            node = message.target
            inputs = context.get_node_inputs(node.id)

            # if all inputs have values, process the node
            # if not, the node will be processed when all inputs are available
            if all(inputs.values()):
                await self.process_node(context, node, inputs)

    async def process_node(
        self,
        context: ProcessingContext,
        node: BaseNode,
        inputs: dict[str, Any],
    ):
        """
        Processes a single node in the workflow graph.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            node (BaseNode): The node to be processed.
            inputs (dict[str, Any]): The inputs for the node.
        """
        log.info(f"Processing node: {node.get_title()} ({node._id})")

        self.current_node = node._id

        retries = 0

        while retries < MAX_RETRIES:
            try:
                if isinstance(node, GroupNode):
                    await self.run_group_node(node, context)
                else:
                    await self.process_node_with_inputs(context, node, inputs)
                break
            except Exception as e:
                is_cuda_oom = TORCH_AVAILABLE and isinstance(
                    e, torch.cuda.OutOfMemoryError
                )

                if is_cuda_oom:
                    log.error(
                        f"VRAM OOM error for node {node.get_title()} ({node._id}): {str(e)}"
                    )
                    retries += 1

                    if torch.cuda.is_available():
                        torch.cuda.synchronize()
                        vram_before_cleanup = get_available_vram()
                        log.error(f"VRAM before cleanup: {vram_before_cleanup} GB")

                        ModelManager.clear()
                        gc.collect()

                        if COMFY_AVAILABLE:
                            for model in comfy.model_management.current_loaded_models:
                                model.model_unload()

                        torch.cuda.empty_cache()
                        torch.cuda.synchronize()
                        additional_vram = vram_before_cleanup - get_available_vram()
                        log.error(f"VRAM after cleanup: {get_available_vram()} GB")

                    if retries >= MAX_RETRIES:
                        raise

                    delay = min(
                        BASE_DELAY * (2 ** (retries - 1)) + random.uniform(0, 1),
                        MAX_DELAY,
                    )
                    log.warning(
                        f"VRAM OOM encountered for node {node._id}. Retrying in {delay:.2f} seconds. (Attempt {retries}/{MAX_RETRIES})"
                    )
                    await asyncio.sleep(delay)
                else:
                    raise

    async def process_node_with_inputs(
        self, context: ProcessingContext, node: BaseNode, inputs: dict[str, Any]
    ):
        """
        Process a regular node that is not a GroupNode.

        Args:
            context (ProcessingContext): The processing context.
            node (BaseNode): The node to process.
            inputs (dict[str, Any]): The inputs for the node.
        """
        from datetime import datetime

        started_at = datetime.now()
        try:
            log.debug(f"{node.get_title()} ({node._id}) inputs: {inputs}")

            # Assign input values to node properties
            for name, value in inputs.items():
                try:
                    node.assign_property(name, value)
                except Exception as e:
                    log.error(f"Error assigning property {name} to node {node.id}")
                    raise ValueError(f"Error assigning property {name}: {str(e)}")

            # Preprocess the node
            log.debug(f"Pre-processing node: {node.get_title()} ({node._id})")
            await node.pre_process(context)

            # Check if the node is cacheable
            if node.is_cacheable():
                log.debug(f"Checking cache for node: {node.get_title()} ({node._id})")
                cached_result = context.get_cached_result(node)
            else:
                cached_result = None

            if cached_result is not None:
                log.info(
                    f"Using cached result for node: {node.get_title()} ({node._id})"
                )
                result = cached_result
            else:
                # Determine if the node requires GPU processing
                requires_gpu = node.requires_gpu()

                if requires_gpu and self.device == "cpu":
                    error_msg = f"Node {node.get_title()} ({node._id}) requires a GPU, but no GPU is available."
                    log.error(error_msg)
                    raise RuntimeError(error_msg)

                node.send_update(
                    context, "running", result=None, properties=list(inputs.keys())
                )

                if requires_gpu and self.device != "cpu":
                    await acquire_gpu_lock(node, context)
                    try:
                        await node.move_to_device(self.device)
                        self.log_vram_usage(
                            f"Node {node.get_title()} ({node._id}) VRAM after move to {self.device}"
                        )

                        result = await node.process_with_gpu(context)
                        result = await node.convert_output(context, result)
                    finally:
                        release_gpu_lock()
                        # try:
                        #     await node.move_to_device("cpu")
                        #     self.log_vram_usage(
                        #         f"Node {node.get_title()} ({node._id}) VRAM after move to cpu"
                        #     )
                        # finally:
                        #     release_gpu_lock()
                else:
                    result = await node.process(context)
                    result = await node.convert_output(context, result)

                # Cache the result if the node is cacheable
                if node.is_cacheable():
                    log.debug(
                        f"Caching result for node: {node.get_title()} ({node._id})"
                    )
                    context.cache_result(node, result)

            # Send completion update
            node.send_update(context, "completed", result=result)

        except Exception as e:
            import traceback

            log.error(
                f"Error processing node {node.get_title()} ({node._id}): {str(e)}"
            )
            log.error(f"Exception stack trace:\n{traceback.format_exc()}")
            context.post_message(
                NodeUpdate(
                    node_id=node.id,
                    node_name=node.get_title(),
                    status="error",
                    error=str(e)[:1000],
                )
            )
            raise

        context.set_result(node._id, result)
        for key, value in result.items():
            # find edge from node to key
            edges = context.graph.find_edges(node.id, key)
            for edge in edges:
                target = context.graph.find_node(edge.target)
                if target:
                    self.messages.append(
                        Message(sender=node, target=target, slot=edge.targetHandle)
                    )
                else:
                    log.warning(f"Node {edge.target} not found")
        log.info(
            f"{node.get_title()} ({node._id}) processing time: {datetime.now() - started_at}"
        )

    async def run_group_node(self, group_node: GroupNode, context: ProcessingContext):
        """
        Executes a GroupNode, which represents a subgraph within the main workflow.

        Args:
            group_node (GroupNode): The GroupNode to be executed.
            context (ProcessingContext): Manages the execution state and inter-node communication.
        """
        log.info(f"Running group node: {group_node.get_title()} ({group_node._id})")
        group_inputs = context.get_node_inputs(group_node._id)

        result = await self.process_subgraph(context, group_node, group_inputs)

        context.set_result(group_node._id, result)

    async def process_subgraph(
        self, context: ProcessingContext, group_node: GroupNode, inputs: dict[str, Any]
    ) -> Any:
        """
        Processes a subgraph contained within a GroupNode.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            group_node (GroupNode): The GroupNode containing the subgraph.
            inputs (dict[str, Any]): Input data for the subgraph.

        Returns:
            Any: The result of the subgraph execution.

        Raises:
            ValueError: If the GroupNode has no input nodes or if the input data is invalid.

        Note:
            - Handles special input types like DataframeRef.
            - Executes the subgraph for each item in the input data.
            - Collects and returns results from output nodes.
            - Marks all nodes in the subgraph as processed.
        """
        log.info(f"Processing subgraph for group node: {group_node._id}")
        child_nodes = [
            node for node in context.graph.nodes if node.parent_id == group_node._id
        ]
        input_nodes = [n for n in child_nodes if isinstance(n, GroupInput)]
        output_nodes = [n for n in child_nodes if isinstance(n, GroupOutput)]

        if group_node.get_node_type() == "nodetool.group.Loop":
            if len(input_nodes) == 0:
                raise ValueError("Loop node must have at least one input node.")

            input = inputs.get("input", [])

            if isinstance(input, DataframeRef):
                df = await context.dataframe_to_pandas(input)
                df_dict = df.to_dict(orient="index")
                input = []
                for index, row in df_dict.items():
                    row["index"] = index
                    input.append(row)
            elif isinstance(input, list):
                pass
            elif isinstance(input, dict):
                input = list([{"key": k, "value": v} for k, v in input.items()])
            else:
                raise ValueError(
                    f"Input data must be a list or dataframe but got: {type(input)}"
                )

            # Run the subgraph for each item in the input data.
            results = {node._id: [] for node in output_nodes}
            for i in range(len(input)):
                sub_context = context.copy()
                # passing global graph for lookups
                # set the result of the input node
                for input_node in input_nodes:
                    input_node._value = input[i]

                graph = Graph(nodes=child_nodes, edges=context.graph.edges)
                await self.process_graph(sub_context, graph, parent_id=group_node._id)

                # Get the result of the subgraph and add it to the results.
                for output_node in output_nodes:
                    results[output_node._id].append(output_node.input)

            if len(results) > 1:
                log.warning("Multiple output nodes are not fully supported.")

        else:
            # regular group nodes will execute children on top level
            results = {}

        if len(results) == 0:
            return {}
        else:
            return {"output": results[output_nodes[0]._id]}

    def log_vram_usage(self, message=""):
        if TORCH_AVAILABLE and torch.cuda.is_available():
            torch.cuda.synchronize()
            vram = torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024
            log.info(f"{message} VRAM: {vram:.2f} GB")

    @contextmanager
    def torch_context(self, context: ProcessingContext):
        """
        Context manager for handling GPU tasks.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.

        Note:
            - Sets up progress tracking hooks for ComfyUI operations.
            - Manages CUDA memory and PyTorch inference mode.
            - Cleans up models and CUDA cache after execution.
        """
        if COMFY_AVAILABLE:

            def hook(value, total, preview_image):
                if TORCH_AVAILABLE and torch.cuda.is_available():
                    comfy.model_management.throw_exception_if_processing_interrupted()
                context.post_message(
                    NodeProgress(
                        node_id=self.current_node or "",
                        progress=value,
                        total=total,
                    )
                )

            comfy.utils.set_progress_bar_global_hook(hook)

        if TORCH_AVAILABLE and torch.cuda.is_available():
            self.log_vram_usage("Before workflow")

        try:
            yield
        finally:
            if TORCH_AVAILABLE and torch.cuda.is_available():
                self.log_vram_usage("After workflow")

        log.info("Exiting torch context")
