import asyncio
from contextlib import contextmanager
from datetime import datetime
import gc
from typing import Any, Optional
from collections import deque

import torch

from nodetool.metadata.types import DataframeRef
from nodetool.model_manager import ModelManager
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.types.job import JobUpdate, JobCancelledException
from nodetool.nodes.nodetool.input import ChatInput, GroupInput
from nodetool.workflows.base_node import GroupNode, BaseNode
from nodetool.workflows.types import NodeProgress, NodeUpdate
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.common.environment import Environment
from nodetool.workflows.graph import Graph
import random
from nodetool.common.environment import Environment

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
    if torch.cuda.is_available():
        return torch.cuda.get_device_properties(
            0
        ).total_memory - torch.cuda.memory_allocated(0)
    return 0  # Return 0 if CUDA is not available


class WorkflowRunner:
    """
    Executes a directed acyclic graph (DAG) of computational nodes with parallel processing and result caching.

    Key Features:
    1. Topological Execution: Processes nodes in an order that respects their dependencies.
    2. Parallel Processing: Executes independent nodes concurrently within each topological level.
    3. Result Caching: Stores and retrieves node outputs to optimize repeated executions.
    4. Special Node Handling: Supports both regular nodes and GroupNodes (e.g., loop nodes).
    5. Resource Management: Allocates appropriate computational resources (e.g., GPU) based on node requirements.
    6. Progress Tracking: Provides real-time updates on individual node and overall workflow status.
    7. Error Handling: Captures and reports exceptions during node execution.
    8. Cancellation Support: Allows for immediate termination of the workflow execution.

    Attributes:
        job_id (str): Unique identifier for the current workflow execution.
        status (str): Current state of the workflow. Possible values: "running", "completed", "cancelled", "error".
        current_node (Optional[str]): Identifier of the node currently being processed, or None if no node is active.

    Note:
        - This class does not handle the definition of the workflow graph. The graph must be provided externally.
        - The class relies on an external ProcessingContext for managing execution state and inter-node communication.
    """

    def __init__(self, job_id: str, device: str | None = None):
        """
        Initializes a new WorkflowRunner instance.

        Args:
            job_id (str): Unique identifier for this workflow execution.
            device (str): The device to run the workflow on.
        """
        import torch

        self.job_id = job_id
        self.status = "running"
        self.current_node: Optional[str] = None
        self.context: Optional[ProcessingContext] = None
        if device:
            self.device = device
        else:
            if torch.cuda.is_available():
                self.device = "cuda"
            elif torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"

            log.info(f"Workflow runs on device: {self.device}")

    def is_running(self) -> bool:
        """
        Checks if the workflow is currently in the running state.

        Returns:
            bool: True if the workflow status is "running", False otherwise.
        """
        return self.status == "running"

    def cancel(self) -> None:
        """
        Marks the workflow for cancellation.

        Note:
            This method does not immediately stop execution. The cancellation is checked
            and acted upon at specific points during the workflow execution.
        """
        self.status = "cancelled"
        # send node update to cancel the current node
        if self.current_node and self.context:
            self.context.post_message(
                NodeUpdate(
                    node_id=self.current_node,
                    node_name="",
                    status="cancelled",
                )
            )

    async def run(self, req: RunJobRequest, context: ProcessingContext) -> None:
        """
        Executes the entire workflow based on the provided request and context.

        Args:
            req (RunJobRequest): Contains the workflow graph and input parameters.
            context (ProcessingContext): Manages the execution state and inter-node communication.

        Raises:
            ValueError: If the graph is missing or if there's a mismatch between input parameters and graph input nodes.
            JobCancelledException: If the job is cancelled during execution.

        Post-conditions:
            - Updates workflow status to "completed", "cancelled", or "error".
            - Posts final JobUpdate message with results or cancellation status.

        Note:
            - Handles input validation, graph processing, and output collection.
            - Manages GPU resources if required by the workflow.
        """
        log.info(f"Starting workflow execution for job_id: {self.job_id}")
        assert req.graph is not None, "Graph is required"

        graph = Graph.from_dict(
            {
                "nodes": [node.model_dump() for node in req.graph.nodes],
                "edges": [edge.model_dump() for edge in req.graph.edges],
            }
        )
        self.context = context
        context.graph = graph
        context.device = self.device

        input_nodes = {node.name: node for node in graph.inputs()}
        output_nodes = graph.outputs()

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
                await self.clear_unused_models(graph)
                await self.initialize_graph(context, graph)
                await self.process_graph(context, graph)
            except torch.cuda.OutOfMemoryError as e:
                error_message = f"VRAM OOM error: {str(e)}. No additional VRAM available after retries."
                log.error(error_message)
                context.post_message(
                    JobUpdate(job_id=self.job_id, status="error", error=error_message)
                )
                self.status = "error"
            finally:
                log.info("Finalizing nodes")
                for node in graph.nodes:
                    await node.finalize(context)
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        if self.status == "cancelled":
            log.info(f"Job {self.job_id} cancelled")
            context.post_message(JobUpdate(job_id=self.job_id, status="cancelled"))
            raise JobCancelledException()

        log.info(f"Job {self.job_id} completed successfully")
        output = {
            node.name: context.get_result(node._id, "output") for node in output_nodes
        }
        context.post_message(
            JobUpdate(job_id=self.job_id, status="completed", result=output)
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
        log.info("Starting graph validation")
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
            raise ValueError("Graph contains errors")

    async def clear_unused_models(self, graph: Graph):
        """
        Clears unused models from the model manager.
        """
        log.info("Clearing unused models")
        if not Environment.is_production():
            ModelManager.clear_unused(node_ids=[node.id for node in graph.nodes])
            # run garbage collection
            gc.collect()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

    async def initialize_graph(self, context: ProcessingContext, graph: Graph):
        """
        Initializes all nodes in the graph.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            graph (Graph): The directed acyclic graph of nodes to be processed.

        Raises:
            Exception: Any exception raised during node initialization is caught and reported.
        """
        log.info("Initializing graph nodes")
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

        Raises:
            JobCancelledException: If the job is cancelled during graph processing.

        Note:
            - Uses topological sorting to determine the execution order.
            - Executes nodes at each level in parallel using asyncio.gather.
            - Checks for cancellation before processing each level.
        """
        log.info(f"Processing graph (parent_id: {parent_id})")
        sorted_nodes = graph.topological_sort(parent_id)
        for level in sorted_nodes:
            log.debug(f"Processing level: {level}")
            nodes = [graph.find_node(i) for i in level if i]
            if self.status == "cancelled":
                log.info(f"Job {self.job_id} cancelled")
                context.post_message(JobUpdate(job_id=self.job_id, status="cancelled"))
                raise JobCancelledException()
            await asyncio.gather(
                *[self.process_node(context, node) for node in nodes if node]
            )

    async def process_node(self, context: ProcessingContext, node: BaseNode):
        """
        Processes a single node in the workflow graph.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            node (BaseNode): The node to be processed.

        Raises:
            JobCancelledException: If the job is cancelled during node processing.

        Note:
            - Skips nodes that have already been processed in a subgraph.
            - Handles special processing for GroupNodes.
            - Posts node status updates (running, completed, error) to the context.
        """
        log.info(f"Processing node: {node.get_title()} ({node._id})")
        if self.status == "cancelled":
            log.info(f"Job {self.job_id} cancelled")
            context.post_message(JobUpdate(job_id=self.job_id, status="cancelled"))
            raise JobCancelledException()

        self.current_node = node._id

        if node._id in context.processed_nodes:
            log.info(
                f"Node {node.get_title()} ({node._id}) already processed, skipping"
            )
            return

        retries = 0

        while retries < MAX_RETRIES:
            try:
                if isinstance(node, GroupNode):
                    await self.run_group_node(node, context)
                else:
                    await self.process_regular_node(context, node)
                break
            except torch.cuda.OutOfMemoryError as e:
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

                    from comfy.model_management import current_loaded_models

                    for model in current_loaded_models:
                        model.model_unload()

                    torch.cuda.empty_cache()
                    torch.cuda.synchronize()
                    additional_vram = vram_before_cleanup - get_available_vram()
                    log.error(f"VRAM after cleanup: {get_available_vram()} GB")
                    if retries >= MAX_RETRIES:
                        raise
                else:
                    raise

                # Calculate delay with exponential backoff and jitter
                delay = min(
                    BASE_DELAY * (2 ** (retries - 1)) + random.uniform(0, 1), MAX_DELAY
                )

                log.warning(
                    f"VRAM OOM encountered for node {node._id}. Additional {additional_vram} VRAM available. Retrying in {delay:.2f} seconds. (Attempt {retries}/{MAX_RETRIES})"
                )

                await asyncio.sleep(delay)
            except JobCancelledException:
                log.info(f"Job cancelled during processing of node {node._id}")
                self.cancel()
                break

    async def run_group_node(self, group_node: GroupNode, context: ProcessingContext):
        """
        Executes a GroupNode, which represents a subgraph within the main workflow.

        Args:
            group_node (GroupNode): The GroupNode to be executed.
            context (ProcessingContext): Manages the execution state and inter-node communication.

        Post-conditions:
            - Processes the subgraph contained within the GroupNode.
            - Stores the result of the GroupNode execution in the context.
            - Marks the GroupNode as processed in the context.

        Note:
            - Retrieves inputs for the GroupNode from the context.
            - Calls process_subgraph to handle the execution of the subgraph.
        """
        log.info(f"Running group node: {group_node.get_title()} ({group_node._id})")
        group_inputs = context.get_node_inputs(group_node._id)

        result = await self.process_subgraph(context, group_node, group_inputs)

        context.processed_nodes.add(group_node._id)
        context.set_result(group_node._id, result)

    async def process_regular_node(self, context: ProcessingContext, node: BaseNode):
        """
        Process a regular node that is not a GroupNode.

        Args:
            context (ProcessingContext): The processing context.
            node (BaseNode): The node to process.
        """
        from datetime import datetime

        started_at = datetime.now()
        try:
            # Get inputs for the node
            inputs = context.get_node_inputs(node.id)
            log.debug(f"{node.get_title()} ({node._id}) inputs: {inputs}")

            # Assign input values to node properties
            for name, value in inputs.items():
                try:
                    node.assign_property(name, value)
                except Exception as e:
                    log.warn(f"Error assigning property {name} to node {node.id}: {e}")

            # Preprocess the node
            log.debug(f"Pre-processing node: {node.get_title()} ({node._id})")
            await node.pre_process(context)

            node.send_update(
                context, "running", result=None, properties=list(inputs.keys())
            )

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

                if requires_gpu and self.device != "cpu":
                    # Acquire the global GPU lock
                    log.debug(f"Node {node.get_title()} ({node._id}) requires GPU")
                    await acquire_gpu_lock(node, context)
                    try:
                        log.info(
                            f"Node {node.get_title()} ({node._id}) starts processing with GPU"
                        )
                        # Move node model to GPU
                        await node.move_to_device(self.device)
                        self.log_vram_usage(
                            f"Node {node.get_title()} ({node._id}) VRAM after move to {self.device}"
                        )

                        # Process the node
                        result = await node.process_with_gpu(context)
                        result = await node.convert_output(context, result)

                    finally:
                        try:
                            # Move node model back to CPU
                            await node.move_to_device("cpu")
                            self.log_vram_usage(
                                f"Node {node.get_title()} ({node._id}) VRAM after move to cpu"
                            )
                        finally:
                            # Release the GPU lock
                            release_gpu_lock()
                            log.debug(
                                f"Node {node.get_title()} ({node._id}) released GPU lock"
                            )
                else:
                    # Process the node without GPU
                    log.info(
                        f"Node {node.get_title()} ({node._id}) processing without GPU"
                    )
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

        context.processed_nodes.add(node._id)
        context.set_result(node._id, result)
        log.info(
            f"{node.get_title()} ({node._id}) processing time: {datetime.now() - started_at}"
        )

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

            # Mark the nodes as processed.
            for n in child_nodes:
                context.processed_nodes.add(n._id)

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
        if torch.cuda.is_available():
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
        log.info("Entering torch context")
        import comfy
        import comfy.utils

        def hook(value, total, preview_image):
            if torch.cuda.is_available():
                import comfy.model_management

                comfy.model_management.throw_exception_if_processing_interrupted()
            context.post_message(
                NodeProgress(
                    node_id=self.current_node or "",
                    progress=value,
                    total=total,
                    # preview_image=self.encode_image(preview_image),
                )
            )

        comfy.utils.set_progress_bar_global_hook(hook)

        if torch.cuda.is_available():
            self.log_vram_usage("Before workflow")
        try:
            yield
        finally:
            if torch.cuda.is_available():
                self.log_vram_usage("After workflow")

        log.info("Exiting torch context")
