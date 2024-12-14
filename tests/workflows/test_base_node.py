import enum
import os
from typing import Optional, Union
import pytest
from nodetool.types.graph import Edge, Graph, Node
from nodetool.metadata.node_metadata import NodeMetadata
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.property import Property
from nodetool.metadata.type_metadata import TypeMetadata
from nodetool.workflows.processing_context import ProcessingContext

from nodetool.workflows.base_node import (
    NODE_BY_TYPE,
    COMFY_NODE_CLASSES,
    BaseNode,
    GroupNode,
    add_node_type,
    get_node_class,
    get_comfy_class_by_name,
    type_metadata,
)
from nodetool.metadata.types import OutputSlot
from nodetool.workflows.run_job_request import RunJobRequest


current_dir = os.path.dirname(os.path.realpath(__file__))
test_file = os.path.join(current_dir, "test.jpg")


class DummyClass(BaseNode):
    prop: int = 123

    def process(self, context: ProcessingContext) -> int:
        return self.prop


class StringNode(BaseNode):
    value: str = "test"

    def process(self, context: ProcessingContext) -> str:
        return self.value


def test_node_creation():
    node = BaseNode(id="")
    assert node._id == ""


def test_node_metadata_method():
    node = DummyClass()
    assert isinstance(node.metadata(), NodeMetadata)


def test_node_find_property_method():
    node = DummyClass(prop=123)
    assert isinstance(node.find_property("prop"), Property)


def test_node_find_property_fail():
    node = DummyClass(prop=123)
    with pytest.raises(ValueError):
        node.find_property("non_existent_prop")


def test_node_find_output_method():
    node = DummyClass()
    assert isinstance(node.find_output("output"), OutputSlot)


def test_node_find_output_fail():
    node = DummyClass()
    with pytest.raises(ValueError):
        node.find_output("non_existent_output")


def test_node_assign_property_method():
    node = DummyClass()
    node.assign_property("prop", 456)
    assert node.prop == 456


def test_node_assign_property_fail():
    node = DummyClass()
    with pytest.raises(ValueError):
        node.assign_property("prop", "test")


def test_node_is_assignable_method():
    node = DummyClass()
    assert node.is_assignable("prop", 456) == True


def test_node_output_type():
    node = DummyClass()
    assert node.outputs() == [OutputSlot(type=TypeMetadata(type="int"), name="output")]


def test_string_node_output_type():
    node = StringNode(_id="")
    assert node.outputs() == [OutputSlot(type=TypeMetadata(type="str"), name="output")]


def test_node_set_node_properties():
    node = DummyClass()
    node.set_node_properties({"prop": 789})
    assert node.prop == 789


def test_node_set_node_properties_fail():
    node = DummyClass()
    with pytest.raises(ValueError):
        node.set_node_properties({"prop": "test"})


def test_node_set_node_properties_skip_errors():
    node = DummyClass()
    node.set_node_properties({"prop": "test"}, skip_errors=True)
    assert node.prop == 123


def test_node_properties_dict():
    node = DummyClass()
    assert "prop" in node.properties_dict()


def test_node_properties():
    node = DummyClass()
    assert any(prop.name == "prop" for prop in node.properties())


def test_node_node_properties():
    node = DummyClass(prop=123)
    assert node.node_properties() == {"prop": 123}


@pytest.mark.asyncio
async def test_node_convert_output_value(context: ProcessingContext):
    node = DummyClass()
    output = 123
    assert await node.convert_output(context, output) == {"output": 123}


def test_type_metadata_basic_types():
    assert type_metadata(int) == TypeMetadata(type="int")
    assert type_metadata(str) == TypeMetadata(type="str")
    assert type_metadata(float) == TypeMetadata(type="float")
    assert type_metadata(bool) == TypeMetadata(type="bool")


def test_type_metadata_list():
    assert type_metadata(list[int]) == TypeMetadata(
        type="list", type_args=[TypeMetadata(type="int")]
    )


def test_type_metadata_dict():
    assert type_metadata(dict[str, int]) == TypeMetadata(
        type="dict", type_args=[TypeMetadata(type="str"), TypeMetadata(type="int")]
    )


def test_type_metadata_union():
    assert type_metadata(int | str) == TypeMetadata(
        type="union", type_args=[TypeMetadata(type="int"), TypeMetadata(type="str")]
    )


def test_type_metadata_optional():
    assert type_metadata(Optional[int]) == TypeMetadata(type="int", optional=True)


def test_type_metadata_enum():
    class TestEnum(enum.Enum):
        A = "a"
        B = "b"

    metadata = type_metadata(TestEnum)
    assert metadata.type == "enum"
    assert metadata.type_name == "test_base_node.TestEnum"
    assert metadata.values is not None
    assert set(metadata.values) == {"a", "b"}


def test_type_metadata_nested():
    assert type_metadata(list[dict[str, Union[int, str]]]) == TypeMetadata(
        type="list",
        type_args=[
            TypeMetadata(
                type="dict",
                type_args=[
                    TypeMetadata(type="str"),
                    TypeMetadata(
                        type="union",
                        type_args=[TypeMetadata(type="int"), TypeMetadata(type="str")],
                    ),
                ],
            )
        ],
    )


def test_type_metadata_unknown_type():
    class CustomClass:
        pass

    with pytest.raises(ValueError, match="Unknown type"):
        type_metadata(CustomClass)


def test_add_node_type_and_classname():
    class TestNode(BaseNode):
        pass

    add_node_type(TestNode)
    assert TestNode.get_node_type() in NODE_BY_TYPE


def test_get_node_class_and_by_name():
    class TestNode(BaseNode):
        pass

    add_node_type(TestNode)
    assert get_node_class(TestNode.get_node_type()) == TestNode


def test_base_node_from_dict():
    node_dict = {
        "type": DummyClass.get_node_type(),
        "id": "test_id",
        "parent_id": "parent_id",
        "ui_properties": {"x": 100, "y": 200},
        "data": {"prop": 456},
    }
    node = DummyClass.from_dict(node_dict)
    assert isinstance(node, DummyClass)
    assert node.id == "test_id"
    assert node.parent_id == "parent_id"
    assert node._ui_properties == {"x": 100, "y": 200}
    assert node.prop == 456


def test_base_node_get_json_schema():
    schema = DummyClass.get_json_schema()
    assert "type" in schema
    assert schema["type"] == "object"
    assert "properties" in schema
    assert "prop" in schema["properties"]
