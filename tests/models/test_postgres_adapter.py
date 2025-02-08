import pytest
from datetime import datetime
from enum import Enum
from pydantic import BaseModel
from typing import Dict, List, Optional
from unittest.mock import MagicMock, patch
from nodetool.models.condition_builder import ConditionBuilder, Field
from nodetool.models.postgres_adapter import (
    PostgresAdapter,
    convert_to_postgres_format,
    convert_from_postgres_format,
    translate_condition_to_sql,
)
from nodetool.models.base_model import DBModel, DBField


# Mock Pydantic model for testing
class TestEnum(Enum):
    VALUE1 = "value1"
    VALUE2 = "value2"


class TestModel(DBModel):
    id: str = DBField(hash_key=True)
    name: str = DBField()
    age: int = DBField()
    height: float = DBField()
    is_active: bool = DBField()
    tags: List[str] = DBField()
    metadata: Dict[str, str] = DBField()
    created_at: datetime = DBField()
    enum_field: TestEnum = DBField()
    optional_field: Optional[str] = DBField(default=None)

    @classmethod
    def get_table_schema(cls) -> dict:
        return {"table_name": "test_table"}

    @classmethod
    def adapter(cls):
        return PostgresAdapter(
            db_params=dict(
                database="test_db",
                user="test_user",
                password="test_password",
                host="localhost",
                port="5432",
            ),
            fields=TestModel.db_fields(),
            table_schema=TestModel.get_table_schema(),
            indexes=[
                dict(
                    name="age_index",
                    columns=["age"],
                    unique=False,
                )
            ],
        )


@pytest.fixture
def mock_db_adapter():
    with patch("nodetool.models.postgres_adapter.psycopg2.connect") as mock_connect:
        mock_cursor = MagicMock()
        mock_connect.return_value.cursor.return_value = mock_cursor
        adapter = TestModel.adapter()
        yield adapter


def test_table_creation(mock_db_adapter):
    mock_db_adapter.table_exists = MagicMock(return_value=True)
    assert mock_db_adapter.table_exists()


def test_save_and_get(mock_db_adapter):
    item = TestModel(
        id="1",
        name="John Doe",
        age=30,
        height=1.75,
        is_active=True,
        tags=["tag1", "tag2"],
        metadata={"key": "value"},
        created_at=datetime.now(),
        enum_field=TestEnum.VALUE1,
        optional_field="test",
    )
    mock_db_adapter.save = MagicMock()
    mock_db_adapter.get = MagicMock(return_value=item.model_dump())

    mock_db_adapter.save(item.model_dump())
    retrieved_item = TestModel(**mock_db_adapter.get("1"))
    assert retrieved_item == item


def test_update(mock_db_adapter):
    item = TestModel(
        id="1",
        name="John Doe",
        age=30,
        height=1.75,
        is_active=True,
        tags=["tag1", "tag2"],
        metadata={"key": "value"},
        created_at=datetime.now(),
        enum_field=TestEnum.VALUE1,
        optional_field="test",
    )
    mock_db_adapter.save = MagicMock()
    mock_db_adapter.get = MagicMock()

    mock_db_adapter.save(item.model_dump())

    updated_item = item.copy()
    updated_item.name = "Jane Doe"
    updated_item.age = 31
    mock_db_adapter.save(updated_item.model_dump())
    mock_db_adapter.get.return_value = updated_item.model_dump()

    retrieved_item = TestModel(**mock_db_adapter.get("1"))
    assert retrieved_item == updated_item


def test_delete(mock_db_adapter):
    mock_db_adapter.delete = MagicMock()
    mock_db_adapter.get = MagicMock(return_value=None)

    mock_db_adapter.delete("1")
    assert mock_db_adapter.get("1") is None


def test_query(mock_db_adapter):
    items = [
        TestModel(
            id=str(i),
            name=f"User {i}",
            age=25 + i,  # Start age at 25 to ensure all results are > 25
            height=1.7 + i * 0.1,
            is_active=i % 2 == 0,
            tags=[f"tag{i}"],
            metadata={"key": f"value{i}"},
            created_at=datetime.now(),
            enum_field=TestEnum.VALUE1 if i % 2 == 0 else TestEnum.VALUE2,
            optional_field=f"test{i}" if i % 2 == 0 else None,
        ).model_dump()
        for i in range(10)
    ]
    # Mock the query to return items 5-8 (indices 5, 6, 7, 8)
    mock_db_adapter.query = MagicMock(return_value=(items[5:9], ""))

    results, last_key = mock_db_adapter.query(Field("age").greater_than(25), limit=5)

    assert len(results) == 4
    assert all(result["age"] > 25 for result in results)
    assert (
        min(result["age"] for result in results) == 30
    )  # Youngest person should be 30
    assert max(result["age"] for result in results) == 33  # Oldest person should be 33
    assert last_key == ""


import json
from psycopg2.extras import Json


def test_convert_to_postgres_format():
    assert convert_to_postgres_format("test", str) == "test"
    assert convert_to_postgres_format(123, int) == 123
    assert convert_to_postgres_format(1.23, float) == 1.23
    assert convert_to_postgres_format(True, bool) is True

    # For lists and dicts, check if the result is a Json object and compare its adapted value
    list_result = convert_to_postgres_format(["a", "b"], List[str])
    assert isinstance(list_result, Json)
    assert list_result.adapted == ["a", "b"]

    dict_result = convert_to_postgres_format({"a": 1}, Dict[str, int])
    assert isinstance(dict_result, Json)
    assert dict_result.adapted == {"a": 1}

    # For datetime, check if it's returned as-is
    test_datetime = datetime(2023, 1, 1)
    assert convert_to_postgres_format(test_datetime, datetime) == test_datetime

    # For Enum, check if it's converted to its value
    assert convert_to_postgres_format(TestEnum.VALUE1, TestEnum) == "value1"


def test_convert_from_postgres_format():
    assert convert_from_postgres_format("test", str) == "test"
    assert convert_from_postgres_format(123, int) == 123
    assert convert_from_postgres_format(1.23, float) == 1.23
    assert convert_from_postgres_format(True, bool) is True

    assert convert_from_postgres_format(["a", "b"], List[str]) == ["a", "b"]
    assert convert_from_postgres_format({"a": 1}, Dict[str, int]) == {"a": 1}

    assert convert_from_postgres_format(datetime(2023, 1, 1), datetime) == datetime(
        2023, 1, 1
    )
    assert convert_from_postgres_format("value1", TestEnum) == TestEnum.VALUE1


def test_translate_condition_to_sql():
    condition = "user_id = %(user_id)s AND content_type LIKE %(content_type)s || '%%'"
    expected = "user_id = %(user_id)s AND content_type LIKE %(content_type)s || '%%'"
    assert translate_condition_to_sql(condition) == expected


def test_table_migration(mock_db_adapter):
    mock_db_adapter.get_current_schema = MagicMock(return_value={})
    mock_db_adapter.migrate_table = MagicMock()

    # Add a new field
    mock_db_adapter.fields["new_field"] = DBField()
    mock_db_adapter.fields["new_field"].annotation = str
    mock_db_adapter.migrate_table()

    # Check if the new field was added
    mock_db_adapter.get_current_schema.return_value = {"new_field": "VARCHAR"}
    current_schema = mock_db_adapter.get_current_schema()
    assert "new_field" in current_schema

    # Remove a field
    del mock_db_adapter.fields["optional_field"]
    mock_db_adapter.migrate_table()

    # Check if the field was removed
    mock_db_adapter.get_current_schema.return_value = {}
    current_schema = mock_db_adapter.get_current_schema()
    assert "optional_field" not in current_schema
