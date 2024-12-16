import json
from enum import Enum
from nodetool.workflows.base_node import get_registered_node_classes

import nodetool.nodes.aime
import nodetool.nodes.anthropic
import nodetool.nodes.chroma
import nodetool.nodes.comfy
import nodetool.nodes.huggingface
import nodetool.nodes.nodetool
import nodetool.nodes.openai
import nodetool.nodes.replicate
import nodetool.nodes.ollama
import nodetool.nodes.luma
import nodetool.nodes.kling

import comfy.cli_args
import comfy.model_management
import comfy.utils
from nodes import init_extra_nodes

comfy.cli_args.args.force_fp16 = True

init_extra_nodes()


class EnumEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, Enum):
            return obj.value
        return super().default(obj)


# write metadata to src/nodetool/metadata/nodes.json
with open("src/nodetool/metadata/nodes.json", "w") as f:
    json.dump(
        [
            node_class.metadata().model_dump()
            for node_class in get_registered_node_classes()
        ],
        f,
        cls=EnumEncoder,
        indent=2,
    )
