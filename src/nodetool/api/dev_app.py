from nodetool.api.server import create_app

# in local or dev mode, import all nodes
import nodetool.nodes.anthropic
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate

app = create_app()
