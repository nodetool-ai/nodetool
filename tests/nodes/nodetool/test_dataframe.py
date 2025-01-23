import pytest
import pandas as pd
import numpy as np
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import (
    ColumnDef,
    DataframeRef,
    FolderRef,
)
from nodetool.nodes.lib.data.pandas.dataframe import (
    SaveDataframe,
    SelectColumn,
    ExtractColumn,
    FormatAsText,
    AddColumn,
    FromList,
    ImportCSV,
    MergeSideBySide,
    CombineVertically,
    Join,
    ConvertToTensor,
    Chart,
    Histogram,
    Heatmap,
    Filter,
    FindOneRow,
    SortByColumn,
    RemoveDuplicates,
    RemoveIncompleteRows,
)


df = DataframeRef(
    columns=[
        ColumnDef(name="a", data_type="int"),
        ColumnDef(name="b", data_type="int"),
    ],
    data=[
        [1, 4],
        [2, 5],
        [3, 6],
    ],
)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "node",
    [
        SaveDataframe(df=df, folder=FolderRef(), name="test.csv"),
        SelectColumn(dataframe=df, columns="a"),
        ExtractColumn(dataframe=df, column_name="a"),
        FormatAsText(dataframe=df, template="{a}"),
        AddColumn(dataframe=df, column_name="c", values=[7, 8, 9]),
        FromList(values=[{"a": 1, "b": 4}, {"a": 2, "b": 5}, {"a": 3, "b": 6}]),
        ImportCSV(csv_data="a,b\n1,4\n2,5\n3,6"),
        MergeSideBySide(dataframe_a=df, dataframe_b=df),
        CombineVertically(dataframe_a=df, dataframe_b=df),
        Join(dataframe_a=df, dataframe_b=df, join_on="a"),
        ConvertToTensor(dataframe=df),
        Chart(dataframe=df, x_column="a", y_column="b"),
        Histogram(dataframe=df, column="a"),
        Heatmap(dataframe=df),
        Filter(df=df, condition="a > 1"),
        FindOneRow(df=df, condition="a == 2"),
        SortByColumn(df=df, column="a"),
        RemoveDuplicates(df=df),
        RemoveIncompleteRows(df=df),
    ],
)
async def test_dataframe_node(context: ProcessingContext, node: BaseNode):
    try:
        await node.process(context)
    except Exception as e:
        pytest.fail(f"Error processing {node}: {str(e)}")
