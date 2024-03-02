from pydantic import Field
from genflow.metadata.types import Tensor
from genflow.metadata.types import asset_to_ref
from genflow.models.asset import Asset
from genflow.metadata.types import FolderRef
from genflow.metadata.types import AssetRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import AudioRef
from genflow.metadata.types import ImageRef
from genflow.metadata.types import TextRef
from genflow.workflows.genflow_node import InputNode
from typing import Literal
from genflow.metadata.types import VideoRef


class FloatInputNode(InputNode):
    '## Float Input Node\n### Namespace: Input \n\n#### Description\nThis node represents a way to input numbers, specifically floating point numbers, into the workflow. \n\nThe Float Input Node is an essential part of the workflow, capable of receiving decimal number inputs and transferring them to the rest of the system for processing. It is the starting point for workflows that perform calculations or handle quantitative data. Particularly useful for mathematical operations, data science tasks, statistics, and machine learning prediction algorithms where precise numbers are required. \n\n#### Applications\n- Mathematical operations: The node can receive any floating-point number as an input, facilitating a wide range of calculations like addition, subtraction, multiplications, divisions, and so forth.\n- Machine Learning: Many machine learning models require numerical input, the Float Input Node serves in these scenarios.\n- Data Analysis: Analyzing data often includes manipulating and transforming numerical data. Float Input Node serves as the fundamental input for this data.\n\n#### Example\nUse Float Input Node as the starting point when setting up a workflow that calculates the average temperature based on daily readings or makes predictions based on a set of numerical inputs.\n\n##### Inputs\n- "Value": This field accepts a single float that represents the value to be inputted into the workflow.\n\n##### Outputs\n- A single float output that may be passed to other nodes in the workflow for further processing.\n'
    value: float = 0.0

    async def process(self, context: ProcessingContext) -> float:
        return self.value


class BoolInputNode(InputNode):
    "## Boolean Input Node\n### Namespace: Input \n\n#### Description\nThe Boolean Input Node is a simple form of input that generates a boolean value.\n\nThis node is a basic building block in AI workflows, specially designed to provide boolean input values - either true or false. It greatly simplifies the creation of workflows by producing a constant boolean output, facilitating decision-making pathways within your operations.\n\n#### Applications\n- Setting predefined control flags in workflow.\n- Creating decision-making scenarios by providing static boolean values.\n- Configuring branches in workflow structures.\n\n#### Example\nLet's say your workflow adjusts its actions depending on the user's subscription status. For a premium user, the Boolean Input Node could be set to true, enabling specific actions further down the workflow. Similarly, it could be set to false for basic users.\n\n##### Inputs\n- value: `bool` - Can be either true or false. This is what the node will output when executed.\n\n##### Outputs\n- The Boolean Input Node directly outputs the boolean value fed into it."
    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class IntInputNode(InputNode):
    "## IntInputNode\n### Namespace: Input \n\n#### Description\nThis node allows you to enter an integer value.\n\nThis node is designed to accept integer inputs. It provides a way to input a single integer value into your workflow. Once an integer is provided, it will pass that value forward to the next node in the workflow.\n\n#### Applications\n- Use the IntInputNode when you need to provide a specific integer to your workflow.\n- You can use it to define numerical parameters or settings.\n\n#### Example\nIf you are building a workflow that calculates the square of a number, you would start by adding the IntInputNode, enter the number you want to square, and connect it to a node that can perform the squaring operation.\n\n##### Inputs\n- `value`: This field requires an integer. This is the value that you want to input and will be forwarded to the next node in the workflow.\n\n##### Outputs\n- Outputs the integer value entered in the `value` field. This will be forwarded to the next node in your AI workflow."
    value: int = 0

    async def process(self, context: ProcessingContext) -> int:
        return self.value


class StringInputNode(InputNode):
    "## StringInputNode\n### Namespace: Input\n\n#### Description\nThe TextInputNode is a node that simply returns a text value.\n\nThis node serves as a simple way to provide fixed text input to a workflow. This might be used when you have predefined text to pass into the workflow, like a message or a file name. \n\n#### Applications\n- Preparing a welcome or error message to display on a user interface.\n- Setting up file names or paths for saving or loading data.\n- Providing constant values in a workflow, like search keywords, filter criteria, or labels.\n\n#### Example\nLet's assume we are building a workflow to greet a new user. We would use the TextInputNode to hold a welcome message. The message would then be passed to other nodes that handle displaying the message to the user.\n\n##### Inputs\n- 'value': (type: string), a text that is going to be returned when the workflow reaches this node.\n\n##### Outputs\n- Returns the text provided in the 'value' field. Type is string."
    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class TextInputNode(InputNode):
    "## TextInputNode\n### Namespace: Input\n\n#### Description\nThe TextInputNode is a node that simply returns a text value.\n\nThis node serves as a simple way to provide fixed text input to a workflow. This might be used when you have predefined text to pass into the workflow, like a message or a file name. \n\n#### Applications\n- Preparing a welcome or error message to display on a user interface.\n- Setting up file names or paths for saving or loading data.\n- Providing constant values in a workflow, like search keywords, filter criteria, or labels.\n\n#### Example\nLet's assume we are building a workflow to greet a new user. We would use the TextInputNode to hold a welcome message. The message would then be passed to other nodes that handle displaying the message to the user.\n\n##### Inputs\n- 'value': (type: string), a text that is going to be returned when the workflow reaches this node.\n\n##### Outputs\n- Returns the text provided in the 'value' field. Type is string."
    value: TextRef = Field(TextRef(), description="The text to use as input.")

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class ImageInputNode(InputNode):
    "## Image Input Node\n### Namespace: Input \n\n#### Description\nImage Input Node is a simple node that takes an image as input.\n\nThe node's primary role is to intake an image, which will be used in subsequent parts of the AI workflow. This node is the starting point in workflows involving image-based tasks.\n\n#### Applications\n- Image Processing: Use this node at the start of any workflow that requires an image for processing.\n- Image Classification: This node can be used to input images for classification tasks.\n- Object Detection: You can use this node to insert an image for object detection exercises.\n\n#### Example\nBegin your image classification workflow by using the Image Input Node. You will need to provide the image that you want to classify. The image will then flow into subsequent nodes, like an Image Classification Node which can use a pre-trained model to classify the said image.\n\n##### Inputs\n- `Value`: Image - The specific image that will be used as input.\n\n##### Outputs\n- `Output`: Image - This is the same image that you provided as input. This output can be used as an input to the subsequent nodes in the workflow."
    value: ImageRef = Field(ImageRef(), description="The image to use as input.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        return self.value


class VideoInputNode(InputNode):
    "## Video Input Node\n### Namespace: Input \n\n#### Description\nThis node serves as a starting point for inputting video data into the AI workflow.\n\nThe use of the Video Input Node is to provide video content to the workflow. It takes one video at a time as its input and passes it along to other nodes for further processing. A special feature of this node is that it supports various types of video formats.\n\n#### Applications\n- Video Analysis: Feed videos to perform activities like object detection, feature extraction, etc.\n- Video Filtering: Provide videos that need to be filtered or enhanced.\n- Video Editing: Use as a source for videos that need to be edited or modified.\n\n#### Example\nIf you want to deploy an AI model to detect objects in a video, start with a Video Input Node. You select the video and plug it into this node. The node then brings the video into the workflow, where it can be passed on to the next node for object detection.\n\n##### Inputs\n- value: Video Reference - A reference to the video that is to be used as the input.\n\n##### Outputs\n- Returns the video that you plugged into it. Expected output type is a Video Reference."
    value: VideoRef = Field(VideoRef(), description="The video to use as input.")

    async def process(self, context: ProcessingContext) -> VideoRef:
        return self.value


class TensorInputNode(InputNode):
    "## Tensor Input Node\n### Namespace: Input \n\n#### Description\nThe Tensor Input Node is simply about loading or inputting tensor data.\n\nTensor Input Node sources multi-dimensional data, also known as tensor data, into the workflow. It's mostly used at the beginning of workflows, allowing them to start with specific data. The node can load any tensor data which broadens its functionality and integration with various other nodes.\n\n#### Applications\n- Starting a workflow with particular tensor data: It acts as the entry point of tensor data into the workflow.\n- Pre-loading data for simulations: This function allows users to load data at the start which can be used in multiple parts of the workflow.\n\n#### Example\nLet's say we want to build a workflow that needs to start with a specific set of tensor data, such as temperature readings from various sensors in a geographical area. We can integrate a Tensor Input Node at the beginning of the workflow to input this data.\n\n##### Inputs\n- `value` (type: Tensor): The tensor data that is to be loaded into the workflow.\n\n##### Outputs\n- This node primarily serves as a data input point and hence does not have any specific outputs. Nonetheless, the tensor data it loads can be accessed and used by subsequent nodes in the workflow."
    value: Tensor = Tensor()


class AudioInputNode(InputNode):
    "## Audio Input Node\n### Namespace: Input \n\n#### Description\nThe Audio Input Node is a type of input node that allows the workflow to receive sound.\n\nThe main purpose of the Audio Input Node is to serve as a starting point for any workflow that requires audio data. It accepts an 'audio reference' meaning the source from where the audio will be obtained. Note, this node does not perform any processing itself, but simply passes on the provided audio reference to the next node in the workflow.\n\n#### Applications\n- Voice recognition systems: The node can get voice data for processing.\n- Music analysis systems: The node can be the entry point for the music data that needs to be analyzed.\n- Sound effect generators: The node can source sound that will be modified by subsequent nodes.\n\n#### Example\nIn a voice recognition system, start with the Audio Input Node to introduce the audio that you want the system to recognize. Then connect it to a voice recognition node to interpret the given input.\n\n##### Inputs\n- Value: AudioRef – The source of the audio to use as input.\n\n##### Outputs\n- Returns AudioRef – The reference to the audio data provided as input."
    value: AudioRef = Field(AudioRef(), description="The audio to use as input.")

    async def process(self, context: ProcessingContext) -> AudioRef:
        return self.value


class FolderNode(InputNode):
    folder: FolderRef = Field(FolderRef(), description="The folder to use as input.")
    limit: int = 1000

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if self.folder.is_empty():
            return []

        assets, cursor = Asset.paginate(
            user_id=context.user_id,
            parent_id=self.folder.asset_id,
            limit=self.limit,
        )

        return [asset_to_ref(asset) for asset in assets]


class ImageFolderNode(FolderNode):
    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        assets = await super().process(context)
        images = [asset for asset in assets if isinstance(asset, ImageRef)]
        return images


class AudioFolderNode(FolderNode):
    async def process(self, context: ProcessingContext) -> list[AudioRef]:
        assets = await super().process(context)
        audios = [asset for asset in assets if isinstance(asset, AudioRef)]
        return audios


class VideoFolderNode(FolderNode):
    async def process(self, context: ProcessingContext) -> list[VideoRef]:
        assets = await super().process(context)
        videos = [asset for asset in assets if isinstance(asset, VideoRef)]
        return videos


class TextFolderNode(FolderNode):
    async def process(self, context: ProcessingContext) -> list[TextRef]:
        assets = await super().process(context)
        texts = [asset for asset in assets if isinstance(asset, TextRef)]
        return texts
