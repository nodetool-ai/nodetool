import pytest
import numpy as np
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    AudioRef,
    DataframeRef,
    ImageRef,
    VideoRef,
    JSONRef,
    DocumentRef,
    Date as DateType,
    Datetime as DatetimeType,
)
from nodetool.nodes.nodetool.constant import (
    Audio,
    Bool,
    DataFrame,
    Dict,
    Image,
    Integer,
    List,
    Float,
    String,
    Video,
    JSON,
    Document,
    Date,
    DateTime,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node_class",
    [
        Audio,
        Bool,
        DataFrame,
        Dict,
        Image,
        Integer,
        List,
        Float,
        String,
        Video,
        JSON,
        Document,
        Date,
        DateTime,
    ],
)
async def test_constant_node(context: ProcessingContext, node_class):
    # Create the node with default values
    node = node_class()

    try:
        result = await node.process(context)
        assert result is not None, f"{node_class.__name__} returned None"

        # Additional type checks based on the expected return type
        if node_class == Audio:
            assert isinstance(result, AudioRef)
        elif node_class == Bool:
            assert isinstance(result, bool)
        elif node_class == DataFrame:
            assert isinstance(result, DataframeRef)
        elif node_class == Dict:
            assert isinstance(result, dict)
        elif node_class == Image:
            assert isinstance(result, ImageRef)
        elif node_class == Integer:
            assert isinstance(result, int)
        elif node_class == List:
            assert isinstance(result, list)
        elif node_class == Float:
            assert isinstance(result, float)
        elif node_class == String:
            assert isinstance(result, str)
        elif node_class == Video:
            assert isinstance(result, VideoRef)
        elif node_class == JSON:
            assert isinstance(result, JSONRef)
        elif node_class == Document:
            assert isinstance(result, DocumentRef)
        elif node_class == Date:
            assert isinstance(result, DateType)
        elif node_class == DateTime:
            assert isinstance(result, DatetimeType)

    except Exception as e:
        pytest.fail(f"Error processing {node_class.__name__}: {str(e)}")
