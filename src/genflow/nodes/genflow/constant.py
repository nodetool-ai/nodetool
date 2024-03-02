from typing import Any, Literal
from genflow.metadata.types import Tensor
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import AudioRef
from genflow.metadata.types import DataFrame
from genflow.metadata.types import ModelRef
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import ConstantNode
from genflow.metadata.types import TextRef
from genflow.metadata.types import VideoRef


class AudioNode(ConstantNode):
    "## AudioNode\n### Namespace: Constant\n\n#### Description\nThe AudioNode lets you select an audio resource for your workflow.\n\nThe purpose of this node is to provide an audio resource from your library for use in an AI workflow. Any audio files in your library can be selected. This offers the ability to analyze, manipulate, or otherwise use audio data within your AI project.\n\n#### Applications\n- Loading audio data for speech recognition.\n- Providing audio clips for sound-related AI models.\n- Supplying audio data for training sound-based AI models.\n\n#### Example\nTo utilize the AudioNode in your AI workflow, first locate it from the node palette under the CONSTANT category, then drag and drop it onto your work area. Click on the node and select the desired audio file from your library using the value field.\nFor instance, if you want to use a speech recognition node in the subsequent step, simply connect the output of your AudioNode to the audio input of your Speech Recognition Node.\n\n##### Inputs\n- value (AudioRef): The reference of the audio file you'd like to use. It is selected from your own library.\n\n##### Outputs\n- value (AudioRef): The audio file reference that you selected. This can be passed to subsequent nodes in the workflow."
    value: AudioRef = AudioRef()

    async def process(self, context: ProcessingContext) -> AudioRef:
        await context.refresh_uri(self.value)
        return self.value


class BoolNode(ConstantNode):
    "## BoolNode\n### Namespace: Constant\n\n#### Description\nThe BoolNode is a constant node that holds a boolean value.\n\nThis node allows for the storing and manipulation of boolean data. It's used primarily to hold a `True` or `False` value, through its `value` field, which can be used in different parts of the workflow. The node can interact with other nodes that understand boolean data.\n\n#### Applications\n- Creating conditional branches in the workflow based on a set boolean value.\n- Serving as a flag to enable/disable certain parts of an AI pipeline.\n\n#### Example\nLet's consider a data processing pipeline where a certain process needs to be enabled or disabled based on user input. You can use a BoolNode to store this user's decision and use it later to determine whether to execute the particular process or not.\n\n##### Inputs\n- `value` (bool): The boolean value stored in the node.\n\n##### Outputs\n- A boolean value (`True` or `False`) based on the value stored in this node."
    value: bool = False

    async def process(self, context: ProcessingContext) -> bool:
        return self.value


class DataFrameNode(ConstantNode):
    "## DataFrame Node\n### Namespace: Constant\n\n#### Description\nThe DataFrame Node serves as a basic constant node in a node-based UI for building AI workflows. \n\nIts primary purpose is to store pandas DataFrame as a constant. The node is used to supply DataFrame type of data within a workflow. The notable feature of this node is its simplicity. It can hold a DataFrame as a constant value.\n\n#### Applications\n- Supplying predefined DataFrame type of data, e.g., during testing or developing a workflow.\n- Providing a data source in a data processing pipeline for machine learning or data analysis.\n\n#### Example\nLet's suppose, there is a node that needs DataFrame as an input. To feed the DataFrame to this node, you can connect a DataFrame Node to it. Define the DataFrame value in the DataFrame Node properties first. You can now send this DataFrame through your pipeline by connecting the nodes as needed.\n\n##### Inputs\n- Value (DataFrame): The DataFrame that the node holds and uses as the constant value in your node-based workflow.\n\n##### Outputs\n- It outputs the value of the DataFrame held by the node as a DataFrame type."
    value: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> DataFrame:
        return self.value


class DictNode(ConstantNode):
    "## Dict Node\n### Namespace: Constant\n\n#### Description\nThis node generates a dictionary object.\n\nThe DictNode is a simple and essential node in a pipeline. It provides a dictionary object that holds key-value pairs. The node returns the data it holds when executed within a pipeline. With its ability to store various types of data, it can be used for different purposes such as configuration settings, parameter passing, or data communication between nodes.\n\n#### Applications\n- Construction and transmission of configuration settings: You can set key-value pairs in a dictionary that represent your configuration details and feed it into other nodes.\n- Parameter passing: It can send various parameters to another node as a dictionary.\n- Data communication: It's also an easy way to exchange data between nodes in a pipeline.\n\n#### Example\nImagine the scenario, you need to send a set of parameters to a machine learning model node. You can use the DictNode to combine all these parameters into one dictionary and send it to the machine learning model node.\n\n##### Inputs\n- `value`: dict[(str, Any)]. A dictionary that holds key-value pairs. The dictionary can store keys of string type and values of any data type.\n\n##### Outputs\n- `Output`: dict[(str, Any)]. The dictionary that was fed as input. It can then be used by downstream nodes in the pipeline."
    value: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return self.value


class ImageNode(ConstantNode):
    "## Image Node\n### Namespace: Constant\n\n#### Description\nThis node is utilized for storing image data.\n\nThe Image Node serves a significant role in the AI workflows. It's designed to handle and store images for various processing tasks in the workflows. This node fits well in image processing workflows, where it is crucial to input image data. One primary feature of Image Node is its `process` attribute which allows it to output the stored image whenever required.\n\n#### Applications\n- **Image Processing Workflows**: An Image Node can be a source for the image that will be analyzed or transformed by other nodes in an image processing workflow.\n- **Machine Learning Workflows**: In the context of machine learning, where model training is often based on a set of images, an Image Node can be used to provide training data.\n\n#### Example\nIn a workflow designed to enhance image quality, the Image Node can be the primary source of the image data. The Image Node could pass the image to a subsequent node responsible for applying filters, another node for resizing the image, and eventually a node for saving the edited image.\n\n##### Inputs\n- **value** (ImageRef): The image that will be stored and processed in this node.\n\n##### Outputs\n- **output** (ImageRef): The processed image from the node.\n"
    value: ImageRef = ImageRef()

    async def process(self, context: ProcessingContext) -> ImageRef:
        await context.refresh_uri(self.value)
        return self.value


class ListNode(ConstantNode):
    "## ListNode\n### Constant\n\n#### Namespace: Constant\nThe ListNode is a basic, multipurpose node that produces a given list as a constant output.\n\nThe node's primary function is to supply a pre-determined list. This list is used in various operations within an AI workflow, serving as a source of constant values. The ListNode accommodates any data type, enabling versatility in its applications.\n\n#### Applications\n- **Feeding Data:** You can use the ListNode to feed a specific list of data into other nodes for further processing.\n- **Creating Fixed Lists:** ListNode can be used to create fixed lists for instances where the list elements don't change.\n\n#### Example\nTo build a predictive model, you may need a list of features to train on. In this case, you add a ListNode to your pipeline, and set its value to be your list of features. Then, connect this ListNode to your predictive model node.\n\n##### Inputs\n- **value:** (list) The list that will be the output of the node.\n\n##### Outputs\n- The ListNode only has one output: the list you defined in the 'value' field. It can be connected to any other node that requires a list input."
    value: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.value


class ModelNode(ConstantNode):
    "## ModelNode\n### Namespace: Constant\n\n#### Description\nThis node is a reference to a model in your AI pipeline.\n\nThe ModelNode is designed to hold a reference to an AI model. It is a useful node as it allows you to insert your model at any location within your AI workflow. Whenever the need arises to access or modify the referred AI model, this node can be used. \n\n#### Applications\n- Setting reference point for the model: Use ModelNode to establish your model as a reference, enabling easy and consistent reusability.\n- Modifying AI model: It can be used if you want to change the AI model in the pipeline for testing different models.\n\n#### Example\nIf you are constructing a pipeline that includes a machine learning model, you can use the ModelNode to insert your model. If the pipeline is a text classification process, you can easily replace your model through the ModelNode without needing to adjust the rest of your pipeline. \n\n##### Inputs\n- `value`: type ModelRef. A reference to specific AI model which can be referred or modified in the pipeline.\n\n##### Outputs\n- `ModelRef`: type ModelRef. Returns the reference of the AI model."
    value: ModelRef = ModelRef()

    async def process(self, context: ProcessingContext) -> ModelRef:
        await context.refresh_uri(self.value)
        return self.value


class NumberNode(ConstantNode):
    """
    ## Number Node
    ### Namespace: Core.Constant.Number

    #### Description
    This node holds a constant number.

    The purpose of the Float Node is to provide a steady and changeless input throughout the entire process.
    The node is often used to input values for mathematical calculations or other processes where a fixed decimal number is required.

    #### Applications
    - Providing constant decimal values for mathematical operations.
    - Input for machine learning algorithms requiring constant parameters.

    ##### Inputs
    - **value** (float): This field holds the constant value that the node will provide.

    ##### Outputs
    - The node outputs the number value.
    """

    value: float = 0.0

    async def process(self, context: ProcessingContext) -> float:
        return self.value


class StringNode(ConstantNode):
    """
    ## String Node
    ### Namespace: Core.Constant.String

    #### Description
    This node holds a text value in a workflow.

    #### Applications
    - Holding static instructions or messages to be used in the pipeline.
    - Storing fixed text data that does not change during the processing.

    #### Example
    Let's say you are building a pipeline that generates automated email replies. You can use a Text Node to hold the greeting text (e.g., "Hello, thank you for your email,") that is used in every email response.

    ##### Inputs
    - `value`: str - The text value that will be stored in the node.

    ##### Outputs
    - `output`: str - The text value held in the node.
    """

    value: str = ""

    async def process(self, context: ProcessingContext) -> str:
        return self.value


class TextNode(ConstantNode):
    """
    ## Text Node
    ### Namespace: Core.Constant.Text

    #### Description
    This node holds a text value in a workflow.

    The text node is a type of constant node that stores a piece of text. It can be used to hold static text data needed in the AI pipeline. It is simple to use, just set the desired text, and the node will hold the value, ready to provide it whenever needed in the workflow.
    """

    value: TextRef = TextRef()

    async def process(self, context: ProcessingContext) -> TextRef:
        return self.value


class VideoNode(ConstantNode):
    '## Video Node\n### Namespace: Constant\n\n#### Description\nThe Video Node serves as a reference point to host and manage video content.\n\nThe Video Node is integral to handling videos in your AI workflow. It allows you to load videos and make them available for various operations, such as video processing, analysis, or content editing. Its main function is to hold a reference to a video file that other nodes can utilize.\n\n#### Applications\n- Video Analysis: The Video Node can provide videos to nodes designed for video analysis like object detection or sentiment analysis.\n- Video Editing: It can offer videos to nodes meant for editing or processing videos, like adding effects, cutting clips, or changing video formats.\n\n#### Example\nSuppose you are building a workflow for face detection in videos. Start by adding a Video Node to your workflow and load the video in question. Next, connect this node to a "Face Detection Node", which will detect and highlight faces in the video. Finally, add a "Video Export Node" to save the processed video.\n\n##### Inputs\n- `value` (VideoRef Type): A reference to the video file to be processed.\n\n##### Outputs\n- The Video Node outputs a VideoRef Type object, carrying the reference to the video. This output can be passed onto other nodes for further processing.'
    value: VideoRef = VideoRef()

    async def process(self, context: ProcessingContext) -> VideoRef:
        await context.refresh_uri(self.value)
        return self.value


class TensorNode(ConstantNode):
    "## Tensor Node\n### Namespace: Constant\n\n#### Description\nThis node provides a constant Tensor value.\n\nThe Tensor Node is a constant node that outputs a pre-defined Tensor value. This node is particularly useful when you need to provide constant input into your AI workflow, such as a static set of data or values. Its main feature is to hold and output a Tensor value that does not change during the execution of the workflow.\n\n#### Applications\n- Providing constant Tensor values in AI workflows.\n- Serving as a source of constant data or values for other nodes in the workflow.\n\n#### Example\nSuppose you have an AI workflow that requires a constant Tensor as input. You can use the Tensor Node and set its value to the required Tensor. You can then connect the Tensor Node to any other node in the workflow that requires this constant input.\n\n##### Inputs\n- `value`: A Tensor value that you want this node to hold and output.\n\n##### Outputs\n- This node outputs the Tensor value that was set as its input. This output can be used as an input for other nodes in the AI workflow."
    value: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return self.value
