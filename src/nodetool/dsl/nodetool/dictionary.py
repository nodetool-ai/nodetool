from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class ArgMax(GraphNode):
    """
    Returns the label associated with the highest value in a dictionary.
    dictionary, maximum, label, argmax

    Use cases:
    - Get the most likely class from classification probabilities
    - Find the category with highest score
    - Identify the winner in a voting/ranking system
    """

    scores: dict[str, float] | GraphNode | tuple[GraphNode, str] = Field(default={}, description='Dictionary mapping labels to their corresponding scores/values')

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ArgMax"



class Combine(GraphNode):
    """
    Merges two dictionaries, with second dictionary values taking precedence.
    dictionary, merge, update, +, add, concatenate

    Use cases:
    - Combine default and custom configurations
    - Merge partial updates with existing data
    - Create aggregate data structures
    """

    dict_a: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    dict_b: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Combine"



class Filter(GraphNode):
    """
    Creates a new dictionary with only specified keys from the input.
    dictionary, filter, select

    Use cases:
    - Extract relevant fields from a larger data structure
    - Implement data access controls
    - Prepare specific data subsets for processing
    """

    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    keys: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Filter"



class GetValue(GraphNode):
    """
    Retrieves a value from a dictionary using a specified key.
    dictionary, get, value, key

    Use cases:
    - Access a specific item in a configuration dictionary
    - Retrieve a value from a parsed JSON object
    - Extract a particular field from a data structure
    """

    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    default: Any | GraphNode | tuple[GraphNode, str] = Field(default=None, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.GetValue"



class MakeDictionary(GraphNode):
    """
    Creates a simple dictionary with up to three key-value pairs.
    dictionary, create, simple

    Use cases:
    - Create configuration entries
    - Initialize simple data structures
    - Build basic key-value mappings
    """


    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.MakeDictionary"



class ParseJSON(GraphNode):
    """
    Parses a JSON string into a Python dictionary.
    json, parse, dictionary

    Use cases:
    - Process API responses
    - Load configuration files
    - Deserialize stored data
    """

    json_string: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ParseJSON"


import nodetool.nodes.nodetool.dictionary

class ReduceDictionaries(GraphNode):
    """
    Reduces a list of dictionaries into one dictionary based on a specified key field.
    dictionary, reduce, aggregate

    Use cases:
    - Aggregate data by a specific field
    - Create summary dictionaries from list of records
    - Combine multiple data points into a single structure
    """

    ConflictResolution: typing.ClassVar[type] = nodetool.nodes.nodetool.dictionary.ReduceDictionaries.ConflictResolution
    dictionaries: list[dict[str, Any]] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='List of dictionaries to be reduced')
    key_field: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The field to use as the key in the resulting dictionary')
    value_field: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional field to use as the value. If not specified, the entire dictionary (minus the key field) will be used as the value.')
    conflict_resolution: nodetool.nodes.nodetool.dictionary.ReduceDictionaries.ConflictResolution = Field(default=ConflictResolution.FIRST, description='How to handle conflicts when the same key appears multiple times')

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.ReduceDictionaries"



class Remove(GraphNode):
    """
    Removes a key-value pair from a dictionary.
    dictionary, remove, delete

    Use cases:
    - Delete a specific configuration option
    - Remove sensitive information before processing
    - Clean up temporary entries in a data structure
    """

    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    key: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Remove"



class Update(GraphNode):
    """
    Updates a dictionary with new key-value pairs.
    dictionary, add, update

    Use cases:
    - Extend a configuration with additional settings
    - Add new entries to a cache or lookup table
    - Merge user input with existing data
    """

    dictionary: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    new_pairs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Update"



class Zip(GraphNode):
    """
    Creates a dictionary from parallel lists of keys and values.
    dictionary, create, zip

    Use cases:
    - Convert separate data columns into key-value pairs
    - Create lookups from parallel data structures
    - Transform list data into associative arrays
    """

    keys: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    values: list[Any] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)

    @classmethod
    def get_node_type(cls): return "nodetool.dictionary.Zip"


