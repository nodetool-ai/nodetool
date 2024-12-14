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
from nodetool.metadata.types import DataframeRef
from nodetool.metadata.types import ImageRef
from nodetool.workflows.base_node import BaseNode
from typing import Any, Literal
from nodetool.metadata.types import Dataset


class SaveDataframe(BaseNode):
    """
    Save dataframe in specified folder.
    csv, folder, save

    Use cases:
    - Export processed data for external use
    - Create backups of dataframes
    """

    df: DataframeRef = DataframeRef()
    folder: FolderRef = Field(
        default=FolderRef(), description="Name of the output folder."
    )
    name: str = Field(default="output.csv", description="Name of the output file.")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        parent_id = self.folder.asset_id if self.folder.is_set() else None
        return await context.dataframe_from_pandas(df, self.name, parent_id)


class SelectColumn(BaseNode):
    """
    Select specific columns from dataframe.
    dataframe, columns, filter

    Use cases:
    - Extract relevant features for analysis
    - Reduce dataframe size by removing unnecessary columns
    - Prepare data for specific visualizations or models
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(),
        description="a dataframe from which columns are to be selected",
    )
    columns: str = Field("", description="comma separated list of column names")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        columns = self.columns.split(",")
        df = await context.dataframe_to_pandas(self.dataframe)
        return await context.dataframe_from_pandas(df[columns])  # type: ignore


class ExtractColumn(BaseNode):
    """
    Convert dataframe column to list.
    dataframe, column, list

    Use cases:
    - Extract data for use in other processing steps
    - Prepare column data for plotting or analysis
    - Convert categorical data to list for encoding
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
    )
    column_name: str = Field(
        default="", description="The name of the column to be converted to a list."
    )

    async def process(self, context: ProcessingContext) -> list[Any]:
        df = await context.dataframe_to_pandas(self.dataframe)
        return df[self.column_name].tolist()


class FormatAsText(BaseNode):
    """
    Convert dataframe rows to formatted strings.
    dataframe, string, format

    Use cases:
    - Generate text summaries from row data
    - Prepare data for natural language processing
    - Create custom string representations of rows
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
    )
    template: str = Field(
        default="",
        description="The template for the string representation. Each column can be referenced by {column_name}.",
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        df = await context.dataframe_to_pandas(self.dataframe)
        return [self.template.format(**row) for _, row in df.iterrows()]


class AddColumn(BaseNode):
    """
    Add list of values as new column to dataframe.
    dataframe, column, list

    Use cases:
    - Incorporate external data into existing dataframe
    - Add calculated results as new column
    - Augment dataframe with additional features
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(),
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

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.dataframe)
        df[self.column_name] = self.values
        return await context.dataframe_from_pandas(df)


class FromList(BaseNode):
    """
    Convert list of dicts to dataframe.
    list, dataframe, convert

    Use cases:
    - Transform list data into structured dataframe
    - Prepare list data for analysis or visualization
    - Convert API responses to dataframe format
    """

    values: list[Any] = Field(
        title="Values",
        default=[],
        description="List of values to be converted, each value will be a row.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        rows = []
        for value in self.values:
            if not isinstance(value, dict):
                raise ValueError("List must contain dicts.")
            row = {}
            for k, v in value.items():
                if type(v) == dict:
                    row[k] = v["value"]
                elif type(v) in [int, float, str, bool]:
                    row[k] = v
                else:
                    row[k] = str(v)
            rows.append(row)
        df = pd.DataFrame(rows)
        return await context.dataframe_from_pandas(df)


class ImportCSV(BaseNode):
    """
    Convert CSV string to dataframe.
    csv, dataframe, import

    Use cases:
    - Import CSV data from string input
    - Convert CSV responses from APIs to dataframe
    """

    csv_data: str = Field(
        default="", title="CSV Data", description="String input of CSV formatted text."
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = pd.read_csv(StringIO(self.csv_data))
        return await context.dataframe_from_pandas(df)


class MergeSideBySide(BaseNode):
    """
    Merge two dataframes along columns.
    merge, concat, columns

    Use cases:
    - Combine data from multiple sources
    - Add new features to existing dataframe
    - Merge time series data from different periods
    """

    dataframe_a: DataframeRef = Field(
        default=DataframeRef(), description="First DataFrame to be merged."
    )
    dataframe_b: DataframeRef = Field(
        default=DataframeRef(), description="Second DataFrame to be merged."
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df_a = await context.dataframe_to_pandas(self.dataframe_a)
        df_b = await context.dataframe_to_pandas(self.dataframe_b)
        df = pd.concat([df_a, df_b], axis=1)
        return await context.dataframe_from_pandas(df)


class CombineVertically(BaseNode):
    """
    Append two dataframes along rows.
    append, concat, rows

    Use cases:
    - Combine data from multiple time periods
    - Merge datasets with same structure
    - Aggregate data from different sources
    """

    dataframe_a: DataframeRef = Field(
        default=DataframeRef(), description="First DataFrame to be appended."
    )
    dataframe_b: DataframeRef = Field(
        default=DataframeRef(), description="Second DataFrame to be appended."
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df_a = await context.dataframe_to_pandas(self.dataframe_a)
        df_b = await context.dataframe_to_pandas(self.dataframe_b)

        # Handle empty dataframes
        if df_a.empty:
            return await context.dataframe_from_pandas(df_b)
        if df_b.empty:
            return await context.dataframe_from_pandas(df_a)

        # Check column compatibility only if both dataframes are non-empty
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )

        df = pd.concat([df_a, df_b], axis=0)
        return await context.dataframe_from_pandas(df)


class Join(BaseNode):
    """
    Join two dataframes on specified column.
    join, merge, column

    Use cases:
    - Combine data from related tables
    - Enrich dataset with additional information
    - Link data based on common identifiers
    """

    dataframe_a: DataframeRef = Field(
        default=DataframeRef(), description="First DataFrame to be merged."
    )
    dataframe_b: DataframeRef = Field(
        default=DataframeRef(), description="Second DataFrame to be merged."
    )
    join_on: str = Field(
        default="",
        description="The column name on which to join the two dataframes.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df_a = await context.dataframe_to_pandas(self.dataframe_a)
        df_b = await context.dataframe_to_pandas(self.dataframe_b)
        if not df_a.columns.equals(df_b.columns):
            raise ValueError(
                f"Columns in dataframe A ({df_a.columns}) do not match columns in dataframe B ({df_b.columns})"
            )
        df = pd.merge(df_a, df_b, on=self.join_on)
        return await context.dataframe_from_pandas(df)


class ConvertToTensor(BaseNode):
    """
    Convert dataframe to tensor.
    dataframe, tensor, convert

    Use cases:
    - Prepare data for deep learning models
    - Enable tensor operations on dataframe data
    - Convert tabular data to multidimensional format
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
    )

    async def process(self, context: ProcessingContext) -> Tensor:
        df = await context.dataframe_to_pandas(self.dataframe)
        return Tensor.from_numpy(df.to_numpy())


class Chart(BaseNode):
    """
    Create line, bar, or scatter plot from dataframe.
    plot, visualization, dataframe

    Use cases:
    - Visualize trends in time series data
    - Compare values across categories
    - Explore relationships between variables
    """

    class PlotType(str, Enum):
        LINE = "line"
        BAR = "bar"
        SCATTER = "scatter"

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
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
        df = await context.dataframe_to_pandas(self.dataframe)
        if self.x_column not in df.columns:  # type: ignore
            raise ValueError(f"Invalid x_column: {self.x_column}")
        if self.y_column not in df.columns:  # type: ignore
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


class Histogram(BaseNode):
    """
    Plot histogram of dataframe column.
    histogram, plot, distribution

    Use cases:
    - Visualize distribution of continuous data
    - Identify outliers and data patterns
    - Compare data distributions across categories
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
    )
    column: str = Field(title="Column", default="", description="The column to plot.")

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.dataframe_to_pandas(self.dataframe)
        if self.column not in df.columns:
            raise ValueError(f"Invalid column: {self.column}")
        (fig, ax) = plt.subplots()
        sns.set_theme(style="darkgrid")
        sns.histplot(df[self.column], ax=ax)  # type: ignore
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class Heatmap(BaseNode):
    """
    Create heatmap visualization of dataframe.
    heatmap, plot, correlation

    Use cases:
    - Visualize correlation between variables
    - Identify patterns in multi-dimensional data
    - Display intensity of values across categories
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe."
    )

    async def process(self, context: ProcessingContext) -> ImageRef:
        df = await context.dataframe_to_pandas(self.dataframe)
        sns.set_theme(style="darkgrid")
        (fig, ax) = plt.subplots()
        sns.heatmap(df, ax=ax)
        img_bytes = io.BytesIO()
        fig.savefig(img_bytes, format="png")
        plt.close(fig)
        return await context.image_from_bytes(img_bytes.getvalue())


class Filter(BaseNode):
    """
    Filter dataframe based on condition.
    filter, query, condition

    Example conditions:
    age > 30
    age > 30 and salary < 50000
    name == 'John Doe'
    100 <= price <= 200
    status in ['Active', 'Pending']
    not (age < 18)

    Use cases:
    - Extract subset of data meeting specific criteria
    - Remove outliers or invalid data points
    - Focus analysis on relevant data segments
    """

    df: DataframeRef = Field(
        default=DataframeRef(), description="The DataFrame to filter."
    )
    condition: str = Field(
        default="",
        description="The filtering condition to be applied to the DataFrame, e.g. column_name > 5.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        res = df.query(self.condition)
        return await context.dataframe_from_pandas(res)


class FindOneRow(BaseNode):
    """
    Find the first row in a dataframe that matches a given condition.
    filter, query, condition, single row

    Example conditions:
    age > 30
    age > 30 and salary < 50000
    name == 'John Doe'
    100 <= price <= 200
    status in ['Active', 'Pending']
    not (age < 18)

    Use cases:
    - Retrieve specific record based on criteria
    - Find first occurrence of a particular condition
    - Extract single data point for further analysis
    """

    df: DataframeRef = Field(
        default=DataframeRef(), description="The DataFrame to search."
    )
    condition: str = Field(
        default="",
        description="The condition to filter the DataFrame, e.g. 'column_name == value'.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        result = df.query(self.condition).head(1)
        return await context.dataframe_from_pandas(result)


class SortByColumn(BaseNode):
    """
    Sort dataframe by specified column.
    sort, order, column

    Use cases:
    - Arrange data in ascending or descending order
    - Identify top or bottom values in dataset
    - Prepare data for rank-based analysis
    """

    df: DataframeRef = Field(default=DataframeRef())
    column: str = Field(default="", description="The column to sort the DataFrame by.")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        res = df.sort_values(self.column)
        return await context.dataframe_from_pandas(res)


class RemoveDuplicates(BaseNode):
    """
    Remove duplicate rows from dataframe.
    duplicates, unique, clean

    Use cases:
    - Clean dataset by removing redundant entries
    - Ensure data integrity in analysis
    - Prepare data for unique value operations
    """

    df: DataframeRef = Field(default=DataframeRef(), description="The input DataFrame.")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        res = df.drop_duplicates()
        return await context.dataframe_from_pandas(res)


class RemoveIncompleteRows(BaseNode):
    """
    Remove rows with NA values from dataframe.
    na, missing, clean

    Use cases:
    - Clean dataset by removing incomplete entries
    - Prepare data for analysis requiring complete cases
    - Improve data quality for modeling
    """

    df: DataframeRef = Field(default=DataframeRef(), description="The input DataFrame.")

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.df)
        res = df.dropna()
        return await context.dataframe_from_pandas(res)


class LoadIrisDataset(BaseNode):
    """
    Load Iris dataset as dataframe.
    iris, dataset, machine learning

    Use cases:
    - Practice machine learning techniques
    - Benchmark classification algorithms
    - Demonstrate data analysis workflows
    """

    async def process(self, context: ProcessingContext) -> Dataset:
        data = load_iris(as_frame=True)
        assert isinstance(data, Bunch)
        return Dataset(
            data=await context.dataframe_from_pandas(data.data),
            target=await context.dataframe_from_pandas(pd.DataFrame(data.target)),
        )


class Slice(BaseNode):
    """
    Slice a dataframe by rows using start and end indices.
    slice, subset, rows

    Use cases:
    - Extract a specific range of rows from a large dataset
    - Create training and testing subsets for machine learning
    - Analyze data in smaller chunks
    """

    dataframe: DataframeRef = Field(
        default=DataframeRef(), description="The input dataframe to be sliced."
    )
    start_index: int = Field(
        default=0, description="The starting index of the slice (inclusive)."
    )
    end_index: int = Field(
        default=-1,
        description="The ending index of the slice (exclusive). Use -1 for the last row.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = await context.dataframe_to_pandas(self.dataframe)

        if self.end_index == -1:
            self.end_index = len(df)

        sliced_df = df.iloc[self.start_index : self.end_index]
        return await context.dataframe_from_pandas(sliced_df)
