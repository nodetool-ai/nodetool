import json
from enum import Enum
from nodetool.workflows.base_node import (
    get_registered_node_classes,
    node_allowed_in_production,
)

import nodetool.nodes.aime
import nodetool.nodes.apple
import nodetool.nodes.anthropic
import nodetool.nodes.chroma
import nodetool.nodes.comfy
import nodetool.nodes.fal
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama
import nodetool.nodes.google
import nodetool.nodes.elevenlabs
import nodetool.nodes.lib


class EnumEncoder(json.JSONEncoder):
    def default(self, obj):
        try:
            if isinstance(obj, Enum):
                return obj.value
            return super().default(obj)
        except TypeError as e:
            raise TypeError(f"Error encoding {obj}: {e}")


node_classes = get_registered_node_classes()

# write metadata to src/nodetool/metadata/nodes.json
with open("src/nodetool/metadata/nodes.json", "w") as f:
    json.dump(
        [node_class.metadata().model_dump() for node_class in node_classes],
        f,
        cls=EnumEncoder,
        indent=2,
    )

with open("src/nodetool/metadata/nodes_production.json", "w") as f:
    json.dump(
        [
            node_class.metadata().model_dump()
            for node_class in node_classes
            if node_allowed_in_production(node_class)
        ],
        f,
        cls=EnumEncoder,
        indent=2,
    )
