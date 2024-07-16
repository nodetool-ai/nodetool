from nodetool.api.server import create_app

import nodetool.nodes.anthropic
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama

app = create_app()
