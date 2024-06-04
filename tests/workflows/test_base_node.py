import os
import pytest
from nodetool.metadata.node_metadata import NodeMetadata
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.property import Property
from nodetool.metadata.types import TypeMetadata

from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import OutputSlot


current_dir = os.path.dirname(os.path.realpath(__file__))
test_file = os.path.join(current_dir, "test.jpg")


class DummyClass(BaseNode):
    prop: int = 123

    def __init__(self, prop: int = 123):
        super().__init__(id="")
        self.prop = prop

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
