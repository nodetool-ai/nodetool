from typing import Any
from pydantic import BaseModel, Field

from nodetool.common.environment import Environment
from uuid import uuid1
from random import randint

from nodetool.models.condition_builder import ConditionBuilder
from nodetool.models.database_adapter import DatabaseAdapter


log = Environment.get_logger()


def create_time_ordered_uuid() -> str:
    """
    Create an uuid that is ordered by time.
    """
    return uuid1(randint(0, 2**31)).hex


def DBField(hash_key: bool = False, **kwargs: Any):
    return Field(json_schema_extra={"hash_key": hash_key, "persist": True}, **kwargs)  # type: ignore


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
            )
        return cls.__adapter

    @classmethod
    def create_table(cls):
        """
        Create the DB table for the model.
        """
        cls.adapter().create_table()

    @classmethod
    def drop_table(cls):
        """
        Drop the DB table for the model.
        """
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
