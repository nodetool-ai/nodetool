import pytest
from nodetool.common.environment import Environment


import pytest
from datetime import datetime
from nodetool.models.base_model import (
    DBModel,
    DBField,
)
from nodetool.models.dynamo_adapter import (
    convert_from_dynamodb_format,
    convert_to_dynamodb_format,
)
from nodetool.models.dynamo_adapter import convert_to_dynamodb_format

log = Environment.get_logger()


# Define a model that uses the DynamoModel base class
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
    Mock DynamoDB for unit tests.
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
    retrieved_instances, _ = TestModel.query(
        index="test_table_username_index",
        condition="username = :username",
        values={":username": "Test"},
    )
    assert len(retrieved_instances) > 0
    assert retrieved_instances[0].id == "1"
    assert retrieved_instances[0].username == "Test"


def test_coconvert_to_dynamodb_format():
    assert convert_to_dynamodb_format("test", str) == {"S": "test"}
    assert convert_to_dynamodb_format(1, int) == {"N": "1"}
    assert convert_to_dynamodb_format(True, bool) == {"BOOL": True}
    assert convert_to_dynamodb_format({"key": "value"}, dict) == {
        "S": '{"key": "value"}'
    }
    assert convert_to_dynamodb_format(
        datetime(2022, 1, 1),
        datetime,
    ) == {"S": "2022-01-01T00:00:00"}


def test_convert_from_dynamodb_format():
    assert convert_from_dynamodb_format({"S": "test"}, str) == "test"
    assert convert_from_dynamodb_format({"N": "1"}, int) == 1
    assert convert_from_dynamodb_format({"BOOL": True}, bool) == True
    assert convert_from_dynamodb_format({"S": '{"key": "value"}'}, dict) == {
        "key": "value"
    }
    assert convert_from_dynamodb_format(
        {"S": "2022-01-01T00:00:00"}, datetime
    ) == datetime(2022, 1, 1)
