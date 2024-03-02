from typing import Any, Literal
import pandas as pd
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import DataFrame
from genflow.workflows.genflow_node import GenflowNode


class AccessDictNode(GenflowNode):
    "## Access Dictionary Node\n### Namespace: Core.Dictionary\n\n#### Description\nThis node is designed to retrieve a specific value from a dictionary.\n\nThe Access Dictionary Node receives a dictionary and a key as inputs, then returns the value associated with the key from the dictionary. This simple yet functional task is fundamental for accessing and using data stored in dictionary format.\n\n#### Applications\n- Finding specific information in a dataset by using the key associated with it.\n- Retrieving a user's specific details from a larger collection of user data.\n- Extracting a particular feature from a machine learning model's parameters.\n  \n#### Example\nImagine you have a dictionary of customer data with keys as customer IDs and values as their data. If you want to access a particular customer's data, the Access Dictionary Node will do that for you. \nFirst, you feed the customer data dictionary to this node. Then, provide the system with the customer ID (key). The node will return the data associated with that key, and you can then use it in the next step of your workflow.\n\n##### Inputs\n- `dictionary`: A python dictionary from which you want to retrieve data. The dictionary consists of key, value pairs.\n- `key`: The key assigned to the value that you want to extract from the dictionary.\n\n##### Outputs\n- `Value`: The value associated with the chosen key from the dictionary."
    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> Any:
        return self.dictionary[self.key]


class UpdateDictNode(GenflowNode):
    "## Update Dictionary Node\n### Namespace: Core.Dictionary\n\n#### Description\nThe Update Dictionary Node is designed to update a dictionary object with new key-value pairs. \n\nThis node takes in an existing dictionary and a set of new key-value pairs, then updates the dictionary with these new pairs. This comes in particularly handy when you need to dynamically update the data in your AI workflow. \n\n#### Applications\n- Updating configuration settings: You can use this node to incrementally adjust the configuration settings of a process in real-time as more information becomes available.\n- Updating user profiles: In a system where user profiles are stored as dictionaries, the Update Dictionary Node can be used to add or update user information.\n\n#### Example\nImagine a workflow where you have a dictionary object representing a user profile on a website. You then want to add a feature where users can add or change their location. You would use the Update Dictionary Node to add the new \"location\" key-value pair to the existing user profile dictionary.\n\n##### Inputs\n- 'dictionary': A dictionary that you want to update. It's a container that holds pairs of data in 'key: value' format.\n- 'new_pairs': A dictionary containing the new key-value pairs that you want to add to the 'dictionary'.\n\n##### Outputs\n- The output is the updated dictionary, which now includes the new key-value pairs."
    dictionary: dict[(str, Any)] = {}
    new_pairs: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        self.dictionary.update(self.new_pairs)
        return self.dictionary


class DeleteDictNode(GenflowNode):
    "## Delete Dictionary Node\n### Namespace: Core.Dictionary\n\n#### Description\n\nThis node deletes a specific key-value pair from a dictionary.\n\nThe purpose of this node is to allow selective removal of data from a given dictionary. It works by specifying the key of the item you want to remove and then directly removing this item from the dictionary. Note that this operation is permanent and cannot be undone.\n\n#### Applications\n- Data Cleaning: Deleting unnecessary or irrelevant data from your dataset.\n- Dictionaries Modification: Refined modification of dictionaries before further data processing.\n\n#### Example\n\nA workflow may involve retrieving a dictionary containing user data, but the dictionary contains excess data that is not relevant to the current analysis. In this scenario, Delete Dictionary Node could be used to remove these irrelevant key-value pairs from the dictionary.\n\n##### Inputs\n- Dictionary: The original dictionary from which you wish to remove a key-value pair, expressed as a key-value pairs (dict).\n- Key: The key of the specific key-value pair you wish to remove from the dictionary, denoted as a string.\n\n##### Outputs\n- Dictionary: The updated dictionary, once the specified key-value pair has been deleted.\n\nRemember, the specified key must exist in the dictionary initially."
    dictionary: dict[(str, Any)] = {}
    key: str = ""

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        del self.dictionary[self.key]
        return self.dictionary


class CreateDictNode(GenflowNode):
    "## Create Dictionary Node\n### Namespace: Core.Dictionary\n\n#### Description\nThis node generates a dictionary from a list of strings.\n\nThe Create Dictionary Node is designed to combine two lists of any data type, one representing keys and another representing values, into a dictionary. The purpose of this node is to provide an easy way to build a dictionary structure which is useful in various data handling operations. This node pairs each key from the 'keys' list with a corresponding value from the 'values' list, based on their positions in the lists.\n\n#### Applications\n- Constructing dictionaries for data organization\n- Creating lookup tables for quick data referencing\n- Converting two related lists into a dictionary for easy data manipulation\n\n#### Example\nSuppose you have two lists: one is a list of names and the other is a list of phone numbers. You can use the Create Dictionary Node to pair each name with the corresponding phone number to form a dictionary which can serve as a phone book.\n\n##### Inputs\n- `keys`: A list that serves as keys for the dictionary. It can contain any data type.\n- `values`: A list that serves as values for the dictionary. It can contain any data type.\n\n##### Outputs\n- The output of the node is a dictionary where each key from the 'keys' list is paired with a corresponding value from the 'values' list. The dictionary can have keys and values of any data type."
    keys: list[Any] = []
    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> dict[(Any, Any)]:
        return dict(zip(self.keys, self.values))


class MergeDictsNode(GenflowNode):
    "## Merge Dictionaries Node\n### Namespace: Core.Dictionary\n\n#### Description\nThis node merges two dictionaries into one.\n\nThe Merge Dictionaries Node is a tool for combining two sets of data, each represented as a dictionary. Dictionaries contain key-value pairs. This node takes two dictionaries as inputs and produces a new dictionary that contains the combined key-value pairs from both input dictionaries. If the same key is present in both dictionaries, the value from the second dictionary will replace the value from the first.\n\n#### Applications\n- Integrating data from multiple sources into a single usable structure.\n- Overwriting default configuration options with user-provided ones.\n\n#### Example\nSuppose we have data about student grades from two different sources, each represented as a dictionary. We can use the Merge Dictionaries Node to combine these two dictionaries into one, which now contains the data from both sources.\n\n##### Inputs\n- dict_a: This field represents the first input dictionary. It contains key-value pairs of any type.\n- dict_b: This field represents the second input dictionary. It contains key-value pairs of any type.\n\n##### Outputs\n- The output of this node is a new dictionary that contains the combined key-value pairs from dict_a and dict_b."
    dict_a: dict[(str, Any)] = {}
    dict_b: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {**self.dict_a, **self.dict_b}


class SelectDictKeysNode(GenflowNode):
    "## Select Dictionary Keys Node\n### Namespace: Core.Dictionary\n\n#### Description\nThis node selects specified keys from a provided dictionary.\n\nThe node's chief aim is to filter a dictionary based on a list of specified keys that you provide. It's a useful tool for extracting and focusing on certain elements within a dictionary. \n\n#### Applications\n- Extracting relevant data from a large dictionary, and ignoring the unnecessary details.\n- Reducing a complex dictionary into a simpler structure by picking out specific keys.\n\n#### Example\nImagine you have a dictionary with personnel details, and you only need info about 'name' and 'designation'. Just use this node, input the whole dictionary and specify the keys 'name' and 'designation'.\n\n##### Inputs\n- `dictionary`: A dictionary from which you want to select keys. It can contain any type of values.\n- `keys`: A list of the keys that you want to extract from the dictionary. \n\n##### Outputs\n- Returns a new dictionary that includes only the keys you selected from the input dictionary."
    dictionary: dict[(str, Any)] = {}
    keys: list[str] = []

    async def process(self, context: ProcessingContext) -> dict[(str, Any)]:
        return {key: self.dictionary[key] for key in self.keys}


class DictToDataframeNode(GenflowNode):
    "## DictToDataframe Node\n### Namespace: Core.Dictionary\n\n#### Description\nThis node transforms a dictionary into a dataframe.\n\nThe DictToDataframe Node is intended to convert dictionary data into a more visual and organized format, namely, a dataframe. The ability to convert dictionary data into a dataframe facilitates data manipulation and exploration, and aids in preparing data for visual representation or further processing. \n\n#### Applications\n- Converting dictionary data into a table format for ease of understanding.\n- Preparing raw data for visualization or further data processing steps.\n- Making dictionary data compatible with other nodes or software that require input in dataframe format. \n\n#### Example\nSuppose you have a dictionary containing the recent temperature data and you want to provide this data to a node that accepts a dataframe as input. You would use the DictToDataframe Node to convert the temperature data from the dictionary into a dataframe, which can then be passed to the next node for further processing.\n\n##### Inputs\n- **dictionary**: dict[(str, Any)] - The dictionary to be converted into a dataframe.\n\n##### Outputs\n- DataFrame containing the data converted from the dictionary into tabular format."
    dictionary: dict[(str, Any)] = {}

    async def process(self, context: ProcessingContext) -> DataFrame:
        df = pd.DataFrame([self.model_dump()])
        return await context.from_pandas(df)
