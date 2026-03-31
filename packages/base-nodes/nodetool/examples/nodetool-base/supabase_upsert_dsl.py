"""
Supabase Upsert DSL Example

Demonstrates inserting or updating rows with ON CONFLICT.

Requirements:
- NODE_SUPABASE_URL and NODE_SUPABASE_KEY set
- Table exists with a unique key/PK referenced by `on_conflict`
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.lib.supabase import Upsert


upsert = Upsert(
    table_name="todos",
    records=[
        {"id": 1001, "title": "Buy milk", "done": False},
        {"id": 1002, "title": "Read a book", "done": True},
    ],
    on_conflict="id",
    return_rows=True,
)

out = Output(name="upsert_result", value=upsert)
graph = create_graph(out)


if __name__ == "__main__":
    result = run_graph(graph)
    print("Upsert result:")
    print(result["upsert_result"])  # list of rows
