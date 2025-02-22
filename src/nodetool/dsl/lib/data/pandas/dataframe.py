from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddColumn(GraphNode):
    """
    Add list of values as new column to dataframe.
    dataframe, column, list

    Use cases:
    - Incorporate external data into existing dataframe
    - Add calculated results as new column
    - Augment dataframe with additional features
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='Dataframe object to add a new column to.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the new column to be added to the dataframe.')
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description="A list of any type of elements which will be the new column's values.")

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.AddColumn"


import nodetool.nodes.lib.data.pandas.dataframe

class Chart(GraphNode):
    """
    Create line, bar, or scatter plot from dataframe.
    plot, visualization, dataframe

    Use cases:
    - Visualize trends in time series data
    - Compare values across categories
    - Explore relationships between variables
    """

    PlotType: typing.ClassVar[type] = nodetool.nodes.lib.data.pandas.dataframe.Chart.PlotType
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')
    x_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the x column to be used in the plot.')
    y_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the y column to be used in the plot.')
    plot_type: nodetool.nodes.lib.data.pandas.dataframe.Chart.PlotType = Field(default=PlotType.LINE, description="The type of plot to be created. Can be 'line', 'bar', or 'scatter'.")

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Chart"



class CombineVertically(GraphNode):
    """
    Append two dataframes along rows.
    append, concat, rows

    Use cases:
    - Combine data from multiple time periods
    - Merge datasets with same structure
    - Aggregate data from different sources
    """

    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='First DataFrame to be appended.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='Second DataFrame to be appended.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.CombineVertically"



class ConvertToTensor(GraphNode):
    """
    Convert dataframe to tensor.
    dataframe, tensor, convert

    Use cases:
    - Prepare data for deep learning models
    - Enable tensor operations on dataframe data
    - Convert tabular data to multidimensional format
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.ConvertToTensor"



class ExtractColumn(GraphNode):
    """
    Convert dataframe column to list.
    dataframe, column, list

    Use cases:
    - Extract data for use in other processing steps
    - Prepare column data for plotting or analysis
    - Convert categorical data to list for encoding
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the column to be converted to a list.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.ExtractColumn"



class Filter(GraphNode):
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

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The DataFrame to filter.')
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The filtering condition to be applied to the DataFrame, e.g. column_name > 5.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Filter"



class FindOneRow(GraphNode):
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

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The DataFrame to search.')
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="The condition to filter the DataFrame, e.g. 'column_name == value'.")

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.FindOneRow"



class FormatAsText(GraphNode):
    """
    Convert dataframe rows to formatted strings.
    dataframe, string, format

    Use cases:
    - Generate text summaries from row data
    - Prepare data for natural language processing
    - Create custom string representations of rows
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')
    template: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The template for the string representation. Each column can be referenced by {column_name}.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.FormatAsText"



class FromList(GraphNode):
    """
    Convert list of dicts to dataframe.
    list, dataframe, convert

    Use cases:
    - Transform list data into structured dataframe
    - Prepare list data for analysis or visualization
    - Convert API responses to dataframe format
    """

    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of values to be converted, each value will be a row.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.FromList"



class Heatmap(GraphNode):
    """
    Create heatmap visualization of dataframe.
    heatmap, plot, correlation

    Use cases:
    - Visualize correlation between variables
    - Identify patterns in multi-dimensional data
    - Display intensity of values across categories
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Heatmap"



class Histogram(GraphNode):
    """
    Plot histogram of dataframe column.
    histogram, plot, distribution

    Use cases:
    - Visualize distribution of continuous data
    - Identify outliers and data patterns
    - Compare data distributions across categories
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to plot.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Histogram"



class ImportCSV(GraphNode):
    """
    Convert CSV string to dataframe.
    csv, dataframe, import

    Use cases:
    - Import CSV data from string input
    - Convert CSV responses from APIs to dataframe
    """

    csv_data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='String input of CSV formatted text.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.ImportCSV"



class JSONToDataframe(GraphNode):
    """
    Transforms a JSON string into a pandas DataFrame.
    json, dataframe, conversion

    Use cases:
    - Converting API responses to tabular format
    - Preparing JSON data for analysis or visualization
    - Structuring unstructured JSON data for further processing
    """

    text: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.JSONToDataframe"



class Join(GraphNode):
    """
    Join two dataframes on specified column.
    join, merge, column

    Use cases:
    - Combine data from related tables
    - Enrich dataset with additional information
    - Link data based on common identifiers
    """

    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='First DataFrame to be merged.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='Second DataFrame to be merged.')
    join_on: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column name on which to join the two dataframes.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Join"



class MapTemplate(GraphNode):
    """
    Maps a template string over dataframe rows using Jinja2 templating.
    dataframe, template, format, string

    Use cases:
    - Format each row into a custom string representation
    - Generate text summaries from structured data
    - Create formatted output from dataframe records

    Example:
    Template: "Name: {{ name }}, Age: {{ age|default('unknown') }}"
    Row: {"name": "Alice", "age": 30}
    Output: "Name: Alice, Age: 30"

    Available filters:
    - truncate(length): Truncates text to given length
    - upper: Converts text to uppercase
    - lower: Converts text to lowercase
    - title: Converts text to title case
    - trim: Removes whitespace from start/end
    - replace(old, new): Replaces substring
    - default(value): Sets default if value is undefined
    - first: Gets first character/item
    - last: Gets last character/item
    - length: Gets length of string/list
    - sort: Sorts list
    - join(delimiter): Joins list with delimiter
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe.')
    template: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Template string with Jinja2 placeholders matching column names \n        (e.g., {{ column_name }}). Supports filters like {{ value|upper }}, {{ value|truncate(20) }}.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.MapTemplate"



class MergeSideBySide(GraphNode):
    """
    Merge two dataframes along columns.
    merge, concat, columns

    Use cases:
    - Combine data from multiple sources
    - Add new features to existing dataframe
    - Merge time series data from different periods
    """

    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='First DataFrame to be merged.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='Second DataFrame to be merged.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.MergeSideBySide"



class RemoveDuplicates(GraphNode):
    """
    Remove duplicate rows from dataframe.
    duplicates, unique, clean

    Use cases:
    - Clean dataset by removing redundant entries
    - Ensure data integrity in analysis
    - Prepare data for unique value operations
    """

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input DataFrame.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.RemoveDuplicates"



class RemoveIncompleteRows(GraphNode):
    """
    Remove rows with NA values from dataframe.
    na, missing, clean

    Use cases:
    - Clean dataset by removing incomplete entries
    - Prepare data for analysis requiring complete cases
    - Improve data quality for modeling
    """

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input DataFrame.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.RemoveIncompleteRows"



class SaveDataframe(GraphNode):
    """
    Save dataframe in specified folder.
    csv, folder, save

    Use cases:
    - Export processed data for external use
    - Create backups of dataframes
    """

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, data=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='output.csv', description='\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        ')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.SaveDataframe"



class SelectColumn(GraphNode):
    """
    Select specific columns from dataframe.
    dataframe, columns, filter

    Use cases:
    - Extract relevant features for analysis
    - Reduce dataframe size by removing unnecessary columns
    - Prepare data for specific visualizations or models
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='a dataframe from which columns are to be selected')
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='comma separated list of column names')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.SelectColumn"



class Slice(GraphNode):
    """
    Slice a dataframe by rows using start and end indices.
    slice, subset, rows

    Use cases:
    - Extract a specific range of rows from a large dataset
    - Create training and testing subsets for machine learning
    - Analyze data in smaller chunks
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe to be sliced.')
    start_index: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='The starting index of the slice (inclusive).')
    end_index: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='The ending index of the slice (exclusive). Use -1 for the last row.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.Slice"



class SortByColumn(GraphNode):
    """
    Sort dataframe by specified column.
    sort, order, column

    Use cases:
    - Arrange data in ascending or descending order
    - Identify top or bottom values in dataset
    - Prepare data for rank-based analysis
    """

    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description=None)
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to sort the DataFrame by.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.SortByColumn"



class ToList(GraphNode):
    """
    Convert dataframe to list of dictionaries.
    dataframe, list, convert

    Use cases:
    - Convert dataframe data for API consumption
    - Transform data for JSON serialization
    - Prepare data for document-based storage
    """

    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, data=None, columns=None), description='The input dataframe to convert.')

    @classmethod
    def get_node_type(cls): return "lib.data.pandas.dataframe.ToList"


