from typing import Any, Literal
import pandas as pd
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import DataFrame
from nodetool.workflows.base_node import BaseNode


class Access(BaseNode):
    """
    Retrieves a specific value from a dictionary using a key.
    dictionary, dict, select, get, value, access, key
    Returns the value associated with the specified key from the input dictionary.
    """

    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> Any:
        return self.dictionary[self.key]


class Update(BaseNode):
    """
    Updates a dictionary with one or more new key-value pairs.
    dictionary, dict, add, insert
    Outputs the updated dictionary, including the newly added key-value pairs.
    """

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

    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        del self.dictionary[self.key]
        return self.dictionary


class Create(BaseNode):
    """
    Generates a dictionary by pairing lists of keys and values.
    dictionary, create, keys, values
    Outputs a new dictionary constructed from the provided keys and values.
    """

    keys: list[Any] = []
    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> dict[(Any, Any)]:
        return dict(zip(self.keys, self.values))


class Merge(BaseNode):
    """
    Combines two dictionaries into one.
    dictionary, merge, combine
    Outputs a new dictionary that merges the contents of two input dictionaries. Note: Values from the second input override duplicates.
    """

    dict_a: dict[(str, Any)] = {}
    dict_b: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {**self.dict_a, **self.dict_b}


class SelectKeys(BaseNode):
    """
    Filters a dictionary to include only specified keys.
    dictionary, keys, filter
    Returns a new dictionary containing only the selected keys from the input dictionary.
    """

    dictionary: dict[(str, Any)] = {}
    keys: list[str] = []

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {key: self.dictionary[key] for key in self.keys}


class DictToDataframe(BaseNode):
    """
    Converts a dictionary into a dataframe
    dictionary, dataframe, pandas
    Outputs a dataframe created from the input dictionary.
    """

    dictionary: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = pd.DataFrame([self.model_dump()])
        return await context.from_pandas(df)
