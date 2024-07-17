import pytest
from nodetool.common.environment import Environment


import pytest
from datetime import datetime
from nodetool.models.base_model import (
    DBModel,
    DBField,
)
from nodetool.models.condition_builder import Field

log = Environment.get_logger()


class TestModel(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "test_table",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "username": "S"},
            "global_secondary_indexes": {
                "test_table_username_index": {"username": "HASH"},
            },
        }

    id: str = DBField(hash_key=True)
    username: str = DBField()


@pytest.fixture(scope="function")
def model():
    """
    Mock for unit tests.
    """
    try:
        TestModel.create_table()
    except Exception as e:
        log.info(f"create test table: {e}")

    model = TestModel(id="1", username="Test")
    yield model


def test_model_get(model: TestModel):
    model.save()

    retrieved_instance = TestModel.get("1")

    assert retrieved_instance is not None
    assert retrieved_instance.id == "1"
    assert retrieved_instance.username == "Test"


def test_model_delete(model: TestModel):
    model.delete()
    retrieved_instance = TestModel.get("1")
    assert retrieved_instance is None


def test_model_query(model: TestModel):
    model.save()
    retrieved_instances, _ = TestModel.query(condition=Field("username").equals("Test"))
    assert len(retrieved_instances) > 0
    assert retrieved_instances[0].id == "1"
    assert retrieved_instances[0].username == "Test"
