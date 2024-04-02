from datetime import datetime
import re
import sqlite3
from types import UnionType
from typing import Any, Dict, List, get_args
from pydantic.fields import FieldInfo

from nodetool.common.environment import Environment

from .database_adapter import DatabaseAdapter
from typing import Any, Type, Union, get_origin, get_args
import json
import enum


def convert_to_sqlite_format(
    value: Any, py_type: Type
) -> Union[int, float, str, bytes, None]:
    """
    Convert a Python value to a format suitable for SQLite based on the provided Python type.
    Serialize lists and dicts to JSON strings. Encode bytes using base64.

    :param value: The value to convert, or None.
    :param py_type: The Python type of the value.
    :return: The value converted to a SQLite-compatible format.
    """
    if value is None:
        return None

    origin = get_origin(py_type)
    if origin is Union or origin is UnionType:
        # Assume the first non-None type is the desired type for SQLite
        # This works for Optional types as well
        _type = next(t for t in get_args(py_type) if t is not type(None))
        return convert_to_sqlite_format(value, _type)

    if py_type in (str, int, float):
        return value
    elif py_type is set or origin is set:
        return json.dumps(list(value))
    elif py_type in (dict, list) or origin in (dict, list):
        return json.dumps(value)
    elif py_type == bytes:
        return value
    elif py_type is Any:
        return json.dumps(value)
    elif py_type is datetime:
        return value.isoformat()
    elif issubclass(py_type, bool):
        return int(value)
    elif issubclass(py_type, enum.Enum):
        return value.value
    else:
        raise TypeError(f"Unsupported type for SQLite: {py_type}")


def convert_from_sqlite_format(value: Any, py_type: Type) -> Any:
    """
    Convert a value from SQLite to a Python type based on the provided Python type.
    Deserialize JSON strings to lists and dicts.

    :param value: The value to convert, or None.
    :param py_type: The Python type of the value.
    :return: The value converted to a Python type.
    """
    if value is None:
        return None

    origin = get_origin(py_type)
    if origin is Union or origin is UnionType:
        # Assume the first non-None type is the desired type for SQLite
        # This works for Optional types as well
        _type = next(t for t in get_args(py_type) if t is not type(None))
        return convert_from_sqlite_format(value, _type)

    if py_type in (str, int, float):
        return value
    elif py_type is Any:
        return json.loads(value)
    elif py_type == set or origin == set:
        return set(json.loads(value))
    elif py_type in (list, dict) or origin in (list, dict):
        return json.loads(value)
    elif py_type == bytes:
        return value
    elif py_type is datetime:
        return datetime.fromisoformat(value)
    elif issubclass(py_type, bool):
        return bool(value)
    elif issubclass(py_type, enum.Enum):
        return py_type(value)
    else:
        raise TypeError(f"Unsupported type for SQLite: {py_type}")


def convert_from_sqlite_attributes(
    attributes: Dict[str, Any], fields: Dict[str, FieldInfo]
) -> Dict[str, Any]:
    """
    Convert a dictionary of attributes from SQLite to a dictionary of Python types based on the provided fields.
    """
    for key in attributes:
        if key not in fields:
            raise ValueError(f"Field {key} not found in fields")
    return {
        key: convert_from_sqlite_format(attributes[key], fields[key].annotation)  # type: ignore
        for key in attributes
    }


def convert_to_sqlite_attributes(
    attributes: Dict[str, Any], fields: Dict[str, FieldInfo]
) -> Dict[str, Any]:
    """
    Convert a dictionary of attributes from SQLite to a dictionary of Python types based on the provided fields.
    """
    return {
        key: convert_to_sqlite_format(attributes[key], fields[key].annotation)  # type: ignore
        for key in attributes
    }


def get_sqlite_type(field_type: Any) -> str:
    # Check for Union or Optional types (Optional[X] is just Union[X, None] in typing)
    origin = get_origin(field_type)
    if origin is Union or origin is UnionType:
        # Assume the first non-None type is the desired type for SQLite
        # This works for Optional types as well
        _type = next(t for t in get_args(field_type) if t is not type(None))
        return get_sqlite_type(_type)

    # Direct mapping of Python types to SQLite types
    if field_type is str:
        return "TEXT"
    elif field_type is Any:
        return "TEXT"
    # Serialized to JSON
    elif field_type in (list, dict, set) or origin in (list, dict, set):
        return "TEXT"
    elif field_type is int or field_type is bool:  # bool is stored as INTEGER (0 or 1)
        return "INTEGER"
    elif field_type is float:
        return "REAL"
    elif field_type is datetime:
        return "TEXT"
    elif field_type is bytes:  # bytes are stored as BLOB
        return "BLOB"
    elif field_type is None:  # NoneType translates to NULL
        return "NULL"
    else:
        raise Exception(f"Unsupported field type: {field_type}")


def translate_condition_to_sql(condition: str) -> str:
    """
    Translates a condition string with custom syntax into an SQLite-compatible SQL condition string using regex.

    Args:
    - condition (str): The condition string to translate, e.g.,
                       "user_id = :user_id AND begins_with(content_type, :content_type)".

    Returns:
    - str: The translated SQL condition string compatible with SQLite.
    """

    # Define a regex pattern to match the begins_with syntax
    pattern = r"begins_with\((\w+),\s*:(\w+)\)"

    # Function to replace each match with the SQLite LIKE syntax
    def replacement(match):
        column_name, param_name = match.groups()
        return f"{column_name} LIKE :{param_name} || '%'"

    # Use the regex sub function to replace all occurrences of the pattern
    translated_condition = re.sub(pattern, replacement, condition)

    return translated_condition


class SQLiteAdapter(DatabaseAdapter):
    db_path: str
    table_name: str
    table_schema: Dict[str, Any]

    def __init__(
        self,
        db_path: str,
        fields: Dict[str, FieldInfo],
        table_schema: Dict[str, Any],
    ):
        self.db_path = db_path
        self.table_name = table_schema["table_name"]
        self.table_schema = table_schema
        self.fields = fields
        if self.table_exists():
            self.migrate_table()
        else:
            self.create_table()

    @property
    def connection(self):
        if not hasattr(self, "_connection"):
            self._connection = sqlite3.connect(
                self.db_path, timeout=30, check_same_thread=False
            )
            self._connection.row_factory = sqlite3.Row
            if Environment.is_debug():
                self._connection.set_trace_callback(print)

        return self._connection

    def table_exists(self) -> bool:
        cursor = self.connection.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
            (self.table_name,),
        )
        return cursor.fetchone() is not None

    def get_primary_key(self) -> str:
        """
        Get the name of the hash key.
        """
        for field_name, field in self.fields.items():
            if field.json_schema_extra and field.json_schema_extra.get(
                "hash_key", False
            ):
                return field_name
        raise Exception(f"Hash key not found for {self.table_name}")

    def get_current_schema(self) -> set[str]:
        """
        Retrieves the current schema of the table from the database.
        """
        cursor = self.connection.execute(f"PRAGMA table_info({self.table_name})")
        current_schema = {row[1] for row in cursor.fetchall()}
        return current_schema

    def get_desired_schema(self) -> set[str]:
        """
        Retrieves the desired schema based on the defined fields.
        """
        desired_schema = set(self.fields.keys())
        return desired_schema

    def create_table(self, suffix: str = "") -> None:
        table_name = f"{self.table_name}{suffix}"
        fields = self.fields
        primary_key = self.get_primary_key()
        sql = f"CREATE TABLE IF NOT EXISTS {table_name} ("
        for field_name, field in fields.items():
            field_type = field.annotation
            sql += f"{field_name} {get_sqlite_type(field_type)}, "
        sql += f"PRIMARY KEY ({primary_key}))"

        try:
            self.connection.execute(sql)
            self.connection.commit()
        except sqlite3.Error as e:
            print(f"SQLite error during table creation: {e}")
            raise e

    def drop_table(self) -> None:
        sql = f"DROP TABLE IF EXISTS {self.table_name}"
        self.connection.execute(sql)
        self.connection.commit()

    def migrate_table(self) -> None:
        """
        Inspects the current schema of the database and migrates the table to the desired schema.
        """
        current_schema = self.get_current_schema()
        desired_schema = self.get_desired_schema()

        # Compare current and desired schemas
        fields_to_add = desired_schema - current_schema
        fields_to_remove = current_schema - desired_schema

        # Alter table to add new fields
        for field_name in fields_to_add:
            field_type = get_sqlite_type(self.fields[field_name].annotation)
            self.connection.execute(
                f"ALTER TABLE {self.table_name} ADD COLUMN {field_name} {field_type}"
            )

        # Alter table to remove fields (SQLite doesn't support dropping columns directly)
        if fields_to_remove:
            # Create a new table with the desired schema
            self.create_table(suffix="_new")

            # Copy data from the old table to the new table
            columns = ", ".join(desired_schema)
            self.connection.execute(
                f"INSERT INTO {self.table_name}_new ({columns}) SELECT {columns} FROM {self.table_name}"
            )

            self.connection.execute(f"DROP TABLE {self.table_name}")

            # Rename the new table to the original table name
            self.connection.execute(
                f"ALTER TABLE {self.table_name}_new RENAME TO {self.table_name}"
            )

        self.connection.commit()

    def save(self, item: Dict[str, Any]) -> None:
        valid_keys = [key for key in item if key in self.fields]
        columns = ", ".join(valid_keys)
        placeholders = ", ".join(["?" for _ in valid_keys])
        values = tuple(
            convert_to_sqlite_format(item[key], self.fields[key].annotation)  # type: ignore
            for key in valid_keys
        )
        query = f"INSERT OR REPLACE INTO {self.table_name} ({columns}) VALUES ({placeholders})"
        self.connection.execute(query, values)
        self.connection.commit()

    def get(self, key: Any) -> Dict[str, Any] | None:
        primary_key = self.get_primary_key()
        cols = ", ".join(self.fields.keys())
        query = f"SELECT {cols} FROM {self.table_name} WHERE {primary_key} = ?"
        cursor = self.connection.execute(query, (key,))
        item = cursor.fetchone()
        if item is None:
            return None
        return convert_from_sqlite_attributes(dict(item), self.fields)

    def delete(self, primary_key: Any) -> None:
        pk_column = self.get_primary_key()
        query = f"DELETE FROM {self.table_name} WHERE {pk_column} = ?"
        self.connection.execute(query, (primary_key,))
        self.connection.commit()

    def query(
        self,
        condition: str,
        values: Dict[str, Any],
        limit: int = 100,
        reverse: bool = False,
        start_key: str | None = None,
        index: str | None = None,  # index is not used in SQLite
    ) -> tuple[list[dict[str, Any]], str]:
        pk = self.get_primary_key()
        order_by = f"{pk} DESC" if reverse else f"{pk} ASC"
        values_without_prefix = {
            key.removeprefix(":"): value for key, value in values.items()
        }
        condition = translate_condition_to_sql(condition)
        if start_key:
            condition += f" AND {pk} > :start_key"
            values_without_prefix["start_key"] = start_key
        cols = ", ".join(self.fields.keys())
        query = f"SELECT {cols} FROM {self.table_name} WHERE {condition} ORDER BY {order_by} LIMIT {limit}"
        cursor = self.connection.execute(query, values_without_prefix)
        res = [
            convert_from_sqlite_attributes(dict(row), self.fields)  # type: ignore
            for row in cursor.fetchall()
        ]
        if len(res) == 0 or len(res) < limit:
            return res, ""

        last_evaluated_key = str(res[-1].get(pk))
        return res, last_evaluated_key

    def __del__(self):
        self.connection.close()
