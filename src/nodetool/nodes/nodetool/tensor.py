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
    ## Stack Node
    ### Namespace: Core.Tensor

    #### Description
    The Stack Tensor Node stacks tensors along a specified axis.

    This node is used when you need to group several tensors together in a specific arrangement. 'Stacking' refers to the process of joining a sequence of tensors along a new axis. The stacked tensors have to have the same shape.

    #### Applications
    - Merging image data for batch processing, where each tensor represents an individual image.
    - Combining several feature sets into a single tensor for machine learning models.

    #### Example
    Suppose you have three tensors representing grayscale images of the same size. You want to combine these images into a single tensor that can be processed as a batch. You would use the Stack Tensor Node and specify the axis along which the images should be stacked. Afterwards, you could feed this combined tensor into an image processing or analysis node.

    ##### Inputs
    - `tensors [List[Tensor]]`: The list of tensors to be stacked.
    - `axis [int]`: The axis along which to stack the tensors.

    ##### Outputs
    - `result [Tensor]`: The resulting tensor after stacking the provided tensors along the specified axis.
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


class MatMulTensor(BaseNode):
    "## MatMul Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThe MatMul Tensor Node performs matrix multiplication on two input tensors and produces a tensor as the output.\n\nThe Node is specifically designed for situations where the user needs to conduct matrix multiplication tasks within an AI workflow. This operation is common in several fields such as linear algebra, computer graphics and Machine learning where multi-dimensional data needs to be altered for computations.\n\n#### Applications\n- **Linear Algebra**: Provides a way to do complex operations on high dimensional entities.\n- **Machine Learning:** Used in various ML operations including the computation of gradients, backpropagation in neural networks etc.\n- **Data Manipulation:** Can manipulate multi-dimensional data for feature extraction and data mining.\n\n#### Example\nImagine a workflow where you have two different nodes each outputting a tensor. These tensors can be inputted to the MatMul Tensor Node to get a new tensor as a result of matrix multiplication operation. That resultant tensor can be used in the next step of your AI workflow, for instance feeding it into a machine learning model Node.\n  \n##### Inputs\n- **Input 1**: A tensor for the operation.\n- **Input 2**: Another tensor for the operation.\n\n##### Outputs\n- **Output**: A new tensor, that is the result of a matrix multiplication operation between Input 1 and Input 2.\n"
    a: Tensor = Tensor()
    b: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        a = to_numpy(self.a)
        b = to_numpy(self.b)
        return Tensor.from_numpy(np.matmul(a, b))


class TransposeTensor(BaseNode):
    "## Transpose Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node transposes a tensor.\n\nIn simpler terms, it rearranges the dimensions of a tensor - a fundamental data element in any AI/Machine Learning workflow. Transposing is used for data reshaping, facilitating certain computations and helping algorithms function as intended.\n\n#### Applications\n- Data Reshaping: Change the format of data for model training or prediction.\n- Matrix operations: Useful when performing computations that require dimension manipulation.\n- Deep Learning: Transposing tensors are common in deep learning algorithms which necessitate data in specific structures.\n\n#### Example\nAssume you have data in a tensor format which is not suitable for the machine learning model you want to use. Add this Transpose Tensor Node to your workflow, connect it with the data, set the desired order of dimensions and the node will transpose your data accordingly.\n\n##### Inputs\n- Tensor: The input tensor you want to transpose.\n\n##### Outputs\n- Transposed Tensor: The transposed version of the input tensor, rearranged according to the specified dimensions."
    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.transpose(to_numpy(self.tensor)))


class MaxTensor(BaseNode):
    "## Max Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node retrieves the maximum value from an input tensor.\n\nThe Max Tensor node is designed for performing tensor calculations, specifically finding the highest value within the tensor. A tensor is a mathematical structure often used in machine learning and artificial intelligence applications, particularly for dealing with multiple dimensions of data. This node's function is important in optimizations and comparison tasks.\n\n#### Applications\n- Identifying the maximum value in a set of machine learning data points.\n- Performing maximum computations in multidimensional array operations.\n- Data analysis tasks that require extraction of maximum values.\n  \n#### Example\nYou have a collection of data represented as a tensor - a multi-dimensional array. You're interested in finding the peak value of this dataset, so you insert it into the Max Tensor node, which then identifies and returns the highest value.\n\n##### Inputs\n- Tensor: The multidimensional array of data to analyze.\n\n##### Outputs\n- Maximum Value: The highest value found within the given tensor."
    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.max(to_numpy(self.tensor), axis=self.axis))


class MinTensor(BaseNode):
    "## Min Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node returns the minimum value in the input tensor.\n\nIn a multi-dimensional array of numbers known as a tensor, this node scans through all the values and identifies the smallest number. This is useful for optimizing functions or for understanding the range of your data.\n\n#### Applications\n- Identifying the lowest score or value in a dataset.\n- Assisting in data normalization processes by finding the lowest value.\n- Minimization problems in optimization where the lowest possible value plays a crucial role.\n\n#### Example\nIn a workflow where you're analyzing a multi-dimensional dataset, you could use the Min Tensor Node after loading your data to help identify the range of values you're working with. Once the Min Tensor Node has found the minimum value, you can use this to adjust your data as needed before continuing the analysis.\n\n##### Inputs\n- Input Tensor [array]: The tensor or multi-dimensional array you want to find the minimum value of.\n\n##### Outputs\n- Minimum Value [number]: The smallest number value identified in the array."
    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.min(to_numpy(self.tensor), axis=self.axis))


class MeanTensor(BaseNode):
    "## Mean Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node provides the average value of an input data structure, known as a tensor.\n\nThe Mean Tensor Node works by receiving a tensor, which is a multi-dimensional array of numbers. It calculates the mean (average) value of all the numbers within the tensor. This operation can aid in understanding the central tendency of your data.\n\n#### Applications\n- Data Analysis: Useful in getting a quick understanding of the average value of your dataset.\n- Preprocessing: Often used in preprocessing stages of machine learning pipelines to normalize data.\n\n#### Example\nIn an AI workflow, if you have a tensor that contains sales data from a retail store, you could use the Mean Tensor Node to calculate and display the overall average of sales.\n\n##### Inputs\n- **input_tensor**: Tensor, The input tensor from which the mean value is calculated.\n\n##### Outputs\n- **mean_value**: Numeric, The average value of all the elements of the input tensor."
    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.mean(to_numpy(self.tensor), axis=self.axis))


class SumTensor(BaseNode):
    "## Sum Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThe Sum Tensor Node returns the sum of elements in the input tensor.\n\nThe Sum Tensor Node is designed for adding up all the elements within a tensor. A tensor, in this context, is an array of numerical values. The size and shape of the tensor does not matter - the node will add up all elements regardless. \n\nThis operation can be particularly useful in various statistical and mathematical calculations which involve summing up a series of data points.\n\n#### Applications\n- Summing elements in an array for statistical analysis.\n- Performing mathematical operations on datasets.\n\n#### Example\nLet's say you have a tensor filled with product ratings from different customers. You want to get the total score of all ratings. To achieve this, you would use the Sum Tensor Node. Simply input your tensor to the node, and it will return the total score.\n\n##### Inputs\n- `input_tensor`: The input tensor, which is an array of numerical values.\n\n##### Outputs\n- `output_sum`: The sum of all elements within the input tensor."
    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.sum(to_numpy(self.tensor), axis=self.axis))


class ArgMaxTensor(BaseNode):
    "## ArgMax Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node returns the indices of the maximum values along a particular axis of a tensor.\n\nA tensor is pretty much like an n-dimensional array. For example, a 2-dimensional tensor resembles a table with rows and columns. The 'ArgMax Tensor Node' examines this tensor and identifies the locations (indices) of the highest values for each row/column/slice (depending on the axis specified). \n\n#### Applications\n- Locating largest elements in data structures: Suppose you have a tensor representing certain data points, you can use this node to find the indices where the data points reach their peak values.\n- Real-world datasets analysis: When used in the context of machine learning, ArgMax Tensor node can be used to highlight the most significant information in a dataset.\n\n#### Example\nAssume you have a tensor that represents daily sales of different products in a store. You can use the ArgMax Tensor node to quickly identify which product had the highest sales each day. Use 'Prepare Tensor Node' to create your tensor first, then connect it to this ArgMax Tensor Node.\n\n##### Inputs \n- `Input Tensor`: Your input tensor from which you want to find the max along the specified axis.\n- `Axis`: An integer indicating the axis along which to find the maximum value. Starts with 0.\n\n##### Outputs\n- `ArgMax Indices`: The indices of the maximum values along the specified axis of the input tensor. These indices indicate the position of maximum values in the tensor."
    a: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.argmax(to_numpy(self.a), axis=self.axis))


class ArgMinTensor(BaseNode):
    "## ArgMin Tensor Node\n### Namespace: Core.Tensor\n\n#### Description\nThe ArgMin Tensor Node provides the indices of the minimum values along a specified axis of a tensor.\n\nTensors can be thought of as multi-dimensional arrays, and this node finds the position (index) of the smallest number in each array. The 'axis' is the dimension of the tensor along which to find the minimum values. For example, if the tensor is a 2D array (like a spreadsheet with rows and columns), setting axis to 0 will find the minimum values in each column, while setting axis to 1 will find the minimum values in each row.\n\n#### Applications\n- Finding the minimum value's position in a Tensor, useful in various AI algorithms for optimization purposes.\n- Locating the index of the smallest elements when working with large Tensor datasets.\n\n#### Example\nSuppose you have a tensor representing customer feedback scores, with scores from different categories in each row and ratings from different customers in each column. To find the category that got the lowest rating from each customer, you would use the ArgMin Tensor Node with the axis set to 0.\n\n##### Inputs\n- Tensor: The input tensor to find the minimum values along an axis.\n- Axis: The dimension of the tensor along which to find the minimum values.\n\n##### Outputs\n- ArgMin Indices: The indices of the minimum values along the specified axis of the tensor."
    tensor: Tensor = Tensor()
    axis: int | None = None

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.argmin(to_numpy(self.tensor), axis=self.axis))


class AbsTensor(BaseNode):
    '## Absolute Value Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node returns the absolute values of a tensor.\n\nIn the context of tensors, the term "absolute value" denotes the magnitude of each element in the tensor, disregarding its sign. This implies that whether the original element values were positive or negative, the returned tensor will only consist of non-negative values.\n\n#### Applications\n- Preprocessing data: Sometimes, it may be critical to consider only the magnitude of values rather than their sign. This can be useful in scenarios where the sign may introduce bias or be irrelevant to the final outcome.\n- Feature engineering: The absolute value transformation can serve as a means to create new features from existing data, thus enhancing the information available for model training.\n\n#### Example\nTo obtain the absolute values of elements in a tensor, simply add the `Absolute Value Node` to your workflow. Then, connect the tensor output from a data source or another computation to this node. The output will be a tensor with the absolute values of all elements.\n\n##### Inputs\n- `input_tensor` (tensor): The tensor from which to calculate absolute values.\n\n##### Outputs\n- `output_tensor` (tensor): The resultant tensor containing the absolute values of all elements in the input tensor.'
    input_tensor: Tensor = Field(
        description="The input tensor to compute the absolute values from."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        abs_tensor = np.abs(self.input_tensor.to_numpy())
        return Tensor.from_numpy(abs_tensor)


class TensorToScalar(BaseNode):
    "## TensorToScalar Node\n### Namespace: Core\n\n#### Description\nThis node converts a tensor - a mathematical object composed of arrays of numbers - into a scalar, which is a single number. This operation can be useful when you need to reduce a complex dataset to a simple numeric value that can be processed more efficiently or that is required for specific algorithms.\n\n#### Applications\n- Simplifying complex datasets in order to feed them into algorithms that require scalar inputs.\n- Extracting a useful simpler aspect of your dataset to perform further operations.\n- Reducing dimensionality of input data for speed optimization.\n\n#### Example\nYou may have a high dimensional dataset from a multi-sensor system and you only need the sum or the average of all those data points. You can use this node to convert the tensor data into a single value representing the sum or average. You then take this value and feed it to your next node where you might process it or make decisions based on it.\n\n##### Inputs\n- `tensor`: This is your input tensor that you want to convert to a scalar. It must be a valid tensor.\n\n##### Outputs\n- `scalar`: This field will contain your output scalar value which was converted from the input tensor."
    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> float:
        return self.tensor.to_numpy().item()


class ScalarToTensor(BaseNode):
    "## ScalarToTensor Node\n### Namespace: Core\n\n#### Description\nThis node converts a scalar value into a tensor.\n\nA tensor in the context of this tool is a generalization of vectors and matrices, meaning the node will expand the dimensionality of your scalar input. This can be useful in several situations, for instance when your workflow requires tensorial input.\n\n#### Applications\n- Preparing scalar data for tensor-based operations: If your workflow includes nodes that require tensors, you can use the ScalarToTensor node to convert your scalar input into the needed format.\n- Increasing dimensionality: If you need to increase the dimensionality of your data, the ScalarToTensor node allows you to do that easily by converting scalars into tensors.\n\n#### Example\nSuppose your workflow involves a node that performs a tensor-based operation on a scalar value. You would have to convert your scalar value into a tensor format first. This can be done by using the ScalarToTensor node. Simply connect the ScalarToTensor node with your scalar input node and the node that performs the tensor-based operation. The ScalarToTensor node will change the scalar value into tensor format, which then will be able to be processed by the tensor-based-operation node.\n\n##### Inputs\n- Scalar: The scalar value you want to convert into a tensor.\n\n##### Outputs\n- Tensor: The tensor resulting from the conversion of the input scalar."
    value: float | int = 0

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array([self.value]))


class ListToTensor(BaseNode):
    "## ListToTensor\n### Namespace: Core\n\n#### Description\nThis node converts a list to a tensor.\n\nA tensor is a mathematical object that generalizes scalars, vectors, and other higher-dimensional collections. In the context of this node, a tensor is an n-dimensional array of data, similar to a list or a list of lists. By converting data in list format to tensor representation, the node makes it possible for the following nodes to handle machine learning tasks that require tensor computing.\n\n#### Applications\n- Preprocessing data for neural network and machine learning models. Since these models typically work with data in tensor format, transforming input data from a list to a tensor can be a crucial preprocessing step.\n\n#### Example\nConsider a situation where the data collected is in list format, and you wish to train a neural network model. First use the ListToTensor node to convert this data into a tensor format, then you can use this tensor as input to your model node.\n\n##### Inputs\n- `input_list`: A list of data to be converted to a tensor.\n\n##### Outputs\n- `output_tensor`: The tensor representation of the input list."
    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> Tensor:
        return Tensor.from_numpy(np.array(self.values))


class PlotTensor(BaseNode):
    "## Tensor Plotter Node\n### Namespace: Core.Tensor\n\n#### Description\nThis node plots a tensor and generates an image.\n\nA tensor is a type of data structure used in machine learning algorithms. The Tensor Plotter Node takes this tensor data, visualizes it in a graph format, and produces an image output.\n\n#### Applications\n- Visualization of tensor data: The node is used to create visual presentations of tensor data in AI workflows. \n\n#### Example\nFor instance, in a workflow where a tensor is output from one node, the Tensor Plotter Node can be connected to this output. The result is a visual representation of the tensor. The image generated can then be used, for example, for reporting or debugging purposes.\n\n##### Inputs\n- `tensor`: Type - Tensor. Description - The tensor data to be plotted.\n\n##### Outputs\n- `image`: Type - Image. Description - The image generated from the plotted tensor."

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
    "## TSNE Plot Node\n### Namespace: Core.Tensor\n\n#### Description\nThe TSNE Plot Node generates a TSNE plot from a dataframe and outputs the resulting image. \n\nTSNE stands for t-Distributed Stochastic Neighbor Embedding, which is a machine learning algorithm useful for visualization of high-dimensional data. This node makes this advanced visualization technique accessible to non-programmers.\n\n#### Applications\n- Visualizing complex data: This node can be useful when you need to visualize data with many dimensions, which can be challenging to represent in traditional plots.\n- Exploratory data analysis: The node can be used to explore your data before processing it further. By visualizing the data, you can gain insights that help you decide on the best processing or machine learning methods to apply.\n\n#### Example\nFirst, input your dataframe to the TSNE Plot Node. The Node will generate an interactive TSNE plot of the data frame. This plot can then be viewed in the UI or saved to a file for future reference or for use in presentations.\n\n##### Inputs\n- DataFrame: The data frame containing the data to be plotted. It should be in a valid format compatible with the node.\n\n##### Outputs\n- Image: The resulting TSNE plot image. It can be used for visualization, or stored for later use."
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
    "## Tensor to List Conversion Node\n### Namespace: Core\n\n#### Description\nThis node converts tensors into lists.\n\nIn the context of AI workflows, a tensor is a generalization of vectors and matrices to potentially higher dimensions. This node simplifies the manipulation of tensor data by converting them into a versatile and easy-to-handle format - lists.\n\n#### Applications\n- Feature extraction: Converting tensors into lists allows for more straightforward manipulation and examination of tensor data. \n- Data transformation: Lists can be further manipulated or transformed as needed, for instance, they could be used to create data frames or other structures, which may be needed in subsequent workflow nodes.\n\n#### Example\nIn a use-case where you have image data represented as tensors (multi-dimensional arrays), and you need to convert this tensor data into a simple list format for further data analysis:\n1. Connect your image data to this node.\n2. The node converts the tensor data into a list.\n3. The outputted list can then feed into other nodes for further data processing like sorting, filtering, or statistical analysis.\n\n##### Inputs\n- `tensor`: The tensor to be converted to a list.\n\n##### Outputs\n- `list`: The outputted list converted from the input tensor."
    tensor: Tensor = Tensor()

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.tensor.to_numpy().tolist()


class Exp(BaseNode):
    """
    ## Exp Node
    ### Namespace: Core.Tensor

    #### Description
    This node calculates the exponential of the input.

    #### Applications
    - Normalization processes: the node can be used when calculating probabilities in certain statistical models where the exponential function is involved.
    - Machine Learning Algorithms: Exponential functions are heavily used in various machine learning algorithms, especially those dealing with probability distributions.

    ##### Inputs
    - `x`: A tensor that the exponential function should be applied to.

    ##### Outputs
    - the resulting after applying the exponential function to the input .
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.exp(to_numpy(self.x).astype(np.float32))
        )


class Log(BaseNode):
    """
    ## Log Tensor Node
    ### Namespace: Core.Tensor

    #### Description
    The Log Tensor Node carries out the mathematical operation of taking the natural logarithm of the input tensor.

    This node is primarily used in workflows where logarithmic transformation of data is needed, such as in the normalization of data distributions, reducing skewness of data, or linearizing exponential relationships in the dataset.

    #### Applications
    - Data Normalization: The log transformation is commonly used in ML workflows to make datasets follow a normal distribution, which might be desired by certain algorithms.
    - Skewness Reduction: Log transformation is helpful when the data needs to be rescaled to reduce skewness in the dataset.
    - Linearization of Exponential Relationships: In cases where the relationship between variables in the dataset is exponential, applying a log transformation can linearize such relationships, easing the pattern discovery process for a machine learning model.

    #### Example
    Assume you are working with a machine learning workflow where your input dataset is highly skewed. You can use the Log Tensor node to reduce the skewness of your data. First, you send your numeric input data to the log node. After the transformation, you can then feed your normalized data to the next node in your ML workflow, such as a regression node for further processing.

    ##### Inputs
    - `x`: The input value that you'd like to apply the natural logarithm to.

    ##### Outputs
    - `output`: The natural logarithm of the input value.
    """

    x: int | float | Tensor = Field(title="Input", default=1.0)

    async def process(self, context: ProcessingContext) -> float | int | Tensor:
        return await convert_output(
            context, np.log(to_numpy(self.x).astype(np.float32))
        )
