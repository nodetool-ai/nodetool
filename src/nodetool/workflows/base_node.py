from pydantic import BaseModel, Field, PrivateAttr
from pydantic.fields import FieldInfo

from typing import Any, Type
from nodetool.api.types.graph import Edge
from nodetool.common.environment import Environment
from nodetool.metadata.types import NameToType, TypeToName
from nodetool.metadata import (
    is_assignable,
)
from nodetool.metadata.types import (
    OutputSlot,
    TypeMetadata,
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


NODE_BY_TYPE: dict[str, type["BaseNode"]] = {}
NODES_BY_CLASSNAME: dict[str, list[type["BaseNode"]]] = {}

log = Environment.get_logger()


def add_node_classname(node_class: type["BaseNode"]) -> None:
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


def type_metadata(python_type: Type) -> TypeMetadata:
    """
    Returns the metadata for a type.
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
    elif is_union_type(python_type):
        return TypeMetadata(
            type="union",
            type_args=[type_metadata(t) for t in python_type.__args__],  # type: ignore
        )
    elif is_enum_type(python_type):
        # hacky...
        NameToType[python_type.__name__] = python_type
        return TypeMetadata(
            type="enum",
            type_name=python_type.__name__,
            values=[e.value for e in python_type],
        )
    elif is_optional_type(python_type):
        res = type_metadata(python_type.__args__[0])  # type: ignore
        res.optional = True
        return res
    else:
        raise ValueError(f"Unknown type: {python_type}")


class BaseNode(BaseModel):
    """
    A node is a single unit of computation in a graph.
    It has a unique ID and a type.
    Each node class implements its own processing function,
    which is called when the node is evaluated.
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

    @classmethod
    def __init_subclass__(cls):
        """
        This method is called when a subclass of this class is created.
        We remember the mapping of the subclass to its type name,
        so that we can use it later to create instances of the subclass from the type name.
        """
        super().__init_subclass__()
        add_node_type(cls)

    @staticmethod
    def from_dict(node: dict[str, Any]):
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
        return node_type(
            id=node["id"],
            parent_id=node.get("parent_id"),
            ui_properties=node.get("ui_properties", {}),
            **node.get("data", {}),
        )

    @classmethod
    def get_node_type(cls) -> str:
        """
        Returns the node type.
        """

        class_name = cls.__name__
        if class_name.endswith("Node"):
            class_name = class_name[:-4]

        return cls.get_namespace() + "." + class_name

    @classmethod
    def get_namespace(cls) -> str:
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
        Sets the value of a property.
        """
        prop = self.find_property(name)

        if prop.type.is_enum_type():
            try:
                v = prop.type.get_python_type()(value)
            except ValueError:
                log.warn(
                    f"[{self.get_node_type()}] Invalid value for property `{name}`: {value} (expected {prop.type})"
                )
                return

        elif not is_assignable(prop.type, value):
            raise ValueError(
                f"[{self.__class__.__name__}] Invalid value for property `{name}`: {value} (expected {prop.type})"
            )
        elif hasattr(prop.type.get_python_type(), "model_validate"):
            v = prop.type.get_python_type().model_validate(value)  # type: ignore
        else:
            v = value

        setattr(self, name, v)

    def set_node_properties(
        self, properties: dict[str, Any], skip_errors: bool = False
    ):
        """
        Sets the values of multiple properties.
        """
        for name, value in properties.items():
            try:
                self.assign_property(name, value)
            except ValueError as e:
                if not skip_errors:
                    raise e

    @classmethod
    def is_assignable(cls, name: str, value: Any) -> bool:
        """
        Returns True if the value can be assigned to the property.
        """
        return is_assignable(cls.find_property(name).type, value)

    @classmethod
    def find_property(cls, name: str):
        """
        Finds a property by name.
        Throws ValueError if no property is found.
        """
        if name not in cls.properties_dict():
            raise ValueError(f"Property {name} does not exist")
        return cls.properties_dict()[name]

    @classmethod
    def find_output(cls, name: str) -> OutputSlot:
        """
        Finds an output by name.
        Throws ValueError if no output is found.
        """
        for output in cls.outputs():
            if output.name == name:
                return output

        raise ValueError(f"Output {name} does not exist")

    @classmethod
    def find_output_by_index(cls, index: int) -> OutputSlot:
        """
        Finds an output by index.
        Throws ValueError if no output is found.
        """
        if index < 0 or index >= len(cls.outputs()):
            raise ValueError(f"Output index {index} does not exist for {cls}")
        return cls.outputs()[index]

    @classmethod
    def is_streaming_output(cls):
        return any(output.stream for output in cls.outputs())

    @classmethod
    def return_type(cls) -> Type | dict[str, Type] | None:
        """
        The return type of the process function.
        """
        type_hints = cls.process.__annotations__

        if "return" not in type_hints:
            return None

        return type_hints["return"]

    @classmethod
    def outputs(cls):
        """
        Returns the output type of the node.
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
        except ValueError:
            raise ValueError(
                f"Invalid return type for node {cls.__name__}: {return_type}"
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
        if self.return_type() is dict:
            return output
        elif is_output_type(self.return_type()):
            return output.model_dump()
        else:
            return {"output": output}

    async def process(self, context: Any) -> Any:
        """
        Implements the node's functionality.
        Input slots are inferred from the function signature.
        Output type is inferred from the function return type.
        """
        raise NotImplementedError


class InputNode(BaseNode):
    label: str = Field("Input Label", description="The label for this input node.")
    name: str = Field("", description="The parameter name for the workflow.")
    description: str = Field("", description="The description for this input node.")
    _visible: bool = False


class OutputNode(BaseNode):
    label: str = Field(
        default="Output Label", description="The label for this output node."
    )
    name: str = Field("", description="The parameter name for the workflow.")
    description: str = Field(
        default="", description="The description for this output node."
    )
    _visible: bool = False


class Comment(BaseNode):
    comment: list[Any] = Field(default=[""], description="The comment for this node.")
    _visible: bool = False


class Preview(BaseNode):
    """
    A preview node is a special type of node that is used to preview the output of a node.
    """

    value: Any = Field(None, description="The value to preview.")
    _visible: bool = False

    async def process(self, context: Any) -> Any:
        return self.value


def get_node_class_by_name(class_name: str) -> list[type[BaseNode]]:
    """
    Get the class of a node based on its class_name.

    Args:
        class_name (str): The class_name of the node.

    Returns:
        list[type[Node]]: The classes matching the name.
    """
    if not class_name in NODES_BY_CLASSNAME:
        class_name = class_name.replace("-", "")
    return NODES_BY_CLASSNAME.get(class_name, [])


def get_node_class(node_type: str) -> type[BaseNode] | None:
    """
    Get the type of a node based on its node_type.

    Args:
        node_type (str): The node_type of the node.

    Returns:
        type[Node] | None: The type of the node or None if it does not exist.
    """
    if node_type in NODE_BY_TYPE:
        return NODE_BY_TYPE[node_type]
    else:
        return None


def get_registered_node_classes() -> list[type[BaseNode]]:
    """
    Get all registered node classes.

    Returns:
        list[type[Node]]: The registered node classes.
    """
    return [c for c in NODE_BY_TYPE.values() if c.is_visible]


def requires_capabilities(nodes: list[BaseNode]):
    capabilities = set()
    for node in nodes:
        for cap in node.requires_capabilities():
            capabilities.add(cap)
    return list(capabilities)


def requires_capabilities_from_request(req: RunJobRequest):
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
    A group node is a special type of node that contains a subgraph.
    """

    _nodes: list[BaseNode] = []
    _edges: list[Edge] = []
    _properties: dict[str, Any] = {}

    def append_node(self, node: BaseNode):
        self._nodes.append(node)

    def append_edge(self, edge: Edge):
        self._edges.append(edge)

    def assign_property(self, name: str, value: Any):
        self._properties[name] = value

    async def process_subgraph(
        self,
        context: Any,
        runner: Any,
    ):
        pass
