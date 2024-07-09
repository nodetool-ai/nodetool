import asyncio
from contextlib import contextmanager
from datetime import datetime
import json
from typing import Dict, Any, Optional
from functools import lru_cache

from pydantic import BaseModel

from nodetool.metadata.types import DataframeRef
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.types.graph import Edge
from nodetool.types.job import JobUpdate, JobCancelledException
from nodetool.nodes.nodetool.input import GroupInput
from nodetool.workflows.base_node import GroupNode, BaseNode
from nodetool.workflows.types import NodeProgress, NodeUpdate
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import requires_capabilities_from_request
from nodetool.common.environment import Environment
from nodetool.workflows.graph import Graph

log = Environment.get_logger()


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
        - GPU-intensive workflows are automatically directed to workers with GPU capabilities when available.
        - The class relies on an external ProcessingContext for managing execution state and inter-node communication.
    """

    def __init__(self, job_id: str):
        """
        Initializes a new WorkflowRunner instance.

        Args:
            job_id (str): Unique identifier for this workflow execution.

        Post-conditions:
            - Sets initial status to "running".
            - Initializes is_cancelled to False.
            - Sets current_node to None.
        """
        self.job_id = job_id
        self.status = "running"
        self.is_cancelled = False
        self.current_node: Optional[str] = None

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

        graph_capabilities = requires_capabilities_from_request(req)

        graph = Graph.from_dict(
            {
                "nodes": [node.model_dump() for node in req.graph.nodes],
                "edges": [edge.model_dump() for edge in req.graph.edges],
            }
        )
        context.graph = graph

        input_nodes = {node.name: node for node in graph.inputs()}
        output_nodes = graph.outputs()

        if req.params:
            for key, value in req.params.items():
                if key not in input_nodes:
                    raise ValueError(f"No input node found for param: {key}")

                node = input_nodes[key]
                node.assign_property("value", value)

        with self.torch_capabilities(graph_capabilities, context):
            await self.process_graph(context, graph)

        if self.is_cancelled:
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
        if self.is_cancelled:
            return

        self.current_node = node._id

        # Skip nodes that have already been processed in a sub graph.
        if node._id in context.processed_nodes:
            return

        try:
            # If the node is a loop node, run the loop node, which will process the subgraph.
            if isinstance(node, GroupNode):
                await self.run_group_node(node, context)
            else:
                await self.process_regular_node(context, node)
        except JobCancelledException:
            self.cancel()

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
            - Node is pre-processed, processed, and its output is converted.
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
                node.assign_property(name, value)

            await node.pre_process(context)

            if isinstance(node, GroupInput) or isinstance(node, GroupNode):
                cached_result = None
            else:
                cached_result = context.get_cached_result(node)

            if cached_result is not None:
                result = cached_result
            else:
                context.post_message(
                    NodeUpdate(
                        node_id=node.id,
                        node_name=node.get_title(),
                        properties=node.node_properties(),
                        status="running",
                        started_at=started_at.isoformat(),
                    )
                )

                result = await node.process(context)
                result = await node.convert_output(context, result)

                context.cache_result(node, result)

            res_for_update = self.prepare_result_for_update(result, node)

            context.post_message(
                NodeUpdate(
                    node_id=node._id,
                    node_name=node.get_title(),
                    properties=node.node_properties(),
                    status="completed",
                    result=res_for_update,
                    started_at=started_at.isoformat(),
                    completed_at=datetime.now().isoformat(),
                )
            )

        except Exception as e:
            context.post_message(
                NodeUpdate(
                    node_id=node.id,
                    node_name=node.get_title(),
                    status="error",
                    error=str(e)[:1000],
                    started_at=started_at.isoformat(),
                    completed_at=datetime.now().isoformat(),
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

        print("output_nodes", output_nodes)

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
        else:
            raise ValueError("Input data must be a list or dataframe.")

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
                queue=context.message_queue,
                capabilities=context.capabilities,
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

    @staticmethod
    def prepare_result_for_update(
        result: Dict[str, Any], node: BaseNode
    ) -> Dict[str, Any]:
        """
        Prepares the node result for inclusion in a NodeUpdate message.

        Args:
            result (Dict[str, Any]): The raw result from node processing.
            node (BaseNode): The node that produced the result.

        Returns:
            Dict[str, Any]: A modified version of the result suitable for status updates.

        Note:
            - Removes ComfyUI-specific types from the result.
            - Converts Pydantic models in the result to dictionaries.
        """
        res_for_update = result.copy()

        for o in node.outputs():
            if o.type.is_comfy_type():
                del res_for_update[o.name]
            if isinstance(res_for_update.get(o.name), BaseModel):
                res_for_update[o.name] = res_for_update[o.name].model_dump()

        return res_for_update

    @contextmanager
    def torch_capabilities(self, capabilities: list[str], context: ProcessingContext):
        """
        Context manager for handling GPU-related capabilities, specifically for ComfyUI nodes.

        Args:
            capabilities (list[str]): List of required capabilities for the workflow.
            context (ProcessingContext): Manages the execution state and inter-node communication.

        Raises:
            ValueError: If ComfyUI nodes are required but not supported in the current environment.

        Note:
            - Sets up progress tracking hooks for ComfyUI operations.
            - Manages CUDA memory and PyTorch inference mode.
            - Cleans up models and CUDA cache after execution.
        """
        if "comfy" in capabilities:
            if "comfy" not in context.capabilities:
                raise ValueError("Comfy nodes are not supported in this environment")

            import comfy.model_management
            import comfy.utils
            import torch

            def hook(value, total, preview_image):
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

            # comfy.model_management.unload_all_models()
            log.info(f"VRAM: {torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024}")
            with torch.inference_mode():
                comfy.model_management.cleanup_models()
                yield
                # gc.collect()
                # comfy.model_management.soft_empty_cache()
                log.info(f"VRAM: {torch.cuda.memory_allocated(0) / 1024 / 1024 / 1024}")

        else:
            yield
