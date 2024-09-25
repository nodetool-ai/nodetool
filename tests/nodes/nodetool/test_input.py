from unittest.mock import AsyncMock
import pytest
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    AudioRef,
    ImageRef,
    TextRef,
    VideoRef,
    FolderRef,
    AssetRef,
)
from nodetool.nodes.nodetool.input import (
    FloatInput,
    BooleanInput,
    IntegerInput,
    StringInput,
    ChatInput,
    TextInput,
    ImageInput,
    VideoInput,
    AudioInput,
    Folder,
    ImageFolder,
    AudioFolder,
    VideoFolder,
    TextFolder,
    GroupInput,
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node, input_value, expected_type",
    [
        (
            FloatInput(
                label="Float",
                name="float_input",
                description="A float input",
                value=3.14,
            ),
            3.14,
            float,
        ),
        (
            BooleanInput(
                label="Boolean",
                name="bool_input",
                description="A boolean input",
                value=True,
            ),
            True,
            bool,
        ),
        (
            IntegerInput(
                label="Integer",
                name="int_input",
                description="An integer input",
                value=42,
            ),
            42,
            int,
        ),
        (
            StringInput(
                label="String",
                name="string_input",
                description="A string input",
                value="test",
            ),
            "test",
            str,
        ),
        (
            ChatInput(
                label="Chat", name="chat_input", description="A chat input", value=[]
            ),
            [],
            list,
        ),
        (
            TextInput(
                label="Text",
                name="text_input",
                description="A text input",
                value=TextRef(uri="test.txt"),
            ),
            TextRef(uri="test.txt"),
            TextRef,
        ),
        (
            ImageInput(
                label="Image",
                name="image_input",
                description="An image input",
                value=ImageRef(uri="test.jpg"),
            ),
            ImageRef(uri="test.jpg"),
            ImageRef,
        ),
        (
            VideoInput(
                label="Video",
                name="video_input",
                description="A video input",
                value=VideoRef(uri="test.mp4"),
            ),
            VideoRef(uri="test.mp4"),
            VideoRef,
        ),
        (
            AudioInput(
                label="Audio",
                name="audio_input",
                description="An audio input",
                value=AudioRef(uri="test.mp3"),
            ),
            AudioRef(uri="test.mp3"),
            AudioRef,
        ),
        (
            Folder(
                label="Folder",
                name="folder_input",
                description="A folder input",
                folder=FolderRef(asset_id="test_folder"),
            ),
            [AssetRef()],
            list,
        ),
        (
            ImageFolder(
                label="Image Folder",
                name="image_folder_input",
                description="An image folder input",
                folder=FolderRef(asset_id="test_folder"),
            ),
            [ImageRef()],
            list,
        ),
        (
            AudioFolder(
                label="Audio Folder",
                name="audio_folder_input",
                description="An audio folder input",
                folder=FolderRef(asset_id="test_folder"),
            ),
            [AudioRef()],
            list,
        ),
        (
            VideoFolder(
                label="Video Folder",
                name="video_folder_input",
                description="A video folder input",
                folder=FolderRef(asset_id="test_folder"),
            ),
            [VideoRef()],
            list,
        ),
        (
            TextFolder(
                label="Text Folder",
                name="text_folder_input",
                description="A text folder input",
                folder=FolderRef(asset_id="test_folder"),
            ),
            [TextRef()],
            list,
        ),
    ],
)
async def test_input_nodes(
    context: ProcessingContext, node, input_value, expected_type
):
    # For nodes that require setup
    if isinstance(node, (Folder, ImageFolder, AudioFolder, VideoFolder, TextFolder)):
        context.paginate_assets = AsyncMock(return_value=input_value)
    elif isinstance(node, GroupInput):
        node._value = input_value

    try:
        result = await node.process(context)
        assert isinstance(result, expected_type)

    except Exception as e:
        pytest.fail(f"Error processing {node.__class__.__name__}: {str(e)}")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node_class",
    [
        FloatInput,
        BooleanInput,
        IntegerInput,
        StringInput,
        ChatInput,
        TextInput,
        ImageInput,
        VideoInput,
        AudioInput,
    ],
)
async def test_input_node_json_schema(node_class):
    node = node_class(
        label=f"{node_class.__name__} Label",
        name=f"{node_class.__name__.lower()}_name",
        description=f"Description for {node_class.__name__}",
    )
    schema = node.get_json_schema()
    assert isinstance(schema, dict)
    assert "type" in schema
    assert "properties" in schema


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node_class",
    [Folder, ImageFolder, AudioFolder, VideoFolder, TextFolder],
)
async def test_folder_input_nodes(context: ProcessingContext, node_class):
    folder = FolderRef(asset_id="test_folder")
    node = node_class(
        label=f"{node_class.__name__} Label",
        name=f"{node_class.__name__.lower()}_name",
        description=f"Description for {node_class.__name__}",
        folder=folder,
    )
    context.paginate_assets = AsyncMock(return_value=[AssetRef()])

    result = await node.process(context)
    assert isinstance(result, list)
