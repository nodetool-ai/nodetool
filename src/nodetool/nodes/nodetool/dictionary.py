import json
from typing import Any, Literal
import pandas as pd
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataframeRef
from nodetool.workflows.base_node import BaseNode


class Access(BaseNode):
    """
    Retrieves a specific value from a dictionary using a key.
    dictionary, dict, select, get, value, access, key
    """

    _layout = "small"
    _primary_field = "key"

    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> Any:
        return self.dictionary[self.key]


class Update(BaseNode):
    """
    Updates a dictionary with one or more new key-value pairs.
    dictionary, dict, add, insert
    """

    _layout = "small"
    _primary_field = "new_pairs"

    dictionary: dict[(str, Any)] = {}
    new_pairs: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        self.dictionary.update(self.new_pairs)
        return self.dictionary


class Delete(BaseNode):
    """
    Removes a key-value pair from a dictionary based on the specified key.
    dictionary, dict, remove
    """

    _layout = "small"
    _primary_field = "key"

    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        del self.dictionary[self.key]
        return self.dictionary


class DictFromJson(BaseNode):
    """
    Converts a JSON string into a dictionary.
    dictionary, json, parse
    """

    _layout = "small"

    json_string: str = ""

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        res = json.loads(self.json_string)
        if not isinstance(res, dict):
            raise ValueError("Input JSON is not a dictionary")
        return res


class DictFromList(BaseNode):
    """
    Generates a dictionary by pairing lists of keys and values.
    dictionary, create, keys, values
    """

    _layout = "small"

    keys: list[Any] = []
    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> dict[Any, Any]:
        return dict(zip(self.keys, self.values))


class Merge(BaseNode):
    """
    Combines two dictionaries into one. Note: Values from the second input override duplicates.
    dictionary, merge, combine
    """

    _layout = "small"

    dict_a: dict[(str, Any)] = {}
    dict_b: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {**self.dict_a, **self.dict_b}


class SelectKeys(BaseNode):
    """
    Filters a dictionary to include only specified keys.
    dictionary, keys, filter
    """

    dictionary: dict[(str, Any)] = {}
    keys: list[str] = []

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {key: self.dictionary[key] for key in self.keys}


class DictToDataframe(BaseNode):
    """
    Converts a dictionary into a dataframe, each value in the dictionary becomes a column.
    dictionary, dataframe, pandas
    """

    _layout = "small"

    dictionary: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = pd.DataFrame([self.model_dump()])
        return await context.dataframe_from_pandas(df)


class RowsToDataframe(BaseNode):
    """
    Converts a list of dictionaries into a dataframe, each dictionary becomes a row.
    dictionary, dataframe, pandas
    """

    _layout = "small"

    rows: list[dict[(str, Any)]] = []

    async def process(self, context: ProcessingContext) -> DataframeRef:
        df = pd.DataFrame(self.rows)
        return await context.dataframe_from_pandas(df)
