import io
from enum import Enum
from matplotlib import pyplot as plt
import pandas as pd
import seaborn as sns
from io import StringIO
from pydantic import Field
from sklearn.datasets import load_iris
from sklearn.utils import Bunch
from genflow.metadata.types import Tensor
from genflow.metadata.types import FolderRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import DataFrame
from genflow.metadata.types import ImageRef
from genflow.workflows.genflow_node import GenflowNode
from typing import Any, Literal
from genflow.metadata.types import Dataset


class CreateDataFrameNode(GenflowNode):
    """
    ## CreateDataFrameNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that creates an empty dataframe.

    #### Inputs
    - `columns`: commas separated list of column names

    #### Outputs
    - Returns a new DataFrame with the specified columns.
    """

    columns: str = Field(title="Columns", default="")

    async def process(self, context: ProcessingContext) -> DataFrame:
        return DataFrame(columns=self.columns.split(","), data=[])


class SaveDataFrameNode(GenflowNode):
    """
    ## Save Data Frame Node
    ### Namespace: Core.Dataframe

    #### Description
    A node that saves a DataFrame to a CSV file and uploads it to cloud storage.

    #### Inputs
    - value: DataFrame - the DataFrame to be saved
    - name: str - the name of the file to be saved

    #### Outputs
    Returns the saved DataFrame.
    """

    df: DataFrame = DataFrame()
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = ""

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        return await context.from_pandas(df, self.name)


class SelectColumnNode(GenflowNode):
    """
    ## SelectColumnNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that selects specific columns from a dataframe.

    #### Applications
    - Data analysis
    - Data manipulation
    - Feature selection

    ##### Inputs
    - `dataframe`: DataFrame, a dataframe from which specific columns are to be selected.
    - `columns`: comma separated list of column names

    ##### Outputs
    Returns a new DataFrame that includes only the selected columns.
    """

    dataframe: DataFrame = Field(default_factory=DataFrame)
    columns: str = Field("", description="columns to select")

    async def process(self, context: ProcessingContext) -> DataFrame:
        columns = self.columns.split(",")
        df = await context.to_pandas(self.dataframe)
        return await context.from_pandas(df[columns])


class ColumnToListNode(GenflowNode):
    """
    ## ColumnToListNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that converts a column in a dataframe to a list.

    #### Applications
    - Data manipulation and conversion
    - Working with dataframes
    - Condensing DataFrames to simpler list structures.

    ##### Inputs
    - `dataframe`:(DataFrame) The input dataframe.
    - `column_name`: (str) The name of the column to be converted to a list.

    ##### Outputs
    - Returns a list of objects representing data of a specified column from the input dataframe.
    """

    dataframe: DataFrame = DataFrame()
    column_name: str = ""

    async def process(self, context: ProcessingContext) -> list[Any]:
        df = await context.to_pandas(self.dataframe)
        return df[self.column_name].tolist()


class ListToColumnNode(GenflowNode):
    """
    ## ListToColumnNode
    ### Namespace: Core.Dataframe

    #### Description
    This node converts a list of objects into a column in a dataframe.

    #### Applications
    - Data manipulation in dataframes
    - Adding new data to existing dataframes

    ##### Inputs
    - `dataframe`: A DataFrame object to add a new column to.
    - `column_name`: A string that defines the name of the new column.
    - `values`: A list of any type of elements which will be the new column's values.

    ##### Outputs
    - Outputs a DataFrame object with an added column based on the input list.
    """

    dataframe: DataFrame = DataFrame()
    column_name: str = ""
    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.dataframe)
        df[self.column_name] = self.values
        return await context.from_pandas(df)


class ListToDataFrameNode(GenflowNode):
    """
    ## ListToDataFrameNode
    ### Namespace: Core.Dataframe

    #### Description
    This node converts a list of values to a dataframe.

    #### Applications
    - Converting a list of dictionary values into a structured data form using a dataframe.
    - Useful when the input data is in list format and needs to be processed in data analysis or machine learning tasks which work better with dataframes.

    ##### Inputs
    - `values`: a list of objects to be converted to a dataframe. supported types: `dict`, `int`, `float`, `str`, `bool`, `list`, `tuple`

    ##### Outputs
    - A single output which is a `DataFrame`, a two-dimensional size-mutable, potentially heterogeneous tabular data structure with labeled axes (rows and columns).
    - For dicts: rows correspond to the dictionaries in the input list `values` with each key representing a column in the dataframe.
    - For lists and tuples: rows correspond to the lists/tuples in the input list `values` with each element representing a column in the dataframe.
    - For other types: rows correspond to the values in the input list `values` with each value representing a column in the dataframe.
    """

    values: list[Any] = []
    columns: str = Field(
        title="Columns", default="", description="Comma separated list of column names"
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        rows = []
        columns = self.columns.split(",")
        for value in self.values:
            if not isinstance(value, dict):
                raise ValueError("List must contain dicts.")
            if type(value) == dict:
                row = {}
                for k, v in value.items():
                    if type(v) == dict:
                        row[k] = v["value"]
                    elif type(v) in [int, float, str, bool]:
                        row[k] = v
                    else:
                        row[k] = str(v)
            elif type(value) in [int, float, str, bool]:
                col = columns[0] if len(columns) > 0 else "value"
                row = {col: value}
            elif type(value) in [list, tuple]:
                row = {}
                for i, v in enumerate(value):
                    col = columns[i] if i < len(columns) else f"col{i}"
                    row[col] = v
            else:
                col = columns[0] if len(columns) > 0 else "value"
                row = {col: str(value)}

            rows.append(row)
        df = pd.DataFrame(rows)
        return await context.from_pandas(df)


class CSVToDataframeNode(GenflowNode):
    """
    ## CSV To DataFrame Node
    ### Namespace: Core.Dataframe

    #### Description
    This node converts CSV data into a DataFrame.

    The CSV To DataFrame Node provides a convenient way to convert CSV formatted data into a pandas DataFrame. This can be especially useful in data analysis workflows where CSV data needs to be quickly turned into a structured format.

    #### Applications
    - Converting CSV data for analysis: Data in CSV format can be imported into a DataFrame, allowing for complex data transformations, cleaning, and analysis to be performed.

    #### Example
    A CSV string containing user information can be converted into a DataFrame. Each row in the DataFrame represents a user, and each column represents an aspect of user data such as name, email, etc.

    ##### Inputs
    - csv_data (str): A string of CSV data.

    ##### Outputs
    - A DataFrame containing the structured CSV data.
    """

    csv_data: str = Field(
        ..., title="CSV Data", description="String input of CSV formatted text."
    )

    async def process(self, context: Any) -> DataFrame:
        df = pd.read_csv(StringIO(self.csv_data))
        return await context.from_pandas(df)


class ConcatDataframesNode(GenflowNode):
    """
    ## MergeDataframesNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that merges two dataframes along their columns.

    #### Applications
    - Combining data from different sources
    - Feature engineering in machine learning
    - Data pre-processing

    ##### Inputs
    - `dataframe_a` (DataFrame): First DataFrame to be merged.
    - `dataframe_b` (DataFrame): Second DataFrame to be merged.

    ##### Outputs
    - A single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.
    """

    dataframe_a: DataFrame = DataFrame()
    dataframe_b: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        df = pd.concat([df_a, df_b], axis=1)
        return await context.from_pandas(df)


class AppendDataframesNode(GenflowNode):
    """
    ## AppendDataframesNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that appends two dataframes along their rows.

    #### Applications
    - Combining two dataframes vertically.
    - Data pre-processing.
    - Feature consolidation.

    ##### Inputs
    - **dataframe_a**: DataFrame. DataFrame A to be appended.
    - **dataframe_b**: DataFrame. DataFrame B to be appended.

    ##### Outputs
    - A DataFrame which is the result of appending DataFrame A and DataFrame B.
    """

    dataframe_a: DataFrame = DataFrame()
    dataframe_b: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )
        df = pd.concat([df_a, df_b], axis=0)
        return await context.from_pandas(df)


class JoinDataframesNode(GenflowNode):
    """
    ## JoinDataframesNode

    ### Namespace: Core.Dataframe

    #### Description
    A node that merges two dataframes along their columns.

    #### Applications
    - Combining data from different sources
    - Feature engineering in machine learning
    - Data pre-processing

    ##### Inputs
    - `dataframe_a` (DataFrame): First DataFrame to be merged.
    - `dataframe_b` (DataFrame): Second DataFrame to be merged.

    ##### Outputs
    - A single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.
    """

    dataframe_a: DataFrame = DataFrame()
    dataframe_b: DataFrame = DataFrame()
    join_on: str = "id"

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )
        df = pd.merge(df_a, df_b, on=self.join_on)
        return await context.from_pandas(df)


class DataframeToTensorNode(GenflowNode):
    """
    ## DataframeToTensorNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that converts a dataframe to a tensor.

    #### Applications
    - Converting dataframes to tensors for further processing.
    - Preparing input for machine learning models that require tensor inputs.

    #### Inputs
    - `dataframe` (DataFrame): A dataframe to be converted to a tensor.

    #### Outputs
    - `Tensor` (Tensor): The tensor converted from the input dataframe.
    """

    dataframe: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> Tensor:
        df = await context.to_pandas(self.dataframe)
        return Tensor.from_numpy(df.to_numpy())


class TensorToDataframeNode(GenflowNode):
    """
    ## TensorToDataframeNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that converts a tensor to a dataframe.

    #### Applications
    - Converting tensor data into structured tabular data for easier processing and analysis.

    ##### Inputs
    - tensor (Tensor): A tensor object that is to be converted into a dataframe.
    - columns (list[str]): A list of strings specifying the column names for the resulting dataframe.

    ##### Outputs
    - Returns a DataFrame which is a pandas based dataframe.
    """

    tensor: Tensor = Tensor()
    columns: list[str] = []

    async def process(self, context: ProcessingContext) -> DataFrame:
        array = self.tensor.to_numpy()
        if array.shape[1] != len(self.columns):
            raise ValueError(
                f"Number of columns in tensor ({array.shape[1]}) does not match number of columns specified ({len(self.columns)})"
            )
        df = pd.DataFrame(array, columns=self.columns)
        return await context.from_pandas(df)


class FilterRowsNode(GenflowNode):
    """
    ## FilterRowsNode
    ### Namespace: Core.Dataframe

    #### Description
    A node that filters rows in a dataframe based on a condition.

    #### Applications
    - Filtering unnecessary information in a DataFrame.
    - Selecting specific information in a DataFrame based on some condition.

    ##### Inputs
    - **dataframe** (DataFrame): The dataframe to filter.
    - **condition** (str): The filtering condition.

    ##### Outputs
    - **DataFrame**: The dataframe after being filtered based on the given condition.
    """

    dataframe: DataFrame = DataFrame()
    condition: str = ""

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.dataframe)
        res = df.query(self.condition)
        return await context.from_pandas(res)


class PlotDataframeNode(GenflowNode):
    """
    ## PlotDataframeNode\n### NodeCategory - DATAFRAME
    ### Namespace: Core.Dataframe

    #### Description\nA node that plots a dataframe and returns the image.

    #### Applications\n- Visualizing data in the form of line, bar, or scatter plots.\n- Analyzing trends or patterns in data.

    ##### Inputs\n- dataframe: A DataFrame input for the node.\n- x_column: A string input representing the name of the x column to be used in the plot.\n- y_column: A string input representing the name of the y column to be used in the plot.\n- plot_type: An Enum input representing the type of plot to be created. Can be "line", "bar", or "scatter".

    ##### Outputs\n- ImageRef: Returns an ImageRef object that contains the plotted image of the dataframe. This can be used as an output to display the generated plot.
    """

    class PlotType(str, Enum):
        LINE = "line"
        BAR = "bar"
        SCATTER = "scatter"

    dataframe: DataFrame = DataFrame()
    x_column: str = ""
    y_column: str = ""
    plot_type: PlotType = PlotType.LINE

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.to_pandas(self.dataframe)
        if self.x_column not in df.columns:
            raise ValueError(f"Invalid x_column: {self.x_column}")
        if self.y_column not in df.columns:
            raise ValueError(f"Invalid y_column: {self.y_column}")
        if self.plot_type == self.PlotType.LINE:
            plot = sns.lineplot(x=self.x_column, y=self.y_column, data=df)
        elif self.plot_type == self.PlotType.BAR:
            plot = sns.barplot(x=self.x_column, y=self.y_column, data=df)
        elif self.plot_type == self.PlotType.SCATTER:
            plot = sns.scatterplot(x=self.x_column, y=self.y_column, data=df)
        else:
            raise ValueError(f"Invalid plot type: {self.plot_type}")
        fig = plot.get_figure()
        if fig is None:
            raise ValueError("Invalid plot")
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class PlotHistogramNode(GenflowNode):
    """
    ## PlotHistogramNode
    ### Namespace: Core.Dataframe

    #### Description\nA node that plots a histogram of a dataframe column and returns the image.

    #### Applications\n- Data Visualization\n- Data Analysis\n- Exploratory Data Analysis (EDA)

    ##### Inputs\n- `dataframe`: The input dataframe where the histogram will be plotted from. Type: DataFrame.\n- `column`: The specific column in the dataframe to plot a histogram of. Type: str, default: '' (empty string).

    ##### Outputs\n- It returns an `ImageRef` object which is a histogram image of the specified dataframe column. Type: ImageRef.
    """

    dataframe: DataFrame = DataFrame()
    column: str = Field(title="Column", default="")

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.to_pandas(self.dataframe)
        if self.column not in df.columns:
            raise ValueError(f"Invalid column: {self.column}")
        (fig, ax) = plt.subplots()
        sns.set_theme(style="darkgrid")
        sns.histplot(df[self.column], ax=ax)  # type: ignore
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class PlotHeatmapNode(GenflowNode):
    """
    ## PlotHeatmapNode
    ### Namespace: Core.Dataframe

    #### Description\nA node that plots a heatmap of a dataframe and returns the image.

    #### Applications\n- Visualizing data patterns\n- Data analysis\n- Exploratory data analysis

    ##### Inputs\n- dataframe (DataFrame): Input dataframe to plot as a heatmap.

    ##### Outputs\n- A PNG format image (ImageRef), which is a heatmap representation of the input dataframe.
    """

    dataframe: DataFrame = DataFrame()

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.to_pandas(self.dataframe)
        sns.set_theme(style="darkgrid")
        (fig, ax) = plt.subplots()
        sns.heatmap(df, ax=ax)
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class FilterDataframeNode(GenflowNode):
    """
    ## DataFrame Filter Node
    ### Namespace: Core.Dataframe

    #### Description
    This node filters a DataFrame based on a condition.

    #### Inputs
    - `df`: The DataFrame to be filtered.
    - `condition`: The condition to filter the DataFrame.
    """

    df: DataFrame = Field(default_factory=DataFrame)
    condition: str = ""

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.query(self.condition)
        return await context.from_pandas(res)


class DataFrameSortNode(GenflowNode):
    """
    ## DataFrame Sort Node
    ### Namespace: Core.Dataframe

    #### Description
    This node sorts a DataFrame based on a column.

    #### Inputs
    - `df`: The DataFrame to be sorted.
    - `column`: The column to sort the DataFrame by.
    """

    df: DataFrame = Field(default_factory=DataFrame)
    column: str = Field(default="", description="The column to sort the DataFrame by.")

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.sort_values(self.column)
        return await context.from_pandas(res)


class DataFrameDropDuplicatesNode(GenflowNode):
    """
    ## DataFrame Drop Duplicates Node
    ### Namespace: Core.Dataframe

    #### Description
    This node drops duplicate rows from a DataFrame.

    #### Inputs
    - `df`: The DataFrame to drop duplicates from.
    """

    df: DataFrame = Field(default_factory=DataFrame)

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.drop_duplicates()
        return await context.from_pandas(res)


class DataFrameDropNA(GenflowNode):
    """
    ## DataFrame Drop NA Node
    ### Namespace: Core.Dataframe

    #### Description
    This node drops NA values from a DataFrame.

    #### Inputs
    - `df`: The DataFrame to drop NA values from.
    """

    df: DataFrame = Field(default_factory=DataFrame)

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.dropna()
        return await context.from_pandas(res)


class IrisDataFrameNode(GenflowNode):
    """
    ## IrisDataFrameNode
    ### Namespace: Core.Dataframe

    #### Description
    This node loads the Iris dataset.

    The Iris dataset is a well-known multivariate dataset used for various data science tasks. It contains 150 samples of iris flowers from three different species (setosa, versicolor, or virginica). The iris dataset is a favorite example of many because it requires very little knowledge of the data to get started with machine learning or data science.

    #### Applications
    - Exploratory Data Analysis: The Iris dataset is an excellent choice to learn and experiment with different data exploration techniques.
    - Beginner's ML Tasks: Since it's a well-known dataset, it provides a good starting point for beginners in Machine Learning.
    - Algorithm Testing: Perfect for trying out different classification algorithms.

    #### Example
    To use the IrisDataFrameNode in a workflow, add it to your workflow and connect its output to the input of your next node, which could be a data pre-processing node or a machine learning algorithm node.

    ##### Inputs
    This node does not have any input fields.

    ##### Outputs
    - 'Dataset': The loaded Iris dataset, which includes a dataframe of features and a dataframe of targets. The features include Sepal Length, Sepal Width, Petal Length, and Petal Width. The target is the species of the Iris flower. All values are returned as pandas dataframes.
    """

    async def process(self, context: ProcessingContext) -> Dataset:
        data = load_iris(as_frame=True)
        assert isinstance(data, Bunch)
        return Dataset(
            data=await context.from_pandas(data.data),
            target=await context.from_pandas(pd.DataFrame(data.target)),
        )
