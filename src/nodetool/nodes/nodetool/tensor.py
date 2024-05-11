from enum import Enum
from io import BytesIO
from matplotlib import pyplot as plt
from sklearn.manifold import TSNE
import seaborn as sns
import numpy as np
from pydantic import Field
from typing import Any, Literal
from nodetool.nodes.nodetool.math import convert_output
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import to_numpy
from nodetool.metadata.types import Tensor


# class SaveTensor(Node):
#     category: NodeCategory = NodeCategory.TENSOR
#     value: Tensor = Field(
#         Tensor(),
#         description="The tensor to save.",
#     )
#     folder: FolderRef = Field(
#         FolderRef(),
#         description="The folder to save the tensor in.",
#     )
#     name: str = Field("tensor.npy", description="The name of the asset to save.")

#     async def process(self, context: ProcessingContext) -> Tensor:
#         tensor = self.value.to_numpy()
#         buffer = BytesIO()
#         np.save(buffer, tensor)
#         buffer.seek(0)
#         asset, s3_url = await context.create_asset(
#             name=self.name,
#             content_type="application/tensor",
#             content=buffer,
#             parent_id=self.folder.asset_id,
#         )
#         return Tensor.from_numpy(
#             tensor,
#             uri=s3_url,
#             asset_id=asset.id,
#         )


class Stack(BaseNode):
    """
    Stack tensors along a specified axis.
    tensor, stack, concatenate, join, merge, axis
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
    Represents a node that performs matrix multiplication on two tensors.
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
    A class representing a node that performs transpose operation on a tensor.
    """

    _layout = "small"
    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.transpose(to_numpy(self.tensor)))


class Max(BaseNode):
    """
    Computes the maximum value along a specified axis of a tensor.
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.max(to_numpy(self.tensor), axis=self.axis))


class Min(BaseNode):
    """
    Calculates the minimum value along a specified axis of a tensor.
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.min(to_numpy(self.tensor), axis=self.axis))


class Mean(BaseNode):
    """
    Computes the mean of the input tensor.
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.mean(to_numpy(self.tensor), axis=self.axis))


class Sum(BaseNode):
    """
    Calculates the sum of the input tensor.
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.sum(to_numpy(self.tensor), axis=self.axis))


class ArgMax(BaseNode):
    """
    Finds the indices of the maximum values along a specified axis of a tensor.
    """

    a: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.argmax(to_numpy(self.a), axis=self.axis))


class ArgMin(BaseNode):
    """
    Finds the indices of the minimum values along a specified axis of a tensor.
    """

    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.argmin(to_numpy(self.tensor), axis=self.axis))


class Abs(BaseNode):
    """
    Absolute value of a tensor.
    """

    input_tensor: Tensor = Field(
        description="The input tensor to compute the absolute values from."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        abs_tensor = np.abs(self.input_tensor.to_numpy())
        return Tensor.from_numpy(abs_tensor)


class TensorToScalar(BaseNode):
    """
    Converts a tensor to a scalar.
    """

    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> float:
        return self.tensor.to_numpy().item()


class ScalarToTensor(BaseNode):
    """
    Converts a scalar to a tensor.
    """

    value: float | int = 0

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array([self.value]))


class ListToTensor(BaseNode):
    """
    Converts a list to a tensor.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array(self.values))


class PlotTensor(BaseNode):
    """
    Plot tensor.
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
    Plot tensor using t-SNE.
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
    Converts tensor as a list.
    """

    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.tensor.to_numpy().tolist()


class Exp(BaseNode):
    """
    Calculate the exponential of a tensor.
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.exp(to_numpy(self.x).astype(np.float32))
        )


class Log(BaseNode):
    """
    Calculate the natural logarithm of a tensor.
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.log(to_numpy(self.x).astype(np.float32))
        )
