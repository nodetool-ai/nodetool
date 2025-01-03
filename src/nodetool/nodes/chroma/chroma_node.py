from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    AssetRef,
    ImageRef,
    TextRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ChromaNode(BaseNode):
    @classmethod
    def is_cacheable(cls):
        return False

    @classmethod
    def is_visible(cls):
        return cls is not ChromaNode

    async def load_results(
        self, context: ProcessingContext, ids: list[str]
    ) -> list[AssetRef]:
        asset_refs = []
        for id in ids:
            asset = await context.find_asset(str(id))
            if asset.content_type.startswith("image"):
                ref = ImageRef(asset_id=asset.id)
                asset_refs.append(ref)
            if asset.content_type.startswith("text"):
                ref = TextRef(asset_id=asset.id)
                asset_refs.append(ref)
        return asset_refs
