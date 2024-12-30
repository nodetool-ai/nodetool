# src/nodetool/nodes/nodetool/sqlite.py

import sqlite3
from typing import List, Any, Optional, Dict
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ColumnDef, ColumnType, RecordType


class CreateTable(BaseNode):
    """
    Creates a new SQLite table with the specified schema.
    database, sqlite, table, create

    Use cases:
    - Define database structure
    - Initialize data storage
    """

    database_path: str = Field(description="Path to SQLite database file")
    table_name: str = Field(description="Name of the table to create")
    schema: RecordType = Field(description="List of column definitions for the table")

    def _get_sqlite_type(self, col_type: ColumnType) -> str:
        type_map = {
            "int": "INTEGER",
            "float": "REAL",
            "datetime": "TIMESTAMP",
            "string": "TEXT",
            "object": "BLOB",
        }
        return type_map[col_type]

    def _get_current_schema(self, conn: sqlite3.Connection) -> List[Dict[str, str]]:
        cursor = conn.execute(f"PRAGMA table_info({self.table_name})")
        return [{"name": row[1], "type": row[2]} for row in cursor.fetchall()]

    def _create_temp_table(self, conn: sqlite3.Connection, temp_name: str) -> None:
        create_sql = f"CREATE TABLE {temp_name} ("
        columns = []
        for col in self.schema.columns:
            sqlite_type = self._get_sqlite_type(col.data_type)
            columns.append(f"{col.name} {sqlite_type}")
        create_sql += ", ".join(columns) + ")"
        conn.execute(create_sql)

    async def process(self, context: ProcessingContext) -> None:
        with sqlite3.connect(self.database_path) as conn:
            # Check if table exists
            cursor = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
                (self.table_name,),
            )
            table_exists = cursor.fetchone() is not None

            if not table_exists:
                # Create new table if it doesn't exist
                create_sql = f"CREATE TABLE {self.table_name} ("
                columns = []
                for col in self.schema.columns:
                    sqlite_type = self._get_sqlite_type(col.data_type)
                    columns.append(f"{col.name} {sqlite_type}")
                create_sql += ", ".join(columns) + ")"
                conn.execute(create_sql)
            else:
                # Compare schemas and migrate if different
                current_schema = self._get_current_schema(conn)
                new_schema = [
                    {"name": col.name, "type": self._get_sqlite_type(col.data_type)}
                    for col in self.schema.columns
                ]

                if current_schema != new_schema:
                    # Perform schema migration
                    temp_table = f"{self.table_name}_temp"

                    # Create temporary table with new schema
                    self._create_temp_table(conn, temp_table)

                    # Copy data from old table to new table
                    common_columns = [
                        col["name"]
                        for col in current_schema
                        if any(new_col["name"] == col["name"] for new_col in new_schema)
                    ]
                    if common_columns:
                        columns_str = ", ".join(common_columns)
                        conn.execute(
                            f"INSERT INTO {temp_table} ({columns_str}) "
                            f"SELECT {columns_str} FROM {self.table_name}"
                        )

                    # Drop old table and rename temp table
                    conn.execute(f"DROP TABLE {self.table_name}")
                    conn.execute(
                        f"ALTER TABLE {temp_table} RENAME TO {self.table_name}"
                    )

            conn.commit()


class InsertRecord(BaseNode):
    """
    Inserts a new record into a SQLite table.
    database, sqlite, insert, record

    Use cases:
    - Add new data to database
    - Store processing results
    """

    database_path: str = Field(description="Path to SQLite database file")
    table_name: str = Field(description="Name of the table to insert into")
    values: Dict[str, Any] = Field(description="Dictionary of column names and values")

    async def process(self, context: ProcessingContext) -> None:
        columns = ", ".join(self.values.keys())
        placeholders = ", ".join(["?" for _ in self.values])
        insert_sql = (
            f"INSERT INTO {self.table_name} ({columns}) VALUES ({placeholders})"
        )

        with sqlite3.connect(self.database_path) as conn:
            conn.execute(insert_sql, list(self.values.values()))
            conn.commit()


class QueryRecords(BaseNode):
    """
    Queries records from a SQLite table.
    database, sqlite, query, select

    Use cases:
    - Retrieve stored data
    - Filter database records
    """

    database_path: str = Field(description="Path to SQLite database file")
    table_name: str = Field(description="Name of the table to query")
    columns: List[str] = Field(default=["*"], description="List of columns to retrieve")
    where_clause: str = Field(
        default="", description="WHERE clause for filtering, leave blank for all"
    )
    params: Optional[List[Any]] = Field(
        default_factory=list, description="Parameters for WHERE clause"
    )

    async def process(self, context: ProcessingContext) -> List[Dict[str, Any]]:
        columns_str = ", ".join(self.columns)
        query = f"SELECT {columns_str} FROM {self.table_name}"

        if self.where_clause and self.where_clause.strip():
            query += f" WHERE {self.where_clause}"

        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.execute(query, self.params or [])
            rows = cursor.fetchall()

            return [dict(zip(self.columns, row)) for row in rows]


class UpdateRecords(BaseNode):
    """
    Updates existing records in a SQLite table.
    database, sqlite, update

    Use cases:
    - Modify existing data
    - Update processing results
    """

    database_path: str = Field(description="Path to SQLite database file")
    table_name: str = Field(description="Name of the table to update")
    set_values: Dict[str, Any] = Field(
        default_factory=dict, description="Values to update"
    )
    where_clause: str = Field(
        default="", description="WHERE clause for filtering records to update"
    )
    where_params: List[Any] = Field(
        default_factory=list, description="Parameters for WHERE clause"
    )

    async def process(self, context: ProcessingContext) -> int:
        if self.where_clause.strip() == "":
            raise ValueError("where_clause cannot be empty")

        set_clause = ", ".join([f"{k} = ?" for k in self.set_values.keys()])
        update_sql = (
            f"UPDATE {self.table_name} SET {set_clause} WHERE {self.where_clause}"
        )

        params = list(self.set_values.values()) + self.where_params

        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.execute(update_sql, params)
            conn.commit()
            return cursor.rowcount


class DeleteRecords(BaseNode):
    """
    Deletes records from a SQLite table.
    database, sqlite, delete

    Use cases:
    - Remove outdated data
    - Clean up database
    """

    database_path: str = Field(description="Path to SQLite database file")
    table_name: str = Field(description="Name of the table to delete from")
    where_clause: str = Field(
        default="", description="WHERE clause for filtering records to delete"
    )
    where_params: List[Any] = Field(
        default_factory=list, description="Parameters for WHERE clause"
    )

    async def process(self, context: ProcessingContext) -> int:
        if self.where_clause.strip() == "":
            raise ValueError("where_clause cannot be empty")

        delete_sql = f"DELETE FROM {self.table_name} WHERE {self.where_clause}"

        with sqlite3.connect(self.database_path) as conn:
            cursor = conn.execute(delete_sql, self.where_params)
            conn.commit()
            return cursor.rowcount
