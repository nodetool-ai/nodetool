from typing import Any
from pydantic import BaseModel, Field

from nodetool.common.environment import Environment
from uuid import uuid1
from random import randint

from nodetool.models.condition_builder import ConditionBuilder
from nodetool.models.database_adapter import DatabaseAdapter

"""
Database Model Base Classes and Utilities

This module provides the core database modeling functionality, including:

- DBModel: A base class for database models that extends Pydantic's BaseModel
- Field decorators and utilities for defining database schemas
- Index management functionality

Key Components:
- DBModel: Base class that provides CRUD operations, query capabilities, and index management
- DBField: Field decorator for marking model attributes as database columns
- DBIndex: Decorator for defining database indexes on models
"""


log = Environment.get_logger()


def create_time_ordered_uuid() -> str:
    """
    Create an uuid that is ordered by time.
    """
    return uuid1(randint(0, 2**31)).hex


def DBField(hash_key: bool = False, **kwargs: Any):
    return Field(json_schema_extra={"hash_key": hash_key, "persist": True}, **kwargs)  # type: ignore


def DBIndex(columns: list[str], unique: bool = False, name: str | None = None):
    """
    Decorator to define an index on a model.

    Args:
        columns: List of column names to include in the index
        unique: Whether the index should enforce uniqueness
        name: Optional custom name for the index. If not provided, one will be generated.
    """

    def decorator(cls):
        if not hasattr(cls, "_indexes"):
            cls._indexes = []

        # Generate index name if not provided
        index_name = name or f"idx_{cls.get_table_name()}_{'_'.join(columns)}"

        cls._indexes.append({"name": index_name, "columns": columns, "unique": unique})
        return cls

    return decorator


class DBModel(BaseModel):
    @classmethod
    def get_table_schema(cls) -> dict[str, Any]:
        """
        Get the name of the table for the model.
        """
        raise NotImplementedError()

    @classmethod
    def get_table_name(cls) -> str:
        """
        Get the name of the table for the model.
        """
        return cls.get_table_schema()["table_name"]

    @classmethod
    def adapter(cls) -> DatabaseAdapter:
        if not hasattr(cls, "__adapter"):
            cls.__adapter = Environment.get_database_adapter(
                fields=cls.db_fields(),
                table_schema=cls.get_table_schema(),
                indexes=cls.get_indexes(),
            )
        return cls.__adapter

    @classmethod
    def has_indexes(cls) -> bool:
        """
        Check if the model has any defined indexes.
        """
        return hasattr(cls, "_indexes")

    @classmethod
    def get_indexes(cls) -> list[dict[str, Any]]:
        """
        Get the list of defined indexes for the model.
        Returns an empty list if no indexes are defined.
        """
        return cls._indexes if cls.has_indexes() else []  # type: ignore

    @classmethod
    def create_table(cls):
        """
        Create the DB table for the model and its indexes.
        """
        cls.adapter().create_table()

        # Create any defined indexes
        for index in cls.get_indexes():
            cls.adapter().create_index(
                index_name=index["name"],
                columns=index["columns"],
                unique=index["unique"],
            )

    @classmethod
    def create_indexes(cls):
        """
        Create all defined indexes for the model.
        """
        for index in cls.get_indexes():
            cls.adapter().create_index(
                index_name=index["name"],
                columns=index["columns"],
                unique=index["unique"],
            )

    @classmethod
    def drop_indexes(cls):
        """
        Drop all defined indexes for the model.
        """
        for index in cls.get_indexes():
            cls.adapter().drop_index(index["name"])

    @classmethod
    def drop_table(cls):
        """
        Drop the DB table for the model and its indexes.
        """
        # Drop any defined indexes first
        for index in cls.get_indexes():
            cls.adapter().drop_index(index["name"])

        cls.adapter().drop_table()

    @classmethod
    def query(
        cls,
        condition: ConditionBuilder,
        limit: int = 100,
        reverse: bool = False,
        join_tables: list[dict[str, str]] | None = None,
    ):
        """
        Query the DB table for the model to retrieve a list of items.
        This method is used for pagination and returns a tuple containing a list of items and the last evaluated key.
        It allows for filtering and sorting the results.

        Args:
            condition: The condition for the query.
            limit: The maximum number of items to retrieve.
            reverse: Whether to reverse the order of the results.
            join_tables: A list of tables to join with.

        Returns:
            A tuple containing a list of items that match the query conditions and the last evaluated key.
        """
        items, key = cls.adapter().query(
            condition=condition,
            limit=limit,
            reverse=reverse,
            join_tables=join_tables,
        )
        return [cls(**item) for item in items], key

    @classmethod
    def create(cls, **kwargs):
        """
        Create a model instance from keyword arguments and save it.
        """
        return cls(**kwargs).save()

    def before_save(self):
        pass

    def save(self):
        """
        Save a model instance and return the instance.
        """
        self.before_save()
        self.adapter().save(self.model_dump())
        return self

    @classmethod
    def db_fields(cls) -> dict[str, Any]:
        """
        Return a dictionary of fields that should be persisted.
        """
        return {
            field_name: field
            for field_name, field in cls.model_fields.items()
            if field.json_schema_extra and field.json_schema_extra.get("persist", False)
        }

    @classmethod
    def get(cls, key: str | int):
        """
        Retrieve a model instance from the DB using a key.
        """
        item = cls.adapter().get(key)
        if item is None:
            return None
        return cls(**item)

    def reload(self):
        """
        Reload the model instance from the DB.
        """
        item = self.adapter.get(self.partition_value())
        if item is None:
            raise ValueError(f"Item not found: {self.partition_value()}")
        for key, value in item.items():
            setattr(self, key, value)
        return self

    def partition_value(self) -> str:
        """
        Get the value of the hash key.
        """
        return getattr(self, self.adapter().get_primary_key())

    def delete(self):
        self.adapter().delete(self.partition_value())

    def update(self, **kwargs):
        """
        Update the model instance and save it.
        """
        for key, value in kwargs.items():
            setattr(self, key, value)
        return self.save()

    @classmethod
    def list_indexes(cls) -> list[dict[str, Any]]:
        """
        List all indexes defined on the model's table.
        """
        return cls.adapter().list_indexes()
