from enum import Enum
from io import BytesIO
import PIL.Image
from matplotlib import pyplot as plt
from sklearn.manifold import TSNE
import seaborn as sns
import numpy as np
from pydantic import Field
from typing import Any, Literal
from nodetool.nodes.nodetool.audio.audio_helpers import numpy_to_audio_segment
from nodetool.nodes.nodetool.math import convert_output
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef, FolderRef, ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import to_numpy
from nodetool.metadata.types import Tensor


class SaveTensor(BaseNode):
    """
    Save a tensor to a file in the specified folder.
    tensor, save, file, storage

    Use cases:
    - Persist tensor data for later use
    - Export tensor results from a workflow
    - Save intermediate tensor outputs for debugging
    """

    value: Tensor = Field(
        Tensor(),
        description="The tensor to save.",
    )
    folder: FolderRef = Field(
        FolderRef(),
        description="The folder to save the tensor in.",
    )
    name: str = Field("tensor.npy", description="The name of the asset to save.")

    async def process(self, context: ProcessingContext) -> Tensor:
        tensor = self.value.to_numpy()
        buffer = BytesIO()
        np.save(buffer, tensor)
        buffer.seek(0)
        asset = await context.create_asset(
            name=self.name,
            content_type="application/tensor",
            content=buffer,
            parent_id=self.folder.asset_id if self.folder.is_set() else None,
        )
        return Tensor.from_numpy(
            tensor,
            uri=asset.get_url,
            asset_id=asset.id,
        )


class ConvertToImage(BaseNode):
    """
    Convert tensor data to PIL Image format.

    Keywords: tensor, image, conversion, denormalization

    Use cases:
    - Visualize tensor data as images
    - Save processed tensor results as images
    - Convert model outputs back to viewable format
    """

    tensor: Tensor = Field(
        default=Tensor(),
        description="The input tensor to convert to an image. Should have either 1, 3, or 4 channels.",
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        if self.tensor.is_empty():
            raise ValueError("The input tensor is not connected.")

        tensor_data = self.tensor.to_numpy()
        if tensor_data.ndim not in [2, 3]:
            raise ValueError("The tensor should have 2 or 3 dimensions (HxW or HxWxC).")
        if (tensor_data.ndim == 3) and (tensor_data.shape[2] not in [1, 3, 4]):
            raise ValueError("The tensor channels should be either 1, 3, or 4.")
        if (tensor_data.ndim == 3) and (tensor_data.shape[2] == 1):
            tensor_data = tensor_data.reshape(
                tensor_data.shape[0], tensor_data.shape[1]
            )
        tensor_data = (tensor_data * 255).astype(np.uint8)
        output_image = PIL.Image.fromarray(tensor_data)
        return await context.image_from_pil(output_image)


class ConvertToAudio(BaseNode):
    """
    Converts a tensor object back to an audio file.
    audio, conversion, tensor

    Use cases:
    - Save processed audio data as a playable file
    - Convert generated or modified audio tensors to audio format
    - Output results of audio processing pipelinesr
    """

    tensor: Tensor = Field(
        default=Tensor(), description="The tensor to convert to an audio file."
    )
    sample_rate: int = Field(
        default=44100, ge=0, le=44100, description="The sample rate of the audio file."
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        audio = numpy_to_audio_segment(self.tensor.to_numpy(), self.sample_rate)
        return await context.audio_from_segment(audio)


class Stack(BaseNode):
    """
    Stack multiple tensors along a specified axis.
    tensor, stack, concatenate, join, merge, axis

    Use cases:
    - Combine multiple 2D tensors into a 3D tensor
    - Stack time series data from multiple sources
    - Merge feature vectors for machine learning models
    """

    tensors: list[Tensor] = []
    axis: int = Field(0, description="The axis to stack along.", ge=0)

    async def process(self, context: ProcessingContext) -> Tensor:
        arrays = [to_numpy(tensor) for tensor in self.tensors]
        stacked_tensor = np.stack(arrays, axis=self.axis)
        return Tensor.from_numpy(stacked_tensor)


# class ConcatTensor(Node):
#     '## Concat Tensor Node\n### Tensor Manipulation\n\n#### Description\nThe Concat Tensor Node combines or joins tensors along a specified axis.\n\nTensors, in the context of this tool, are multi-dimensional arrays, similar to matrices or data tables. "Concatenating" means that the node can take several tensors and join them together along a given "axis", or dimension. For example, you can concatenate two spreadsheets by adding the rows of one to the other (concatenating along the row axis).\n\n#### Applications\n- Combining multiple datasets: If you have several tensors containing related data (like sales data from different regions), the Concat Tensor Node could combine them into a single tensor for unified analysis.\n- Modifying data structures: In certain data analysis scenarios, you may need to modify the structure of your data (for example, combine the columns of two data sets). The Concat Tensor Node allows you to perform this operation easily.\n\n#### Example\nSuppose you have three tensors representing sales data from North, East, and West regions. You want to analyze the data collectively. First, connect the three nodes representing these regional data tensors to the Concat Tensor Node. Specify the axis along which you want to concatenate. The Concat Tensor Node will then output a single tensor that combines the data from all regions, which you can feed into further analysis tools.\n\n##### Inputs\n- `tensors`: List of Tensor. The tensors you want to concatenate.\n- `axis`: Integer. The axis along which the tensors will be concatenated.\n\n##### Outputs\n- `result`: Tensor. The single tensor that results from the concatenation of the input tensors.'
#     category: NodeCategory = NodeCategory.TENSOR
#     tensors: list[Tensor] = []
#     axis: int = Field(0, description="The axis to concatenate along.", ge=0)

#     async def process(self, context: ProcessingContext) -> Tensor:
#         tensors = [to_numpy(tensor) for tensor in self.tensors]
#         concatenated_tensor = np.concatenate(tensors, axis=self.axis)
#         return Tensor.from_numpy(concatenated_tensor)


class MatMul(BaseNode):
    """
    Perform matrix multiplication on two input tensors.
    tensor, matrix, multiplication, linear algebra

    Use cases:
    - Implement linear transformations
    - Calculate dot products of vectors
    - Perform matrix operations in neural networks
    """

    _layout = "small"
    a: Tensor = Tensor()
    b: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        a = to_numpy(self.a)
        b = to_numpy(self.b)
        return Tensor.from_numpy(np.matmul(a, b))


class Transpose(BaseNode):
    """
    Transpose the dimensions of the input tensor.
    tensor, transpose, reshape, dimensions

    Use cases:
    - Convert row vectors to column vectors
    - Rearrange data for compatibility with other operations
    - Implement certain linear algebra operations
    """

    _layout = "small"
    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.transpose(to_numpy(self.tensor)))


class Max(BaseNode):
    """
    Compute the maximum value along a specified axis of a tensor.
    tensor, maximum, reduction, statistics

    Use cases:
    - Find peak values in time series data
    - Implement max pooling in neural networks
    - Determine highest scores across multiple categories
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | float | int:
        res = np.max(to_numpy(self.tensor), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class Min(BaseNode):
    """
    Calculate the minimum value along a specified axis of a tensor.
    tensor, minimum, reduction, statistics

    Use cases:
    - Find lowest values in datasets
    - Implement min pooling in neural networks
    - Determine minimum thresholds across categories
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | float | int:
        res = np.min(to_numpy(self.tensor), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class Mean(BaseNode):
    """
    Compute the mean value along a specified axis of a tensor.
    tensor, average, reduction, statistics

    Use cases:
    - Calculate average values in datasets
    - Implement mean pooling in neural networks
    - Compute centroids in clustering algorithms
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | float | int:
        res = np.mean(to_numpy(self.tensor), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class Sum(BaseNode):
    """
    Calculate the sum of values along a specified axis of a tensor.
    tensor, summation, reduction, statistics

    Use cases:
    - Compute total values across categories
    - Implement sum pooling in neural networks
    - Calculate cumulative metrics in time series data
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | float | int:
        res = np.sum(to_numpy(self.tensor), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class ArgMax(BaseNode):
    """
    Find indices of maximum values along a specified axis of a tensor.
    tensor, argmax, index, maximum

    Use cases:
    - Determine winning classes in classification tasks
    - Find peaks in signal processing
    - Locate best-performing items in datasets
    """

    a: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | int:
        res = np.argmax(to_numpy(self.a), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class ArgMin(BaseNode):
    """
    Find indices of minimum values along a specified axis of a tensor.
    tensor, argmin, index, minimum

    Use cases:
    - Locate lowest-performing items in datasets
    - Find troughs in signal processing
    - Determine least likely classes in classification tasks
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor | int:
        res = np.argmin(to_numpy(self.tensor), axis=self.axis)
        if res.size == 1:
            return res.item()
        else:
            return Tensor.from_numpy(res)


class Abs(BaseNode):
    """
    Compute the absolute value of each element in a tensor.
    tensor, absolute, magnitude

    Use cases:
    - Calculate magnitudes of complex numbers
    - Preprocess data for certain algorithms
    - Implement activation functions in neural networks
    """

    input_tensor: Tensor = Field(
        description="The input tensor to compute the absolute values from."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        abs_tensor = np.abs(self.input_tensor.to_numpy())
        if abs_tensor.size == 1:
            return abs_tensor.item()
        else:
            return Tensor.from_numpy(abs_tensor)


class TensorToScalar(BaseNode):
    """
    Convert a single-element tensor to a scalar value.
    tensor, scalar, conversion, type

    Use cases:
    - Extract final results from tensor computations
    - Prepare values for non-tensor operations
    - Simplify output for human-readable results
    """

    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> float | int:
        return self.tensor.to_numpy().item()


class ScalarToTensor(BaseNode):
    """
    Convert a scalar value to a single-element tensor.
    scalar, tensor, conversion, type

    Use cases:
    - Prepare scalar inputs for tensor operations
    - Create constant tensors for computations
    - Initialize tensor values in workflows
    """

    value: float | int = 0

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array([self.value]))


class ListToTensor(BaseNode):
    """
    Convert a list of values to a tensor.
    list, tensor, conversion, type

    Use cases:
    - Prepare list data for tensor operations
    - Create tensors from Python data structures
    - Convert sequence data to tensor format
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array(self.values))


class PlotTensor(BaseNode):
    """
    Create a plot visualization of tensor data.
    tensor, plot, visualization, graph

    Use cases:
    - Visualize trends in tensor data
    - Create charts for reports or dashboards
    - Debug tensor outputs in workflows
    """

    class PlotType(str, Enum):
        LINE = "line"
        BAR = "bar"
        SCATTER = "scatter"

    tensor: Tensor = Tensor()
    plot_type: PlotType = PlotType.LINE

    async def process(self, context: ProcessingContext) -> ImageRef:
        arr = self.tensor.to_numpy()
        sns.set_theme(style="darkgrid")
        if self.plot_type == self.PlotType.LINE:
            plot = sns.lineplot(data=arr)
        elif self.plot_type == self.PlotType.BAR:
            plot = sns.barplot(data=arr)
        elif self.plot_type == self.PlotType.SCATTER:
            plot = sns.scatterplot(data=arr)
        else:
            raise ValueError(f"Invalid plot type: {self.plot_type}")
        fig = plot.get_figure()
        if fig is None:
            raise ValueError("Could not get figure from plot.")
        img_bytes = BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class PlotTSNE(BaseNode):
    """
    Create a t-SNE plot for high-dimensional tensor data.
    tensor, tsne, visualization, dimensionality reduction

    Use cases:
    - Visualize clusters in high-dimensional data
    - Explore relationships in complex datasets
    - Reduce dimensionality for data analysis
    """

    tensor: Tensor = Tensor()
    color_indices: list[int] = []
    perplexity: int = Field(title="Perplexity", default=30, ge=1, le=50)

    async def process(self, context: ProcessingContext) -> ImageRef:
        sns.set_theme(style="darkgrid")
        matrix = self.tensor.to_numpy()
        print("matrix shape", matrix.shape)
        tsne = TSNE(
            n_components=2,
            perplexity=self.perplexity,
            random_state=42,
            init="random",
            learning_rate=200,
        )
        vis_dims = tsne.fit_transform(matrix)
        (fig, ax) = plt.subplots()
        data = {"x": [x for (x, y) in vis_dims], "y": [y for (x, y) in vis_dims]}
        sns.scatterplot(
            data=data,
            x="x",
            y="y",
            hue=self.color_indices,
            palette="viridis",
            alpha=0.3,
            ax=ax,
        )
        img_bytes = BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class TensorToList(BaseNode):
    """
    Convert a tensor to a nested list structure.
    tensor, list, conversion, type

    Use cases:
    - Prepare tensor data for JSON serialization
    - Convert tensor outputs to Python data structures
    - Interface tensor data with non-tensor operations
    """

    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.tensor.to_numpy().tolist()


class Exp(BaseNode):
    """
    Calculate the exponential of each element in a tensor.
    tensor, exponential, math, activation

    Use cases:
    - Implement exponential activation functions
    - Calculate growth rates in scientific models
    - Transform data for certain statistical analyses
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.exp(to_numpy(self.x).astype(np.float32))
        )


class Log(BaseNode):
    """
    Calculate the natural logarithm of each element in a tensor.
    tensor, logarithm, math, transformation

    Use cases:
    - Implement log transformations on data
    - Calculate entropy in information theory
    - Normalize data with large ranges
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.log(to_numpy(self.x).astype(np.float32))
        )
