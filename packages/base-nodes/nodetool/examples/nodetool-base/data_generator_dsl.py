"""
Data Generator DSL Example

Generate structured data using AI agents to create synthetic datasets.

Features:
- Generate synthetic data using AI models
- Use prompts to describe the data structure
- Specify columns and data types for the generated output
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.generators import DataGenerator
from nodetool.dsl.nodetool.output import Output
from nodetool.metadata.types import LanguageModel, Provider, RecordType, ColumnDef


# Define the data structure
columns = RecordType(
    columns=[
        ColumnDef(name="name", data_type="string", description=""),
        ColumnDef(name="color", data_type="string", description=""),
    ]
)

# Create data generator node
data_gen = DataGenerator(
    model=LanguageModel(
        type="language_model",
        id="gemma3:4b",
        # id="qwen3:8b",
        provider=Provider.Ollama,
    ),
    prompt="Generate a table of veggies",
    input_text="",
    max_tokens=4096,
    columns=columns,
)

# Output the generated dataframe
output = Output(
    name="dataframe_output",
    value=data_gen.out.dataframe,
)

# Create the graph
graph = create_graph(output)


if __name__ == "__main__":
    result = run_graph(graph)
    print(f"Generated data: {result['dataframe_output']}")
