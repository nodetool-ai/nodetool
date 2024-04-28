import io
from enum import Enum
from matplotlib import pyplot as plt
import pandas as pd
import seaborn as sns
from io import StringIO
from pydantic import Field
from sklearn.datasets import load_iris
from sklearn.utils import Bunch
from nodetool.metadata.types import Tensor
from nodetool.metadata.types import FolderRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataFrame
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from typing import Any, Literal
from nodetool.metadata.types import Dataset


class Create(BaseNode):
    """
    Create an empty data frame.
    csv, columns
    Outputs a DataFrame object with the specified columns.
    """

    columns: str = Field(
        title="Columns", default="", description="comma separated list of column names"
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        return DataFrame(columns=self.columns.split(","), data=[])


class Save(BaseNode):
    """
    Save data frame as a CSV file in a folder.
    csv, folder
    """

    df: DataFrame = DataFrame()
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(default="output.csv", description="Name of the output file.")

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        return await context.from_pandas(df, self.name)


class SelectColumn(BaseNode):
    """
    Select specific columns from a dataframe.
    dataframe, columns
    Outputs a DataFrame object with only the selected columns.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame,
        description="a dataframe from which columns are to be selected",
    )
    columns: str = Field("", description="comma separated list of column names")

    async def process(self, context: ProcessingContext) -> DataFrame:
        columns = self.columns.split(",")
        df = await context.to_pandas(self.dataframe)
        return await context.from_pandas(df[columns])


class ColumnToList(BaseNode):
    """
    Convert a column in a dataframe to a list.
    dataframe, column
    Outputs a list of values from the specified column in the input dataframe.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame, description="The input dataframe."
    )
    column_name: str = Field(
        default="", description="The name of the column to be converted to a list."
    )

    async def process(self, context: ProcessingContext) -> list[Any]:
        df = await context.to_pandas(self.dataframe)
        return df[self.column_name].tolist()


class ListToColumn(BaseNode):
    """
    Convert a list of objects into a column in a dataframe.
    dataframe, column, values
    Outputs a DataFrame object with an added column based on the input list.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame,
        description="Dataframe object to add a new column to.",
    )
    column_name: str = Field(
        default="",
        description="The name of the new column to be added to the dataframe.",
    )
    values: list[Any] = Field(
        default_factory=list,
        description="A list of any type of elements which will be the new column's values.",
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.dataframe)
        df[self.column_name] = self.values
        return await context.from_pandas(df)


class ListToDataFrame(BaseNode):
    """
    Convert a list of values to a dataframe.
    list, dataframe
    Outputs a DataFrame object with the list values as a single column.
    """

    values: list[Any] = Field(
        title="Values", default=[], description="List of values to be converted."
    )
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


class CSVToDataframe(BaseNode):
    """
    Converts CSV data into a DataFrame.
    csv, dataframe
    """

    csv_data: str = Field(
        ..., title="CSV Data", description="String input of CSV formatted text."
    )

    async def process(self, context: Any) -> DataFrame:
        df = pd.read_csv(StringIO(self.csv_data))
        return await context.from_pandas(df)


class Concat(BaseNode):
    """
    Merge two dataframes along their columns.
    merge
    Outputs a single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.
    """

    dataframe_a: DataFrame = Field(
        default_factory=DataFrame, description="First DataFrame to be merged."
    )
    dataframe_b: DataFrame = Field(
        default_factory=DataFrame, description="Second DataFrame to be merged."
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        df = pd.concat([df_a, df_b], axis=1)
        return await context.from_pandas(df)


class Append(BaseNode):
    """
    Append two dataframes along their rows.
    row, concat, merge
    Outputs a DataFrame object that is the result of appending DataFrame A and DataFrame B.
    """

    dataframe_a: DataFrame = Field(
        default_factory=DataFrame, description="First DataFrame to be appended."
    )
    dataframe_b: DataFrame = Field(
        default_factory=DataFrame, description="Second DataFrame to be appended."
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )
        df = pd.concat([df_a, df_b], axis=0)
        return await context.from_pandas(df)


class Join(BaseNode):
    """
    Merges two dataframes along their columns.
    merge, join
    Outputs a single DataFrame resulting from the merging of dataframe_a and dataframe_b along their columns.
    """

    dataframe_a: DataFrame = Field(
        default_factory=DataFrame, description="First DataFrame to be merged."
    )
    dataframe_b: DataFrame = Field(
        default_factory=DataFrame, description="Second DataFrame to be merged."
    )
    join_on: str = Field(
        default="",
        description="The column name on which to join the two dataframes.",
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        df_a = await context.to_pandas(self.dataframe_a)
        df_b = await context.to_pandas(self.dataframe_b)
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )
        df = pd.merge(df_a, df_b, on=self.join_on)
        return await context.from_pandas(df)


class ToTensor(BaseNode):
    """
    Convert a dataframe to a tensor.
    dataframe, tensor
    Outputs a Tensor object.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame, description="The input dataframe."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        df = await context.to_pandas(self.dataframe)
        return Tensor.from_numpy(df.to_numpy())


class FromTensor(BaseNode):
    """
    Convert a tensor to a dataframe.
    dataframe, tensor
    Outputs a new DataFrame.
    """

    tensor: Tensor = Field(
        default=Tensor(),
        description="A tensor object to be converted into a dataframe.",
    )
    columns: list[str] = Field(
        default=[],
        description="A list of strings specifying the column names for the resulting dataframe.",
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        array = self.tensor.to_numpy()
        if array.shape[1] != len(self.columns):
            raise ValueError(
                f"Number of columns in tensor ({array.shape[1]}) does not match number of columns specified ({len(self.columns)})"
            )
        df = pd.DataFrame(array, columns=self.columns)
        return await context.from_pandas(df)


class Plot(BaseNode):
    """
    Plots a dataframe as a line, bar, or scatter plot.
    plot, dataframe, line, bar, scatter
    Outputs an image of the plot.
    """

    class PlotType(str, Enum):
        LINE = "line"
        BAR = "bar"
        SCATTER = "scatter"

    dataframe: DataFrame = Field(
        default_factory=DataFrame, description="The input dataframe."
    )
    x_column: str = Field(
        default="",
        description="The name of the x column to be used in the plot.",
    )
    y_column: str = Field(
        default="",
        description="The name of the y column to be used in the plot.",
    )
    plot_type: PlotType = Field(
        default=PlotType.LINE,
        description="The type of plot to be created. Can be 'line', 'bar', or 'scatter'.",
    )

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


class PlotHistogram(BaseNode):
    """
    Plot a histogram of a dataframe column.
    histogram
    Outputs an image of the histogram.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame, description="The input dataframe."
    )
    column: str = Field(title="Column", default="", description="The column to plot.")

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


class PlotHeatmap(BaseNode):
    """
    Plot a heatmap of a dataframe.
    heatmap
    Outputs a heatmap representation of the input dataframe.
    """

    dataframe: DataFrame = Field(
        default_factory=DataFrame, description="The input dataframe."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.to_pandas(self.dataframe)
        sns.set_theme(style="darkgrid")
        (fig, ax) = plt.subplots()
        sns.heatmap(df, ax=ax)
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class Filter(BaseNode):
    """
    Filter DataFrame based on a condition.
    dataframe, condition, query
    Outputs a DataFrame object that is the result of filtering the input DataFrame based on the given condition.
    """

    df: DataFrame = Field(
        default_factory=DataFrame, description="The DataFrame to filter."
    )
    condition: str = Field(
        default="",
        description="The filtering condition to be applied to the DataFrame, e.g. column_name > 5.",
    )

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.query(self.condition)
        return await context.from_pandas(res)


class DataFrameSort(BaseNode):
    """
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


class DropDuplicates(BaseNode):
    """
    Drop duplicate rows from a DataFrame.
    duplicate, dataframe
    Outputs a DataFrame object with duplicate rows removed.
    """

    df: DataFrame = Field(default_factory=DataFrame, description="The input DataFrame.")

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.drop_duplicates()
        return await context.from_pandas(res)


class DropNA(BaseNode):
    """
    Drop NA values from a DataFrame.
    na, dataframe
    Outputs a DataFrame object with NA values removed.
    """

    df: DataFrame = Field(default_factory=DataFrame, description="The input DataFrame.")

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = await context.to_pandas(self.df)
        res = df.dropna()
        return await context.from_pandas(res)


class IrisDataFrame(BaseNode):
    """
    Load the Iris dataset.
    ml, training, dataset, test
    Outputs a two DataFrames containing the features, targets of the Iris dataset.
    """

    async def process(self, context: ProcessingContext) -> Dataset:
        data = load_iris(as_frame=True)
        assert isinstance(data, Bunch)
        return Dataset(
            data=await context.from_pandas(data.data),
            target=await context.from_pandas(pd.DataFrame(data.target)),
        )
