# nodetool.nodes.nodetool.data.sqlite

## CreateTable

Creates a new SQLite table with the specified schema.

Use cases:
- Define database structure
- Initialize data storage

**Tags:** database, sqlite, table, create

**Fields:**
- **database_path**: Path to SQLite database file (str)
- **table_name**: Name of the table to create (str)
- **schema**: List of column definitions for the table (RecordType)


## DeleteRecords

Deletes records from a SQLite table.

Use cases:
- Remove outdated data
- Clean up database

**Tags:** database, sqlite, delete

**Fields:**
- **database_path**: Path to SQLite database file (str)
- **table_name**: Name of the table to delete from (str)
- **where_clause**: WHERE clause for filtering records to delete (str)
- **where_params**: Parameters for WHERE clause (typing.List[typing.Any])


## InsertRecord

Inserts a new record into a SQLite table.

Use cases:
- Add new data to database
- Store processing results

**Tags:** database, sqlite, insert, record

**Fields:**
- **database_path**: Path to SQLite database file (str)
- **table_name**: Name of the table to insert into (str)
- **values**: Dictionary of column names and values (typing.Dict[str, typing.Any])


## QueryRecords

Queries records from a SQLite table.

Use cases:
- Retrieve stored data
- Filter database records

**Tags:** database, sqlite, query, select

**Fields:**
- **database_path**: Path to SQLite database file (str)
- **table_name**: Name of the table to query (str)
- **columns**: List of columns to retrieve (typing.List[str])
- **where_clause**: WHERE clause for filtering, leave blank for all (str)
- **params**: Parameters for WHERE clause (typing.Optional[typing.List[typing.Any]])


## UpdateRecords

Updates existing records in a SQLite table.

Use cases:
- Modify existing data
- Update processing results

**Tags:** database, sqlite, update

**Fields:**
- **database_path**: Path to SQLite database file (str)
- **table_name**: Name of the table to update (str)
- **set_values**: Values to update (typing.Dict[str, typing.Any])
- **where_clause**: WHERE clause for filtering records to update (str)
- **where_params**: Parameters for WHERE clause (typing.List[typing.Any])


