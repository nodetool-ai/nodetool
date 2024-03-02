import ast
from enum import Enum
from functools import reduce
from io import BytesIO, StringIO
from pydantic import Field
from genflow.metadata.types import TextRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode
from typing import Any, Literal


class ListLengthNode(GenflowNode):
    """
    ## List Length Node
    ### Namespace: Core.List.Length

    #### Description
    This node calculates and returns the length of a list.

    The List Length Node is used to determine the number of items or elements present in a list. It can process any type of list, regardless of the data type of the elements or items in the list.

    #### Applications
    - Calculating the number of instances in a dataset for AI model training.
    - Checking the number of user entries in forms for data validation.
    - Determining the quantity of orders for inventory control.

    #### Example
    To use this node, simply add it to your workflow and connect a list to its input. The node will then output the number of elements in the list. For instance, you can connect the output of a "Collect User Data" node to this "List Length" node to calculate how many user entries you have.

    ##### Inputs
    - *values*: list[Any] - The list on which the length is to be calculated.

    ##### Outputs
    - An integer indicating the length or count of the items or elements in the list.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> int:
        return len(self.values)


class RangeNode(GenflowNode):
    """
    ## Range Node
    ### Namespace: Core.List.Range

    #### Description
    Range Node is a node that generates a list of integers within a specified range.

    The node initiates a numerical sequence starting from a certain number (start), ending at another number (stop), and with a specific increment (step) between each number. The output of this node is a list comprising of this numerical sequence.

    #### Applications
    - Creating number sequences: This node is useful for generating a series of numbers within a certain range. For example, it could be used to produce a list of days in a month, list of multiples of 3, etc.

    ##### Inputs
    - 'start': (Type: integer) This field indicates the start of the range.
    - 'stop': (Type: integer) This field indicates the end of the range.
    - 'step': (Type: integer) This field determines the step size or increment between each number in the range.

    ##### Outputs
    - Returns a list containing a sequence of integers based on the specified 'start', 'stop', and 'step' inputs.
    """

    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[int]:
        return list(range(self.start, self.stop, self.step))


class SliceNode(GenflowNode):
    """
    ## Slice List Node
    ### Namespace: Core.List.Slice

    #### Description
    This node extracts a subset or 'slice' of a list.

    The Slice List Node receives a list and returns a portion of this list designated by starting, stopping, and stepping components. The start component indicates the first element to be included in the slice, the stop component marks the end (non-inclusive), and the step component determines the interval between elements in the slice.

    #### Applications
    - Extracting specific data from a larger list.
    - Efficiently reducing the size of a list by selecting every nth element.
    - Gaining quick insights from parts of a large list.

    #### Example
    You have a list of 20 customer reviews, but you only need to analyze every 3rd review starting from the second one up to the 12th review. Use the Slice List Node, set the start to 2, the stop to 12, and the step to 3.

    ##### Inputs
    - **values:** List[Any] - A list of any type of values that is to be sliced.
    - **start:** Int - The starting index where the slice begins.
    - **stop:** Int - The final index position where the slice ends. This element is not included in the slice.
    - **step:** Int - The incremental steps between each value included in the slice.

    ##### Outputs
    - A sliced list based on the defined start, stop, and step parameters. The type of the list elements remains the same as in the input list.
    """

    values: list[Any] = []
    start: int = 0
    stop: int = 0
    step: int = 1

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[self.start : self.stop : self.step]


class SelectNode(GenflowNode):
    """
    ## SelectListNode
    ### Namespace: Core.List.Select

    #### Description
    This node selects specific values from a list.

    The SelectListNode is designed to filter a list by selecting elements at specific indices. Given a list and the indices of the items you want to select, this node will return a new list comprising only of the chosen items.

    #### Applications
    - Data pre-processing: Extracting specific items from a dataset based on their order.
    - Index-based filtering: Removing unnecessary or irrelevant items from a list.

    #### Example
    Consider you have a list of ten items, but you only need the items at odd indices. You can use the SelectListNode to select these items by specifying their indices. You then feed these selected items into another node for further processing.

    ##### Inputs
    - `values`: This is a list of any data type. It's the dataset you want to select items from.
    - `indices`: This is a list of integers. These are the positions or indices of the items you want to select from the `values` list.

    ##### Outputs
    - The output is a list that contains only items selected from `indices`. The data type of the list items remains the same as the input `values` list.
    """

    values: list[Any] = []
    indices: list[int] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return [self.values[index] for index in self.indices]


class IndexNode(GenflowNode):
    """
    ## Index Node
    ### Namespace: Core.List.Index

    #### Description
    The Node is used to retrieve a value from a list.

    This node functions by accessing a specific position, called an index, in a list of elements, allowing you to retrieve the value stored at that location.

    #### Applications
    - Retrieving specific information from a list.
    - Easy navigation of data stored in list format.
    - Selecting individual list items for further processing.

    #### Example
    Let's say you have a list of names and you want to select a specific name from that list. You would use the Access List Node and specify the position of the name you want to select in the 'index' field. Connect the output of the Access List Node to any other node that requires this selected name from your list as input.

    ##### Inputs
    - `values` (List): The list from which to retrieve a value.
    - `index`  (Int): The position in the list from which to retrieve a value. Remember that list positions start at 0, so the first element in your list has an index of 0, the second element has an index of 1, and so on.

    ##### Outputs
    - The value at the specified index in the list. The type of this value will depend on what types of elements are stored in your list.
    """

    values: list[Any] = []
    index: int = 0

    async def process(self, context: ProcessingContext) -> Any:
        return self.values[self.index]


class AppendNode(GenflowNode):
    """
    ## Append Node
    ### Namespace: Core.List.Append

    #### Description
    This node adds a value to the end of a list.

    The Append List Node is tailored for handling list operations, specifically appending values. It holds a list of values and an additional value. When processed, this node appends the additional value to the end of the list, thus elongating the list.

    #### Applications
    - Extending a list: It's used when there's the need to add a single value to the end of a list.
    - Operating lists: It can be part of any workflow that includes operations on lists.

    #### Example
    Let's say you have a list of names and you want to add a new name to that list. You can use the Append List Node to accomplish this. Place the node in your workflow, feed your list and the new name into the node and when processed, the node will output the updated list with the new name added at the end.

    ##### Inputs
    - `values` (type: list): The list that you want to append a value to.
    - `value` (type: Any): The value that you want to append to the list.

    ##### Outputs
    - A list (type: list): This is the output of the node. It comprises of the initial list with the new value appended at the end.
    """

    values: list[Any] = []
    value: Any = None

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.append(self.value)
        return self.values


class ExtendNode(GenflowNode):
    """
    ## Extend Node
    ### Namespace: Core.List.Extend

    #### Description
    This node is designed to extend a list with another list.

    The Extend List Node is used to combine two lists into a single list. It takes two lists as inputs and extends the first list with the elements of the second list. Note, that the order of elements in the resulting list will follow the order of elements in the input lists.

    #### Applications
    - Combining datasets: If you have two lists of data that need to be combined into a single list for processing or analysis, this node can be used.

    #### Example
    Imagine you have two lists of customers - one for the morning shift and one for the evening shift. You want to create a single list of all customers. Drag and drop the Extend List Node into the workflow area. Connect the 'Morning Customer List' node to the 'values' input of the Extend List Node and the 'Evening Customer List' node to the 'other_values' input. The output of the Extend List Node will be a single list that includes both morning and evening customers.

    ##### Inputs
    - values: List of any items. This is the initial list that will be extended.
    - other_values: List of any items. This is the list that will be appended to the initial list.

    ##### Outputs
    - Output: List of any items. This is the combined list of 'values' and 'other_values'.
    """

    values: list[Any] = []
    other_values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        self.values.extend(self.other_values)
        return self.values


class DedupeNode(GenflowNode):
    """
    ## Dedupe Node
    ### Namespace: Core.List.Dedupe

    #### Description
    This node removes duplicate elements from a list.

    The Remove Duplicates Node is designed to process a list in the workflow, and emit a new list that contains only unique elements. It employs hashing (for numerical values and strings) and sorting to eliminate repeated elements. The output is not guaranteed to maintain the order of elements in the original list.

    #### Applications
    - Filtering duplicate items in a data collection: This is useful, for example, when you have collected a list of email addresses and you want to ensure each email address is only listed once.

    #### Example
    1. Connect a Data Input Node filled with a list to Remove Duplicates Node.
    2. Connect the Remove Duplicates Node to a Display Node. Run the workflow.
    3. The Display Node will show the list of unique elements.

    ##### Inputs
    - `values`: A list of any type of values. This is the list from which duplicates will be removed.

    ##### Outputs
    - The output is a list of any type, containing original elements from the input `values`, but with duplicates removed.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return list(set(self.values))


class FilterNode(GenflowNode):
    """
    ## Filter Node
    ### Namespace: Core.List.Filter

    #### Description
    This node filters a list based on a user-provided Python code string.

    The Filter Node provides a flexible way to filter a list of values. Given a list of items and a Python code string as a filtering condition, this node evaluates the condition for each item in the list, and returns a new list only with the items that meet the condition. The filtering condition can take into account the current value and the current index in the list using the syntax {value} and {index} respectively.

    #### Applications
    - Filtering out unnecessary elements from a list based on certain conditions.
    - Creating a subset of a list based on specific criteria.

    #### Example
    Let's say, you have a list of numbers and you want to filter out the even numbers from the list. To achieve this, you would use the Filter List Node with "values" set to your list of numbers and "condition_code" set to "{value} % 2 != 0". The output would be a new list with only the odd numbers.

    ##### Inputs
    - `values`: The list to filter.
    - `condition`: The Python code to use as the filtering condition.

    ##### Outputs
    - **Output (List of Any type)**: A list containing only the elements that meet the condition specified in the "condition_code".
    """

    values: list[Any] = Field(default_factory=list, description="The list to filter.")
    condition: str = Field(
        "", description="The Python code to use as the filtering condition."
    )

    async def process(self, context: ProcessingContext) -> list[Any]:
        def safe_eval(expr: str, value: Any, index: int) -> bool:
            try:
                return eval(ast.literal_eval(expr.format(value=value, index=index)))
            except (ValueError, SyntaxError):
                return False

        return [
            value
            for (index, value) in enumerate(self.values)
            if safe_eval(self.condition, value, index)
        ]


class ReduceNode(GenflowNode):
    """
    ## Reduce Node
    ### Namespace: Core.List.Reduce

    #### Description
    The Reduce Node is designed to perform reduction operation on a list using user-provided Python code.

    The purpose of the node is to simplify list reductions by providing a flexible interface for the operation. The user can specify the Python code to be used for reduction, allowing more complex operations than are usually possible with standard reduction functions.

    While the node uses code strings, the syntax and variables supported are straightforward. Two variables are included which can be used in the code: `value`, representing the current value in the list, and `acc`, standing for the accumulator value. These variables can be referred in the code string as `{value}` and `{acc}` respectively.

    #### Applications
    - Reduce a list of numbers to their sum or product.
    - Reduce a list of texts to a single text by concatenation.
    - Reduce any general list based on a custom function specified through Python code.

    #### Example
    Suppose you need to sum a list of numbers provided from another node.
    - Connect the other node's output to this node's `values` input.
    - Set the `reduction_code` input as "{acc} + {value}".
    - Leave `initial_value` input as None unless you have a specific initial value.
    The Reduce List Node will then output the sum of all values in the list.

    #### Inputs
    - `values` (List): The list to perform the reduction on.
    - `initial_value` (Any type, optional): The starting value for the reduction. If it's not provided, the first value in the list will be used.
    - `reduction_code` (String): The Python code string to be used to perform the reduction operation.

    #### Outputs
    - The output of the node is the result of the reduction operation on the list. The type of the output depends on the types of the values in the list and the reduction operation.
    """

    values: list[Any] = Field(default_factory=list, description="The list to reduce.")
    initial_value: Any = Field(
        None,
        description="The initial value for the reduction. If not provided, the first value in the list is used.",
    )
    reduction_code: str = Field(
        "", description="The Python code to use for the reduction."
    )

    async def process(self, context: ProcessingContext) -> Any:
        def safe_eval(expr: str, value: Any, acc: Any) -> Any:
            try:
                return eval(ast.literal_eval(expr.format(value=value, acc=acc)))
            except (ValueError, SyntaxError):
                return acc

        return reduce(
            (lambda acc, value: safe_eval(self.reduction_code, value, acc)),
            self.values,
            (
                self.initial_value
                if (self.initial_value is not None)
                else self.values[0]
            ),
        )


class MapNode(GenflowNode):
    """
    ## MapListNode
    ### Namespace: Core.List.Map

    #### Description
    This node allows mapping of a list using user-specified Python code.

    It works by receiving a list and a piece of Python code for mapping. The node then applies the input code to each element of the list. The Python code can include two variables: `value`, which stands for the current value in the list, and `index`, representing the current index in the list. Remember to wrap these variable names in brackets, i.e., '{value}' and '{index}', when you write your code.

    #### Applications
    - Performing a custom operation on each element of a list.
    - Generating a new list derived from an existing list by applying custom logic.
    - Implement scenarios where the list elements need to be manipulated based on their index.

    #### Example
    Imagine you have a list of numbers and you want to create a new list where each number is multiplied by its index in the original list. You would:

    1. Provide the numbers list to the 'values' field.
    2. Write the Python code: '{value} * {index}', and feed it into the 'map_code' field.

    The MapListNode would then output a new list with each value being the original value multiplied by its index.

    ##### Inputs
    - `values`: List of any elements that is to be mapped.
    - `map_code`: Python code that defines the mapping operation.

    ##### Outputs
    - Outputs the resultant list after mapping the input list with the provided Python code.
    """

    values: list[Any] = Field(default_factory=list, description="The list to map.")
    code: str = Field("", description="The Python code to use for the mapping.")

    async def process(self, context: ProcessingContext) -> list[Any]:
        def safe_eval(expr: str, value: Any, index: int) -> Any:
            try:
                return eval(ast.literal_eval(expr.format(value=value, index=index)))
            except (ValueError, SyntaxError):
                return value

        return [
            safe_eval(self.code, value, index)
            for (index, value) in enumerate(self.values)
        ]


class ReverseNode(GenflowNode):
    """
    ## Reverse Node
    ### Namespace: Core.List.Reverse

    #### Description
    This node reverses a list.

    This node is specifically designed for list manipulation. It reads a list and returns the elements in reverse order. This might be useful in various operations where list orders need to be inverted.

    #### Applications
    - Reversing the order of data sequences.
    - Modifying lists to meet desired expectations.

    #### Example
    Assume you have a list of tasks that needs to be performed in reverse order. You can use the Reverse List node in your workflow. Connect it with a list input node where you introduce your list and then connect its output to a display or any further processing node.

    ##### Inputs
    - `values`: This is a list of any type of items that needs to be reversed.

    ##### Outputs
    - The output of this node is a reversed list of the `values` input.
    """

    values: list[Any] = []

    async def process(self, context: ProcessingContext) -> list[Any]:
        return self.values[::(-1)]


class SaveListNode(GenflowNode):
    """
    ## Save List Node
    ### Namespace: Core.List.Save

    #### Description
    This node saves a list to a text file.
    Each item in the list is saved on a separate line.
    The Save List Node is designed to save a list to a file. It takes a list and a file path as inputs and saves the list to the specified file path. The file path can be either a local path or a cloud path. The node can save any type of list.

    #### Applications
    - Saving data to a file for later use.
    - Saving data to a file for sharing with others.

    #### Inputs
    - `values`: A list of any type of values. This is the list that will be saved to the file.
    - `name`: A string. This is the name of the file to be saved.
    """

    values: list[Any] = Field(default_factory=list, description="The list to save.")
    name: str = Field(title="Name", default="text.txt")

    async def process(self, context: ProcessingContext) -> TextRef:
        values = "\n".join([str(value) for value in self.values])
        asset, s3_uri = await context.create_asset(
            name=self.name, content_type="text/plain", content=BytesIO(values.encode())
        )
        return TextRef(uri=s3_uri, asset_id=asset.id)
