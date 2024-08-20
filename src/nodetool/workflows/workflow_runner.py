import asyncio
from contextlib import contextmanager
from datetime import datetime
from typing import Dict, Any, Optional
from functools import lru_cache

from pydantic import BaseModel
import torch

from nodetool.metadata.types import DataframeRef
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.types.graph import Edge
from nodetool.types.job import JobUpdate, JobCancelledException
from nodetool.nodes.nodetool.input import GroupInput
from nodetool.workflows.base_node import GroupNode, BaseNode
from nodetool.workflows.types import NodeProgress, NodeUpdate
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.common.environment import Environment
from nodetool.workflows.graph import Graph
import time
import random
from nodetool.common.environment import Environment

log = Environment.get_logger()

MAX_RETRIES = 5
BASE_DELAY = 1  # seconds
MAX_DELAY = 60  # seconds


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
        is_cancelled (bool): Flag indicating whether the job has been manually cancelled.
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
        self.is_cancelled = False
        self.current_node: Optional[str] = None
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

        Post-conditions:
            - Sets status to "cancelled".
            - Sets is_cancelled to True.

        Note:
            This method does not immediately stop execution. The cancellation is checked
            and acted upon at specific points during the workflow execution.
        """
        self.status = "cancelled"
        self.is_cancelled = True
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

        with self.torch_context(context):
            try:
                await self.validate_graph(context, graph)
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
                for node in graph.nodes:
                    await node.finalize(context)
                torch.cuda.empty_cache()

        if self.is_cancelled or context.is_cancelled:
            log.info("Job cancelled")
            context.post_message(JobUpdate(job_id=self.job_id, status="cancelled"))
            self.status = "cancelled"
            return

        output = {
            node.name: context.get_result(node._id, "output") for node in output_nodes
        }

        context.post_message(
            JobUpdate(job_id=self.job_id, status="completed", result=output)
        )

        self.status = "completed"

    async def validate_graph(self, context: ProcessingContext, graph: Graph):
        """
        Validates the graph by checking nodes for missing input values.

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
            raise ValueError("Graph contains errors")

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
                await node.initialize(context)
            except Exception as e:
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
        sorted_nodes = graph.topological_sort(parent_id)

        for level in sorted_nodes:
            nodes = [graph.find_node(i) for i in level if i]
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
        if self.is_cancelled or context.is_cancelled:
            return

        self.current_node = node._id

        # Skip nodes that have already been processed in a subgraph.
        if node._id in context.processed_nodes:
            return

        retries = 0

        while retries < MAX_RETRIES:
            try:
                if isinstance(node, GroupNode):
                    await self.run_group_node(node, context)
                else:
                    await self.process_regular_node(context, node)
                break  # If successful, break the retry loop
            except torch.cuda.OutOfMemoryError as e:
                from comfy.model_management import current_loaded_models

                retries += 1
                vram_before_cleanup = get_available_vram()

                for model in current_loaded_models:
                    model.model_unload()

                torch.cuda.empty_cache()
                additional_vram = vram_before_cleanup - get_available_vram()

                if additional_vram <= 0:
                    log.warning(
                        f"No additional VRAM available. Stopping retries for node {node._id}."
                    )
                    raise  # Re-raise the exception if no more VRAM is available

                if retries >= MAX_RETRIES:
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
        group_inputs = context.get_node_inputs(group_node._id)

        result = await self.process_subgraph(context, group_node, group_inputs)

        context.processed_nodes.add(group_node._id)
        context.set_result(group_node._id, result)

    async def process_regular_node(self, context: ProcessingContext, node: BaseNode):
        """
        Processes a regular (non-GroupNode) node in the workflow.

        Args:
            context (ProcessingContext): Manages the execution state and inter-node communication.
            node (BaseNode): The node to be processed.

        Raises:
            Exception: Any exception raised during node processing is caught and reported.

        Post-conditions:
            - Node inputs are collected and assigned.
            - Node is processed.
            - Node output is converted.
            - Node result is cached if applicable.
            - Node status updates are posted to the context.
            - Node is marked as processed in the context.

        Note:
            - Handles result caching and retrieval.
            - Manages timing information for node execution.
            - Prepares and posts detailed node updates including properties and results.
        """
        started_at = datetime.now()

        try:
            inputs = context.get_node_inputs(node.id)

            for name, value in inputs.items():
                try:
                    node.assign_property(name, value)
                except Exception as e:
                    log.warn(f"Error assigning property {name} to node {node.id}: {e}")

            await node.pre_process(context)

            if node.is_cacheable():
                cached_result = context.get_cached_result(node)
            else:
                cached_result = None

            if cached_result is not None:
                result = cached_result
            else:
                node.send_update(context, "running")
                await node.move_to_device(self.device)
                result = await node.process(context)
                result = await node.convert_output(context, result)

                # in the future, we will have a better way to handle this
                await node.move_to_device("cpu")

                if node.is_cacheable():
                    context.cache_result(node, result)

            node.send_update(context, "completed", result)

        except Exception as e:
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
        child_nodes = [
            node for node in context.graph.nodes if node.parent_id == group_node._id
        ]
        input_nodes = [n for n in child_nodes if isinstance(n, GroupInput)]
        output_nodes = [n for n in child_nodes if isinstance(n, GroupOutput)]

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
            # passing global graph for lookups
            sub_context = ProcessingContext(
                graph=context.graph,
                results=context.results.copy(),
                user_id=context.user_id,
                auth_token=context.auth_token,
                workflow_id=context.workflow_id,
                message_queue=context.message_queue,
            )
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
            print("warning: multiple output nodes not supported")

        if len(results) == 0:
            return {}
        else:
            return {"output": results[output_nodes[0]._id]}

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

        log.info(
            f"VRAM before workflow: {torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024}"
        )
        with torch.inference_mode():
            try:
                yield
            finally:
                if torch.cuda.is_available():
                    import comfy.model_management

                    comfy.model_management.cleanup_models()
                    torch.cuda.empty_cache()
                    log.info(
                        f"VRAM after workflow: {torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024}"
                    )
