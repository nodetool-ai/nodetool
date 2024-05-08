from datetime import datetime
from nodetool.nodes.nodetool.input import GroupInput
from nodetool.nodes.nodetool.output import GroupOutput
from nodetool.workflows.base_node import GroupNode
from nodetool.workflows.graph import Graph
from nodetool.workflows.processing_context import ProcessingContext

from typing import Any

from nodetool.workflows.types import NodeUpdate
from nodetool.workflows.workflow_runner import WorkflowRunner


class Loop(GroupNode):
    """
    Loops over a list of items and processes the remaining nodes for each item.
    loop, itereate, repeat, for, each, batch
    """

    async def process(self, context: ProcessingContext):
        raise NotImplementedError()

    async def process_subgraph(
        self,
        context: ProcessingContext,
        runner: WorkflowRunner,
    ) -> Any:
        """
        Runs a loop node, which is a special type of node that contains a subgraph.
        The subgraph is determined by the children property of the group node.
        Each iteration of the loop will run the subgraph with the input data from the input nodes.
        The output will be collected and stored in the output nodes.
        """
        input_nodes = [n for n in self._nodes if isinstance(n, GroupInput)]
        output_nodes = [n for n in self._nodes if isinstance(n, GroupOutput)]

        if len(input_nodes) == 0:
            raise ValueError("Loop node must have at least one input node.")

        # Validate all inputs to be list
        assert all(
            isinstance(value, list) for value in self._properties.values()
        ), "Input data must be a list."

        # Get the length of the input data and check for equal length.
        lengths = [len(value) for value in self._properties.values()]
        if len(input_nodes) > 1 and len(set(lengths)) != 1:
            raise ValueError("Input data must be of equal length.")

        input_length = lengths[0]
        started_at = datetime.now()

        # Run the subgraph for each item in the input data.
        results = {node._id: [] for node in output_nodes}
        for i in range(input_length):
            sub_context = ProcessingContext(
                user_id=context.user_id,
                workflow_id=context.workflow_id,
                queue=context.message_queue,
                capabilities=context.capabilities,
            )
            # Provide the item as input to the subgraph.
            for input_node in input_nodes:
                input_node._value = self._properties[input_node.name][i]

            graph = Graph(nodes=self._nodes, edges=self._edges)
            await runner.process_graph(sub_context, graph)

            # Get the result of the subgraph and add it to the results.
            for output_node in output_nodes:
                results[output_node._id].append(output_node.input)

        for output_node in output_nodes:
            context.set_result(self._id, {output_node.name: results[output_node._id]})
            context.post_message(
                NodeUpdate(
                    node_id=output_node._id,
                    node_name=output_node.get_title(),
                    status="completed",
                    result={"output": results[output_node._id]},
                    started_at=started_at.isoformat(),
                    completed_at=datetime.now().isoformat(),
                )
            )

        # Mark the nodes as processed.
        for n in self._nodes:
            context.processed_nodes.add(n._id)
