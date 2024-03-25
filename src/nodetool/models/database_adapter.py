from abc import ABC, abstractmethod
from typing import Any, Dict, List, Tuple, Type


class DatabaseAdapter(ABC):
    @abstractmethod
    def create_table(
        self,
        table_name: str,
        key_schema: Dict[str, str],
        attribute_definitions: Dict[str, str],
        global_secondary_indexes: Dict[str, Dict[str, str]] | None = None,
        read_capacity_units: int = 1,
        write_capacity_units: int = 1,
    ) -> None:
        pass

    @abstractmethod
    def drop_table(self, table_name: str) -> None:
        pass

    @abstractmethod
    def get_primary_key(self) -> str:
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
        condition: str,
        values: Dict[str, Any],
        limit: int = 100,
        reverse: bool = False,
        start_key: str | None = None,
        index: str | None = None,
    ) -> tuple[list[dict[str, Any]], str]:
        pass
