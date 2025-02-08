import pytest
from datetime import datetime
from enum import Enum
from pydantic import BaseModel
from typing import Dict, List, Optional
from nodetool.models.condition_builder import ConditionBuilder, Field
from nodetool.models.sqlite_adapter import (
    SQLiteAdapter,
    convert_to_sqlite_format,
    convert_from_sqlite_format,
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


# Fixture for in-memory SQLite database
@pytest.fixture
def db_adapter():
    adapter = SQLiteAdapter(
        ":memory:",
        TestModel.db_fields(),
        TestModel.get_table_schema(),
        indexes=[
            dict(
                name="age_index",
                columns=["age"],
                unique=False,
            )
        ],
    )
    yield adapter
    adapter.connection.close()


def test_table_creation(db_adapter):
    assert db_adapter.table_exists()


def test_save_and_get(db_adapter):
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
    db_adapter.save(item.model_dump())
    retrieved_item = TestModel(**db_adapter.get("1"))
    assert retrieved_item == item


def test_update(db_adapter):
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
    db_adapter.save(item.model_dump())

    updated_item = item.copy()
    updated_item.name = "Jane Doe"
    updated_item.age = 31
    db_adapter.save(updated_item.model_dump())

    retrieved_item = TestModel(**db_adapter.get("1"))
    assert retrieved_item == updated_item


def test_delete(db_adapter):
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
    db_adapter.save(item.model_dump())
    db_adapter.delete("1")
    assert db_adapter.get("1") is None


def test_query(db_adapter):
    items = [
        TestModel(
            id=str(i),
            name=f"User {i}",
            age=20 + i,
            height=1.7 + i * 0.1,
            is_active=i % 2 == 0,
            tags=[f"tag{i}"],
            metadata={"key": f"value{i}"},
            created_at=datetime.now(),
            enum_field=TestEnum.VALUE1 if i % 2 == 0 else TestEnum.VALUE2,
            optional_field=f"test{i}" if i % 2 == 0 else None,
        )
        for i in range(10)
    ]
    for item in items:
        db_adapter.save(item.model_dump())

    results, last_key = db_adapter.query(Field("age").greater_than(25), limit=5)

    assert len(results) == 4
    assert all(result["age"] > 25 for result in results)
    assert last_key == ""


def test_convert_to_sqlite_format():
    assert convert_to_sqlite_format("test", str) == "test"
    assert convert_to_sqlite_format(123, int) == 123
    assert convert_to_sqlite_format(1.23, float) == 1.23
    assert convert_to_sqlite_format(True, bool) == 1
    assert convert_to_sqlite_format(["a", "b"], List[str]) == '["a", "b"]'
    assert convert_to_sqlite_format({"a": 1}, Dict[str, int]) == '{"a": 1}'
    assert (
        convert_to_sqlite_format(datetime(2023, 1, 1), datetime)
        == "2023-01-01T00:00:00"
    )
    assert convert_to_sqlite_format(TestEnum.VALUE1, TestEnum) == "value1"


def test_convert_from_sqlite_format():
    assert convert_from_sqlite_format("test", str) == "test"
    assert convert_from_sqlite_format(123, int) == 123
    assert convert_from_sqlite_format(1.23, float) == 1.23
    assert convert_from_sqlite_format(1, bool) is True
    assert convert_from_sqlite_format('["a", "b"]', List[str]) == ["a", "b"]
    assert convert_from_sqlite_format('{"a": 1}', Dict[str, int]) == {"a": 1}
    assert convert_from_sqlite_format("2023-01-01T00:00:00", datetime) == datetime(
        2023, 1, 1
    )
    assert convert_from_sqlite_format("value1", TestEnum) == TestEnum.VALUE1


def test_translate_condition_to_sql():
    condition = "user_id = :user_id AND begins_with(content_type, :content_type)"
    expected = "user_id = :user_id AND content_type LIKE :content_type || '%'"
    assert translate_condition_to_sql(condition) == expected


def test_table_migration(db_adapter):
    # Add a new field
    db_adapter.fields["new_field"] = DBField()
    db_adapter.migrate_table()

    # Check if the new field was added
    current_schema = db_adapter.get_current_schema()
    assert "new_field" in current_schema

    # Remove a field
    del db_adapter.fields["optional_field"]
    db_adapter.migrate_table()

    # Check if the field was removed
    current_schema = db_adapter.get_current_schema()
    assert "optional_field" not in current_schema
