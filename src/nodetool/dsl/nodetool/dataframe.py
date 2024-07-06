from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AddNewDataColumn(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='Dataframe object to add a new column to.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the new column to be added to the dataframe.')
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description="A list of any type of elements which will be the new column's values.")
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.AddNewDataColumn"



class CombineDataVertically(GraphNode):
    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='First DataFrame to be appended.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='Second DataFrame to be appended.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.CombineDataVertically"



class ConvertListToTable(GraphNode):
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of values to be converted, each value will be a row.')
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Comma separated list of column names')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ConvertListToTable"



class ConvertTensorToTable(GraphNode):
    tensor: Tensor | GraphNode | tuple[GraphNode, str] = Field(default=Tensor(type='tensor', value=[], dtype=None), description='A tensor object to be converted into a dataframe.')
    columns: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='A list of strings specifying the column names for the resulting dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ConvertTensorToTable"



class ConvertToTensorFormat(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ConvertToTensorFormat"


from nodetool.nodes.nodetool.dataframe import PlotType

class CreateChart(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    x_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the x column to be used in the plot.')
    y_column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the y column to be used in the plot.')
    plot_type: PlotType | GraphNode | tuple[GraphNode, str] = Field(default=PlotType('line'), description="The type of plot to be created. Can be 'line', 'bar', or 'scatter'.")
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.CreateChart"



class CreateHeatmapVisualization(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.CreateHeatmapVisualization"



class CreateHistogramVisualization(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to plot.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.CreateHistogramVisualization"



class ExtractColumnData(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    column_name: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The name of the column to be converted to a list.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ExtractColumnData"



class FilterDataRows(GraphNode):
    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The DataFrame to filter.')
    condition: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The filtering condition to be applied to the DataFrame, e.g. column_name > 5.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.FilterDataRows"



class FormatRowsAsText(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input dataframe.')
    template: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The template for the string representation. Each column can be referenced by {column_name}.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.FormatRowsAsText"



class ImportCSVData(GraphNode):
    csv_data: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='String input of CSV formatted text.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.ImportCSVData"



class JoinTables(GraphNode):
    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='First DataFrame to be merged.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='Second DataFrame to be merged.')
    join_on: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column name on which to join the two dataframes.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.JoinTables"



class LoadIrisDataset(GraphNode):
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.LoadIrisDataset"



class MergeDataSideBySide(GraphNode):
    dataframe_a: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='First DataFrame to be merged.')
    dataframe_b: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='Second DataFrame to be merged.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.MergeDataSideBySide"



class RemoveDuplicateEntries(GraphNode):
    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input DataFrame.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.RemoveDuplicateEntries"



class RemoveIncompleteRows(GraphNode):
    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='The input DataFrame.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.RemoveIncompleteRows"



class SaveDataframe(GraphNode):
    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description=None)
    folder: FolderRef | GraphNode | tuple[GraphNode, str] = Field(default=FolderRef(type='folder', uri='', asset_id=None, temp_id=None), description='Name of the output folder.')
    name: str | GraphNode | tuple[GraphNode, str] = Field(default='output.csv', description='Name of the output file.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.SaveDataframe"



class SelectColumn(GraphNode):
    dataframe: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description='a dataframe from which columns are to be selected')
    columns: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='comma separated list of column names')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.SelectColumn"



class SortDataByColumn(GraphNode):
    df: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, temp_id=None, columns=None, data=None), description=None)
    column: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The column to sort the DataFrame by.')
    @classmethod
    def get_node_type(cls): return "nodetool.dataframe.SortDataByColumn"


