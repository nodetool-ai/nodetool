from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Append(GraphNode):
    dataframe_a: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='First DataFrame to be appended.')
    dataframe_b: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Second DataFrame to be appended.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Append"



class CSVToDataframe(GraphNode):
    csv_data: str | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='String input of CSV formatted text.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.CSVToDataframe"



class ColumnToList(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input dataframe.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the column to be converted to a list.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ColumnToList"



class Concat(GraphNode):
    dataframe_a: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='First DataFrame to be merged.')
    dataframe_b: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Second DataFrame to be merged.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Concat"



class Create(GraphNode):
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='comma separated list of column names')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Create"



class DataFrameSort(GraphNode):
    df: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description=None)
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to sort the DataFrame by.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.DataFrameSort"



class DropDuplicates(GraphNode):
    df: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input DataFrame.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.DropDuplicates"



class DropNA(GraphNode):
    df: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input DataFrame.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.DropNA"



class Filter(GraphNode):
    df: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The DataFrame to filter.')
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The filtering condition to be applied to the DataFrame, e.g. column_name > 5.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Filter"



class FromTensor(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='A tensor object to be converted into a dataframe.')
    columns: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='A list of strings specifying the column names for the resulting dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.FromTensor"



class IrisDataFrame(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.IrisDataFrame"



class Join(GraphNode):
    dataframe_a: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='First DataFrame to be merged.')
    dataframe_b: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Second DataFrame to be merged.')
    join_on: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column name on which to join the two dataframes.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Join"



class ListToColumn(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='Dataframe object to add a new column to.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the new column to be added to the dataframe.')
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description="A list of any type of elements which will be the new column's values.")
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ListToColumn"



class ListToDataFrame(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of values to be converted.')
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Comma separated list of column names')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ListToDataFrame"


from nodetool.nodes.nodetool.dataframe import PlotType

class Plot(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input dataframe.')
    x_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the x column to be used in the plot.')
    y_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the y column to be used in the plot.')
    plot_type: PlotType | GraphNode | tuple[GraphNode, str] = Field(default=PlotType('line'), description="The type of plot to be created. Can be 'line', 'bar', or 'scatter'.")
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Plot"



class PlotHeatmap(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.PlotHeatmap"



class PlotHistogram(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input dataframe.')
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to plot.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.PlotHistogram"



class Save(GraphNode):
    df: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=DataFrame(type='dataframe', uri='', asset_id=None, columns=None, data=None), description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='output.csv', description='Name of the output file.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.Save"



class SelectColumn(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='a dataframe from which columns are to be selected')
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='comma separated list of column names')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.SelectColumn"



class ToTensor(GraphNode):
    dataframe: DataFrame | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The input dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ToTensor"


