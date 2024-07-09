from enum import EnumMeta
from types import UnionType
from pydantic import BaseModel, Field
from pydantic.fields import FieldInfo

from typing import Any, Type
from nodetool.types.graph import Edge
from nodetool.common.environment import Environment
from nodetool.metadata.type_metadata import TypeMetadata
from nodetool.metadata.types import NameToType, TypeToName
from nodetool.metadata import (
    is_assignable,
)
from nodetool.metadata.types import (
    OutputSlot,
    is_output_type,
)

from nodetool.metadata.utils import (
    is_dict_type,
    is_enum_type,
    is_list_type,
    is_optional_type,
    is_union_type,
)

from nodetool.workflows.run_job_request import RunJobRequest

"""
This module defines the core components and functionality for nodes in a workflow graph system.
It includes base classes for nodes, special node types, and utility functions for node management.

Key components:
- BaseNode: The foundational class for all node types
- InputNode and OutputNode: Special nodes for workflow inputs and outputs
- Comment and Preview: Utility nodes for annotations and data preview
- GroupNode: A container node for subgraphs
- Functions for node registration, retrieval, and metadata handling

This module is essential for constructing and managing complex computational graphs in the workflow system.
"""

NODE_BY_TYPE: dict[str, type["BaseNode"]] = {}
NODES_BY_CLASSNAME: dict[str, list[type["BaseNode"]]] = {}

log = Environment.get_logger()


def add_node_classname(node_class: type["BaseNode"]) -> None:
    """
    Register a node class by its class name in the NODES_BY_CLASSNAME dictionary.

    Args:
        node_class (type["BaseNode"]): The node class to be registered.

    Note:
        If the node class has a 'comfy_class' attribute, it uses that as the class name.
        Otherwise, it uses the actual class name.
    """
    if hasattr(node_class, "comfy_class") and node_class.comfy_class != "":  # type: ignore
        class_name = node_class.comfy_class  # type: ignore
    else:
        class_name = node_class.__name__

    if class_name not in NODES_BY_CLASSNAME:
        NODES_BY_CLASSNAME[class_name] = []

    NODES_BY_CLASSNAME[class_name].append(node_class)


def add_node_type(node_class: type["BaseNode"]) -> None:
    """
    Add a node type to the registry.

    Args:
        node_type (str): The node_type of the node.
        node_class (type[Node]): The class of the node.
    """
    node_type = node_class.get_node_type()

    NODE_BY_TYPE[node_type] = node_class
    add_node_classname(node_class)


def type_metadata(python_type: Type | UnionType) -> TypeMetadata:
    """
    Generate TypeMetadata for a given Python type.

    Args:
        python_type (Type | UnionType): The Python type to generate metadata for.

    Returns:
        TypeMetadata: Metadata describing the structure and properties of the input type.

    Raises:
        ValueError: If the input type is unknown or unsupported.

    Note:
        Supports basic types, lists, dicts, optional types, unions, and enums.
    """
    # if type is unkonwn, return the type as a string
    if python_type in TypeToName:
        return TypeMetadata(type=TypeToName[python_type])
    elif is_list_type(python_type):
        return TypeMetadata(
            type="list",
            type_args=[type_metadata(python_type.__args__[0])],  # type: ignore
        )
    elif is_dict_type(python_type):
        return TypeMetadata(
            type="dict",
            type_args=[type_metadata(t) for t in python_type.__args__],  # type: ignore
        )
    # check optional type before union type as optional is a union of None and the type
    elif is_optional_type(python_type):
        res = type_metadata(python_type.__args__[0])
        res.optional = True
        return res
    elif is_union_type(python_type):
        return TypeMetadata(
            type="union",
            type_args=[type_metadata(t) for t in python_type.__args__],  # type: ignore
        )
    elif is_enum_type(python_type):
        assert not isinstance(python_type, UnionType)
        type_name = f"{python_type.__module__}.{python_type.__name__}"
        return TypeMetadata(
            type="enum",
            type_name=type_name,
            values=[e.value for e in python_type.__members__.values()],  # type: ignore
        )
    else:
        raise ValueError(f"Unknown type: {python_type}")


class BaseNode(BaseModel):
    """
    The foundational class for all nodes in the workflow graph.

    Attributes:
        _id (str): Unique identifier for the node.
        _parent_id (str | None): Identifier of the parent node, if any.
        _ui_properties (dict[str, Any]): UI-specific properties for the node.
        _requires_capabilities (list[str]): Capabilities required by the node.
        _visible (bool): Whether the node is visible in the UI.
        _primary_field (str | None): The primary field for the node, if any.
        _secondary_field (str | None): The secondary field for the node, if any.
        _layout (str): The layout style for the node in the UI.

    Methods:
        Includes methods for initialization, property management, metadata generation,
        type checking, and node processing.
    """

    _id: str = ""
    _parent_id: str | None = ""
    _ui_properties: dict[str, Any] = {}
    _requires_capabilities: list[str] = []
    _visible: bool = True
    _primary_field: str | None = None
    _secondary_field: str | None = None
    _layout: str = "default"

    def __init__(
        self,
        id: str = "",
        parent_id: str | None = None,
        ui_properties: dict[str, Any] = {},
        **data: Any,
    ):
        super().__init__(**data)
        self._id = id
        self._parent_id = parent_id
        self._ui_properties = ui_properties

    @classmethod
    def is_visible(cls):
        return cls._visible.default  # type: ignore

    @classmethod
    def requires_capabilities(cls):
        return cls._requires_capabilities.default  # type: ignore

    @classmethod
    def primary_field(cls):
        return cls._primary_field.default  # type: ignore

    @classmethod
    def secondary_field(cls):
        return cls._secondary_field.default  # type: ignore

    @classmethod
    def layout(cls):
        return cls._layout.default  # type: ignore

    @property
    def id(self):
        return self._id

    @property
    def parent_id(self):
        return self._parent_id

    def has_parent(self):
        return self._parent_id is not None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self._id,
            "parent_id": self._parent_id,
            "type": self.get_node_type(),
            "data": self.node_properties(),
        }

    @classmethod
    def __init_subclass__(cls):
        """
        This method is called when a subclass of this class is created.
        We remember the mapping of the subclass to its type name,
        so that we can use it later to create instances of the subclass from the type name.
        """
        super().__init_subclass__()
        add_node_type(cls)
        for field_type in cls.__annotations__.values():
            if is_enum_type(field_type):
                name = f"{field_type.__module__}.{field_type.__name__}"
                NameToType[name] = field_type

    @staticmethod
    def from_dict(node: dict[str, Any], skip_errors: bool = False) -> "BaseNode":
        """
        Create a Node object from a dictionary representation.

        Args:
            node (dict[str, Any]): The dictionary representing the Node.

        Returns:
            Node: The created Node object.
        """
        # avoid circular import

        node_type = get_node_class(node["type"])
        if node_type is None:
            raise ValueError(f"Invalid node type: {node['type']}")
        if "id" not in node:
            raise ValueError("Node must have an id")
        n = node_type(
            id=node["id"],
            parent_id=node.get("parent_id"),
            ui_properties=node.get("ui_properties", {}),
        )
        data = node.get("data", {})
        n.set_node_properties(data, skip_errors=skip_errors)
        return n

    @classmethod
    def get_node_type(cls) -> str:
        """
        Get the unique type identifier for the node class.

        Returns:
            str: A string in the format "namespace.ClassName" where "Node" suffix is removed if present.
        """

        class_name = cls.__name__
        if class_name.endswith("Node"):
            class_name = class_name[:-4]

        return cls.get_namespace() + "." + class_name

    @classmethod
    def get_namespace(cls) -> str:
        """
        Get the namespace of the node class.

        Returns:
            str: The module path of the class, excluding the "nodetool.nodes." prefix.
        """

        return cls.__module__.replace("nodetool.nodes.", "")

    @classmethod
    def get_title(cls) -> str:
        """
        Returns the node title.
        """
        class_name = cls.__name__
        if class_name.endswith("Node"):
            return class_name[:-4]
        else:
            return class_name

    @classmethod
    def get_description(cls) -> str:
        """
        Returns the node description.
        """
        text = cls.__doc__ or ""
        return text.strip()

    @classmethod
    def metadata(cls: Type["BaseNode"]):
        """
        Generate comprehensive metadata for the node class.

        Returns:
            NodeMetadata: An object containing all metadata about the node,
            including its properties, outputs, and other relevant information.
        """
        # avoid circular import
        from nodetool.metadata.node_metadata import NodeMetadata

        return NodeMetadata(
            title=cls.get_title(),
            description=cls.get_description(),
            namespace=cls.get_namespace(),
            node_type=cls.get_node_type(),
            properties=cls.properties(),  # type: ignore
            outputs=cls.outputs(),
            model_info=cls.model_info(),
            primary_field=cls.primary_field(),
            secondary_field=cls.secondary_field(),
            layout=cls.layout(),
        )

    @classmethod
    def get_json_schema(cls):
        """
        Returns a JSON schema for the node.
        Used as tool description for agents.
        """
        return {
            "type": "object",
            "properties": {
                prop.name: prop.get_json_schema() for prop in cls.properties()
            },
        }

    def assign_property(self, name: str, value: Any):
        """
        Assign a value to a node property, performing type checking and conversion.

        Args:
            name (str): The name of the property to assign.
            value (Any): The value to assign to the property.

        Raises:
            ValueError: If the value is not assignable to the property type.

        Note:
            This method handles type conversion for enums, lists, and objects with 'model_validate' method.
        """
        prop = self.find_property(name)
        python_type = prop.type.get_python_type()
        type_args = prop.type.type_args

        if not is_assignable(prop.type, value):
            raise ValueError(
                f"[{self.__class__.__name__}] Invalid value for property `{name}`: {value} (expected {prop.type})"
            )

        if prop.type.is_enum_type():
            v = python_type(value)
        elif prop.type.is_list_type() and len(type_args) == 1:
            subtype = prop.type.type_args[0].get_python_type()
            if hasattr(subtype, "model_validate"):
                v = [subtype.model_validate(x) for x in value]
            else:
                v = value
        elif hasattr(python_type, "model_validate"):
            v = python_type.model_validate(value)
        else:
            v = value

        setattr(self, name, v)

    def set_node_properties(
        self, properties: dict[str, Any], skip_errors: bool = False
    ):
        """
        Set multiple node properties at once.

        Args:
            properties (dict[str, Any]): A dictionary of property names and their values.
            skip_errors (bool, optional): If True, continue setting properties even if an error occurs. Defaults to False.

        Raises:
            ValueError: If skip_errors is False and an error occurs while setting a property.

        Note:
            Errors during property assignment are printed regardless of the skip_errors flag.
        """
        for name, value in properties.items():
            try:
                self.assign_property(name, value)
            except ValueError as e:
                print(f"{self.__class__} Error setting property {name}: {e}")
                if not skip_errors:
                    raise e

    @classmethod
    def is_assignable(cls, name: str, value: Any) -> bool:
        """
        Check if a value can be assigned to a specific property of the node.

        Args:
            name (str): The name of the property to check.
            value (Any): The value to check for assignability.

        Returns:
            bool: True if the value can be assigned to the property, False otherwise.
        """
        return is_assignable(cls.find_property(name).type, value)

    @classmethod
    def find_property(cls, name: str):
        """
        Find a property of the node by its name.

        Args:
            name (str): The name of the property to find.

        Returns:
            Property: The found property object.

        Raises:
            ValueError: If no property with the given name exists.
        """
        if name not in cls.properties_dict():
            raise ValueError(f"Property {name} does not exist")
        return cls.properties_dict()[name]

    @classmethod
    def find_output(cls, name: str) -> OutputSlot:
        """
        Find an output slot of the node by its name.

        Args:
            name (str): The name of the output to find.

        Returns:
            OutputSlot: The found output slot.

        Raises:
            ValueError: If no output with the given name exists.
        """
        for output in cls.outputs():
            if output.name == name:
                return output

        raise ValueError(f"Output {name} does not exist")

    @classmethod
    def find_output_by_index(cls, index: int) -> OutputSlot:
        """
        Find an output slot of the node by its index.

        Args:
            index (int): The index of the output to find.

        Returns:
            OutputSlot: The found output slot.

        Raises:
            ValueError: If the index is out of range for the node's outputs.
        """
        if index < 0 or index >= len(cls.outputs()):
            raise ValueError(f"Output index {index} does not exist for {cls}")
        return cls.outputs()[index]

    @classmethod
    def is_streaming_output(cls):
        """
        Check if the node has any streaming outputs.

        Returns:
            bool: True if any of the node's outputs are marked for streaming, False otherwise.
        """
        return any(output.stream for output in cls.outputs())

    @classmethod
    def return_type(cls) -> Type | dict[str, Type] | None:
        """
        Get the return type of the node's process function.

        Returns:
            Type | dict[str, Type] | None: The return type annotation of the process function,
            or None if no return type is specified.
        """
        type_hints = cls.process.__annotations__

        if "return" not in type_hints:
            return None

        return type_hints["return"]

    @classmethod
    def outputs(cls):
        """
        Get the output slots of the node based on its return type.

        Returns:
            list[OutputSlot]: A list of OutputSlot objects representing the node's outputs.

        Raises:
            ValueError: If the return type is invalid or cannot be processed.

        Note:
            This method handles different return type structures including dictionaries,
            custom output types, and single return values.
        """
        return_type = cls.return_type()

        if return_type is None:
            return []

        try:
            if type(return_type) is dict:
                return [
                    OutputSlot(
                        type=type_metadata(field_type),
                        name=field,
                    )
                    for field, field_type in return_type.items()
                ]
            elif is_output_type(return_type):
                types = return_type.__annotations__
                return [
                    OutputSlot(
                        type=type_metadata(types[field]),
                        name=field,
                    )
                    for field in return_type.model_fields  # type: ignore
                ]
            else:
                return [OutputSlot(type=type_metadata(return_type), name="output")]  # type: ignore
        except ValueError as e:
            raise ValueError(
                f"Invalid return type for node {cls.__name__}: {return_type} ({e})"
            )

    @classmethod
    def model_info(cls):
        """
        Returns the model info for the node.
        """
        return {}

    @classmethod
    def field_types(cls):
        """
        Returns the input slots of the node.
        """
        types = cls.__annotations__
        super_types = (
            cls.__base__.field_types() if hasattr(cls.__base__, "field_types") else {}  # type: ignore
        )
        return {**super_types, **types}

    @classmethod
    def inherited_fields(cls) -> dict[str, FieldInfo]:
        """
        Returns the input slots of the node.
        """
        fields = {name: field for name, field in cls.model_fields.items()}
        super_fields = (
            cls.__base__.inherited_fields()  # type: ignore
            if hasattr(cls.__base__, "inherited_fields")
            else {}
        )
        return {**super_fields, **fields}

    @classmethod
    def properties(cls):
        """
        Returns the input slots of the node.
        """
        # avoid circular import
        from nodetool.workflows.property import Property

        types = cls.field_types()
        fields = cls.inherited_fields()
        return [
            Property.from_field(name, type_metadata(types[name]), field)
            for name, field in fields.items()
        ]

    @classmethod
    def properties_dict(cls):
        """
        Returns the input slots of the node.
        """
        if not hasattr(cls, "__props__"):
            cls.__props__ = {prop.name: prop for prop in cls.properties()}
        return cls.__props__

    def node_properties(self):
        return {prop.name: getattr(self, prop.name) for prop in self.properties()}

    async def convert_output(self, context: Any, output: Any) -> Any:
        if type(self.return_type()) is dict:
            return output
        elif is_output_type(self.return_type()):
            return output.model_dump()
        else:
            return {"output": output}

    async def pre_process(self, context: Any) -> Any:
        """
        Pre-process the node before processing.
        This will be called before cache key is computed.
        Default implementation generates a seed for any field named seed.
        """
        for prop in self.properties():
            if "seed" in prop.name:
                setattr(self, prop.name, context.get("seed", 0))

    async def process(self, context: Any) -> Any:
        """
        Implement the node's primary functionality.

        This method should be overridden by subclasses to define the node's behavior.

        Args:
            context (Any): The context in which the node is being processed.

        Returns:
            Any: The result of the node's processing.
        """
        pass


class InputNode(BaseNode):
    """
    A special node type representing an input to the workflow.

    Attributes:
        label (str): A human-readable label for the input.
        name (str): The parameter name for this input in the workflow.
        description (str): A detailed description of the input.
    """

    label: str = Field("Input Label", description="The label for this input node.")
    name: str = Field("", description="The parameter name for the workflow.")
    description: str = Field("", description="The description for this input node.")

    @classmethod
    def is_visible(cls):
        return cls is not InputNode


class OutputNode(BaseNode):
    """
    A special node type representing an output from the workflow.

    Attributes:
        label (str): A human-readable label for the output.
        name (str): The parameter name for this output in the workflow.
        description (str): A detailed description of the output.
    """

    label: str = Field(
        default="Output Label", description="The label for this output node."
    )
    name: str = Field("", description="The parameter name for the workflow.")
    description: str = Field(
        default="", description="The description for this output node."
    )

    @classmethod
    def is_visible(cls):
        return cls is not OutputNode


class Comment(BaseNode):
    """
    A utility node for adding comments or annotations to the workflow graph.

    Attributes:
        comment (list[Any]): The content of the comment, stored as a list of elements.
    """

    headline: str = Field("", description="The headline for this comment.")
    comment: list[Any] = Field(default=[""], description="The comment for this node.")
    comment_color: str = Field(
        default="#f0f0f0", description="The color for the comment."
    )
    _visible: bool = False


class Preview(BaseNode):
    """
    A utility node for previewing data within the workflow graph.

    Attributes:
        value (Any): The value to be previewed.
    """

    value: Any = Field(None, description="The value to preview.")
    name: str = Field("", description="The name of the preview node.")
    _visible: bool = False

    async def process(self, context: Any) -> Any:
        return self.value


def get_node_class_by_name(class_name: str) -> list[type[BaseNode]]:
    """
    Retrieve node classes based on their class name.

    Args:
        class_name (str): The name of the node class to retrieve.

    Returns:
        list[type[BaseNode]]: A list of node classes matching the given name.

    Note:
        If no exact match is found, it attempts to find a match by removing hyphens from the class name.
    """
    if not class_name in NODES_BY_CLASSNAME:
        class_name = class_name.replace("-", "")
    return NODES_BY_CLASSNAME.get(class_name, [])


def get_node_class(node_type: str) -> type[BaseNode] | None:
    """
    Retrieve a node class based on its unique node type identifier.

    Args:
        node_type (str): The node type identifier.

    Returns:
        type[BaseNode] | None: The node class if found, None otherwise.
    """
    if node_type in NODE_BY_TYPE:
        return NODE_BY_TYPE[node_type]
    else:
        return None


def get_registered_node_classes() -> list[type[BaseNode]]:
    """
    Retrieve all registered and visible node classes.

    Returns:
        list[type[BaseNode]]: A list of all registered node classes that are marked as visible.
    """
    return [c for c in NODE_BY_TYPE.values() if c.is_visible()]


def requires_capabilities(nodes: list[BaseNode]):
    """
    Determine the set of capabilities required by a list of nodes.

    Args:
        nodes (list[BaseNode]): A list of nodes to check for required capabilities.

    Returns:
        list[str]: A list of unique capability strings required by the input nodes.
    """
    capabilities = set()
    for node in nodes:
        for cap in node.requires_capabilities():
            capabilities.add(cap)
    return list(capabilities)


def requires_capabilities_from_request(req: RunJobRequest):
    """
    Determine the set of capabilities required by nodes in a RunJobRequest.

    Args:
        req (RunJobRequest): The job request containing a graph of nodes.

    Returns:
        list[str]: A list of unique capability strings required by the nodes in the request.

    Raises:
        ValueError: If a node type in the request is not registered.
    """
    assert req.graph is not None, "Graph is required"
    capabilities = set()
    for node in req.graph.nodes:
        node_class = get_node_class(node.type)
        if node_class is None:
            raise ValueError(f"Node class not found: {node.type}")
        for cap in node_class.requires_capabilities():
            capabilities.add(cap)
    return list(capabilities)


class GroupNode(BaseNode):
    """
    A special node type that can contain a subgraph of nodes.

    This node type allows for hierarchical structuring of workflows.
    """

    pass
