from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple, Type

from nodetool.models.condition_builder import ConditionBuilder
from pydantic.fields import FieldInfo


class DatabaseAdapter(ABC):
    fields: Dict[str, FieldInfo]
    table_name: str
    table_schema: Dict[str, Any]

    @abstractmethod
    def create_table(self) -> None:
        pass

    @abstractmethod
    def drop_table(self) -> None:
        pass

    @abstractmethod
    def save(self, item: Dict[str, Any]) -> None:
        pass

    @abstractmethod
    def get(self, key: Any) -> Dict[str, Any] | None:
        pass

    @abstractmethod
    def delete(self, primary_key: Any) -> None:
        pass

    @abstractmethod
    def query(
        self,
        condition: ConditionBuilder,
        limit: int = 100,
        reverse: bool = False,
        join_tables: List[Dict[str, str]] | None = None,
    ) -> tuple[list[dict[str, Any]], str]:
        pass

    @abstractmethod
    def execute_sql(
        self, sql: str, params: dict[str, Any] = {}
    ) -> List[Dict[str, Any]]:
        pass

    def get_primary_key(self) -> str:
        """
        Get the name of the primary key.
        """
        return self.table_schema.get("primary_key", "id")
