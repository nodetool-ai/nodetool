import sys
import dotenv
import nodetool.nodes.anthropic
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama

from nodetool.models.workflow import Workflow as WorkflowModel
from nodetool.types.workflow import Workflow


dotenv.load_dotenv()

if len(sys.argv) != 2:
    print("usage: python scripts/save_example.py <workflow id>")

workflow_id = sys.argv[1]

workflow = WorkflowModel.get(workflow_id)
assert workflow is not None, "workflow not found"

json = Workflow.from_model(workflow).model_dump_json(indent=2)
filename = f"src/nodetool/workflows/examples/{workflow.name}.json"

with open(filename, "w") as f:
    f.write(json)

print(f"saved to {filename}")
