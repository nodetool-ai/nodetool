"""
Supabase RPC DSL Example

Calls a Postgres function via Supabase RPC and returns a DataFrame when appropriate.

Requirements:
- NODE_SUPABASE_URL and NODE_SUPABASE_KEY set
- A Postgres function available (e.g., `search_todos(term text)` returning setof rows)
"""

from nodetool.dsl.graph import create_graph, run_graph
from nodetool.dsl.nodetool.output import Output
from nodetool.dsl.lib.supabase import RPC


# Example: RPC that returns a list of rows -> to_dataframe=True
search = RPC(
    function="search_todos",
    params={"term": "book"},
    to_dataframe=True,
)

out = Output(name="rpc_df", value=search.output)
graph = create_graph(out)


if __name__ == "__main__":
    result = run_graph(graph)
    print("RPC result:")
    print(result["rpc_df"])  # DataframeRef
