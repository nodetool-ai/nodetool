import asyncio
from datetime import datetime
from queue import Queue

from pydantic import BaseModel

from genflow.workflows.types import NodeProgress, NodeUpdate, WorkflowUpdate
from genflow.workflows.run_job_request import RunJobRequest

from genflow.workflows.processing_context import (
    ProcessingContext,
)
from genflow.workflows.genflow_node import GenflowNode
from genflow.workflows.genflow_node import get_node_class
from genflow.nodes.comfy import ComfyNode
from genflow.nodes.genflow.loop import LoopOutputNode
from genflow.common.environment import Environment
from genflow.workflows.graph import Graph, subgraph, topological_sort
from genflow.nodes.genflow.loop import LoopNode


log = Environment.get_logger()


class WorkflowRunner:
    status: str = "running"
    current_node: str | None = None

    def is_running(self):
        return self.status == "running"

    async def run(self, req: RunJobRequest, context: ProcessingContext) -> dict:
        """
        Evaluates graph nodes in topological order.

        Each level of the graph is processed in parallel.

        Output nodes are collected and returned as a dictionary.
        """
        graph = Graph.from_dict(
            {
                "nodes": [node.model_dump() for node in req.graph.nodes],
                "edges": [edge.model_dump() for edge in req.graph.edges],
            }
        )
        input_nodes = {node.name: node for node in graph.inputs()}
        output_nodes = graph.outputs()

        context.edges = graph.edges
        context.nodes = graph.nodes

        # TODO: Nodes should request capabilities
        has_comfy_nodes = False
        for node in req.graph.nodes:
            node_class = get_node_class(node.type)
            if node_class is None:
                raise ValueError("Invalid node type: " + str(node.type))
            if issubclass(node_class, ComfyNode):
                has_comfy_nodes = True
                break

        if has_comfy_nodes:
            if Environment.get_worker_url():
                return await context.run_worker(req)
            else:
                if not "comfy" in context.capabilities:
                    raise ValueError(
                        "Comfy nodes are not supported in this environment"
                    )

            import comfy.model_management
            import comfy.utils

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

        log.info("===== Run workflow ====")
        log.info("Input nodes: " + str(input_nodes))
        log.info("Output nodes: " + str(output_nodes))

        if req.params:
            for key, value in req.params.items():
                if key not in input_nodes:
                    raise ValueError("No input node found for param: " + str(key))
                node = input_nodes[key]
                node.assign_property("value", value)

        await self.process_graph(context)

        output = {}
        for node in output_nodes:
            output[node.name] = context.get_result(node.id, "output")

        log.info("Graph processing complete")
        log.info("Output: " + str(output))

        context.post_message(WorkflowUpdate(result=output))

        self.status = "completed"

        return output

    async def process_graph(self, context: ProcessingContext):
        """
        Process the graph in a topological order, executing each node in parallel.

        Args:
            context (ProcessingContext): The processing context containing the graph, edges, and nodes.

        Returns:
            None
        """
        sorted_nodes = topological_sort(context.edges, context.nodes)
        for level in sorted_nodes:
            nodes = [context.find_node(i) for i in level]
            # self.log.info("Processing level: " + str(nodes))
            await asyncio.gather(*[self.process_node(context, node) for node in nodes])

    async def process_node(self, context: ProcessingContext, node: GenflowNode):
        """
        Process a node in the workflow.
        Skip nodes that have already been processed.
        Checks for special types of nodes, such as loop nodes.

        Args:
            context (ProcessingContext): The processing context.
            node (Node): The node to be processed.

        Returns:
            None
        """

        self.current_node = node.id

        # Skip nodes that have already been processed.
        # Currently, this is used for sub graphs.
        if node.id in context.processed_nodes:
            # Inside a subgraph, we want to send the loop node update,
            # as the output will be shown for the first node in the subgraph.
            if isinstance(node, LoopNode):
                context.post_message(
                    NodeUpdate(
                        node_id=node.id,
                        status="completed",
                        result=context.results[node.id],
                        started_at=datetime.now().isoformat(),
                        completed_at=datetime.now().isoformat(),
                    )
                )
            return

        # If the node is a loop node, run the loop node, which will process the subgraph.
        if isinstance(node, LoopNode):
            await self.run_loop_node(node, context)
        else:
            await self.process_regular_node(context, node)

    async def process_regular_node(self, context: ProcessingContext, node: GenflowNode):
        """
        Processes a single node in the graph.

        This will get all the results from the input nodes and assign
        them to the properties of the node. Then the node is processed
        and the result is stored in the context's results dictionary.

        Once the node is processed, it is added to the completed_tasks set.
        """
        started_at = datetime.now()

        try:
            # Assign the input values from edges to the node properties.
            for name, value in context.get_node_inputs(node.id).items():
                node.assign_property(name, value)

            context.post_message(
                NodeUpdate(
                    node_id=node.id,
                    status="running",
                    started_at=started_at.isoformat(),
                )
            )

            result = await node.process(context)
            result = await node.convert_output(context, result)
        except Exception as e:
            context.post_message(
                NodeUpdate(
                    node_id=node.id,
                    status="error",
                    error=str(e)[:1000],
                    started_at=started_at.isoformat(),
                    completed_at=datetime.now().isoformat(),
                )
            )
            raise e
        else:
            res_for_update = result.copy()

            for o in node.outputs():
                # Comfy types are not sent to the client because they are not JSON serializable.
                if o.type.is_comfy_type():
                    del res_for_update[o.name]
                if isinstance(res_for_update.get(o.name), BaseModel):
                    res_for_update[o.name] = res_for_update[o.name].model_dump()

            # If the node is a loop output node, we don't want to send the
            # result to the client, because it will be sent by the loop node.
            if not isinstance(node, LoopOutputNode):
                context.post_message(
                    NodeUpdate(
                        node_id=node.id,
                        status="completed",
                        result=res_for_update,
                        started_at=started_at.isoformat(),
                        completed_at=datetime.now().isoformat(),
                    )
                )

        context.processed_nodes.add(node.id)
        context.set_result(node.id, result)

    async def run_loop_node(self, loop_node: LoopNode, context: ProcessingContext):
        """
        Runs a loop node, which is a special type of node that contains a subgraph.
        The subgraph is determined by the edges between the loop node and the loop output node.
        Each iteration of the loop will run the subgraph with the input data from the loop node.
        The output will be collected and stored in the loop output node, if it exists.
        Without loop output node, the loop node will only be used to generate side effects,
        such as saving images or other artifacts.

        Args:
            loop_node (LoopNode): The loop node to be executed.
            context (ProcessingContext): The processing context containing the workflow information.

        Raises:
            ValueError: If no start node is found for the loop node.
        """

        # Assign the input values from edges to the node properties.
        for name, value in context.get_node_inputs(loop_node.id).items():
            loop_node.assign_property(name, value)

        loop_output_node: LoopOutputNode | None = next(
            (n for n in context.nodes if isinstance(n, LoopOutputNode)), None
        )

        # Create a subgraph of the nodes and edges between the loop node and the loop output node.
        subgraph_edges, subgraph_nodes = subgraph(
            context.edges, context.nodes, loop_node, loop_output_node
        )

        log.info("Loop node: " + str(loop_node.id))
        log.info("Loop input: " + str(loop_node.items))
        started_at = datetime.now()

        # Run the subgraph for each item in the input data.
        results = []
        for item in loop_node.items:
            sub_context = ProcessingContext(
                user_id=context.user_id,
                workflow_id=context.workflow_id,
                edges=subgraph_edges,
                nodes=subgraph_nodes,
                queue=context.message_queue,
            )
            # Mark the loop node as processed so it doesn't get processed again.
            # We only need it to get the input data.
            sub_context.processed_nodes.add(loop_node.id)

            # Provide the item as input to the subgraph.
            sub_context.set_result(loop_node.id, {"output": item})

            await self.process_graph(sub_context)

            # Get the result of the subgraph and add it to the results.
            if loop_output_node:
                results.append(sub_context.get_result(loop_output_node.id, "output"))

        # The loop output node will have an output named "output", which should contain array of the results of the subgraph.
        if loop_output_node:
            context.set_result(loop_output_node.id, {"output": results})
            context.post_message(
                NodeUpdate(
                    node_id=loop_output_node.id,
                    status="completed",
                    result={"output": results},
                    started_at=started_at.isoformat(),
                    completed_at=datetime.now().isoformat(),
                )
            )

        # Mark the nodes as processed.
        for n in subgraph_nodes:
            context.processed_nodes.add(n.id)

        log.info("Loop results: " + str(results))
