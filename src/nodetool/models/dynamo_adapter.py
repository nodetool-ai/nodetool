import base64
from datetime import datetime
import enum
import json
from types import UnionType
from typing import Any, Dict, Type, Union, get_origin
from pydantic.fields import FieldInfo

from nodetool.common.environment import Environment

from .database_adapter import DatabaseAdapter

log = Environment.get_logger()


def is_union_type(t):
    """
    Check if a type is a union.

    Args:
        t: The type to check.

    Returns:
        True if the type is a union, False otherwise.
    """
    return get_origin(t) is Union or isinstance(t, UnionType)


def convert_to_dynamo(value: Any) -> dict | None:
    """
    Convert a Python value to its DynamoDB representation.

    :param value: The value to convert.
    :return: A dictionary representing the DynamoDB format of the value.
    """
    py_type = type(value)

    if value is None:
        raise ValueError("Cannot convert None to DynamoDB format")

    return convert_to_dynamodb_format(value, py_type)


def convert_to_dynamodb_format(
    value: Any,
    py_type: Type,
) -> dict | None:
    """
    Convert a Python value to its DynamoDB representation based on the provided Python type.
    Use default_value if the provided value is None. Convert lists and dicts to JSON strings.

    :param value: The value to convert, or None.
    :param py_type: The Python type of the value.
    """
    if value is None:
        return None

    # unwrap union and optional types
    if is_union_type(py_type):
        py_type = [t for t in py_type.__args__ if t != type(None)][0]  # type: ignore

    if py_type == Any:
        return convert_to_dynamo(value)
    elif py_type == bytes:
        return {"B": base64.b64encode(value).decode()}
    elif get_origin(py_type) == list:
        return {"L": [convert_to_dynamodb_format(v, py_type.__args__[0]) for v in value]}  # type: ignore
    elif get_origin(py_type) == dict:
        if py_type.__args__[0] != str:  # type: ignore
            raise TypeError(f"Unsupported key type for DynamoDB Map: {py_type.__args__[0]}")  # type: ignore
        return {"M": {k: convert_to_dynamodb_format(v, py_type.__args__[1]) for k, v in value.items()}}  # type: ignore
    elif get_origin(py_type) == set:
        if len(value) == 0:
            return None
        if py_type.__args__[0] in {int, float}:  # type: ignore
            return {"NS": [str(v) for v in value]}
        elif py_type.__args__[0] == bytes:  # type: ignore
            return {"BS": [base64.b64encode(v).decode() for v in value]}
        elif py_type.__args__[0] == str:  # type: ignore
            return {"SS": [str(v) for v in value]}
    elif py_type == list:
        return {"S": json.dumps(value)}
    elif py_type == dict:
        return {"S": json.dumps(value)}
    elif py_type == str:
        return {"S": value}
    elif py_type == int:
        return {"N": str(value)}
    elif py_type == float:
        return {"N": str(value)}
    elif py_type == bool:
        return {"BOOL": value is True}
    elif py_type == datetime:
        return {"S": value.isoformat()}
    elif issubclass(py_type, enum.Enum):
        return convert_to_dynamo(value.value)
    else:
        raise TypeError(f"Unsupported type for DynamoDB: {py_type}")


def convert_from_dynamodb_format(item: Dict[str, Any], py_type: Type) -> Any:
    """
    Convert a value from its DynamoDB representation to the specified Python type.

    :param item: A dictionary representing the DynamoDB format of the value.
    :param py_type: The Python type to convert to.
    :return: The Python value corresponding to the DynamoDB item.
    """
    # unwrap union and optional types
    if is_union_type(py_type):
        py_type = [t for t in py_type.__args__ if t != type(None)][0]  # type: ignore

    if get_origin(py_type) == set and py_type.__args__[0] in {int, float}:  # type: ignore
        return {py_type.__args__[0](v) for v in item.get("NS", [])}  # type: ignore
    elif get_origin(py_type) == set and py_type.__args__[0] == bytes:  # type: ignore
        return {base64.b64decode(v) for v in item.get("BS", [])}
    elif get_origin(py_type) == set and py_type.__args__[0] == str:  # type: ignore
        return {str(v) for v in item.get("SS", [])}
    elif get_origin(py_type) == dict:
        if py_type.__args__[0] != str:  # type: ignore
            raise TypeError(
                f"Unsupported key type for DynamoDB Map: {py_type.__args__[0]}"  # type: ignore
            )
        return {k: convert_from_dynamodb_format(v, py_type.__args__[1]) for k, v in item.get("M", {}).items()}  # type: ignore
    elif get_origin(py_type) == list:
        return [
            convert_from_dynamodb_format(v, py_type.__args__[0])  # type: ignore
            for v in item.get("L", [])
        ]
    elif py_type == str:
        return item.get("S", None)
    elif py_type in [int, float]:
        return py_type(item.get("N", 0))
    elif py_type == bool:
        return item.get("BOOL", False)
    elif py_type == dict:
        json_str = item.get("S", "{}")
        return json.loads(json_str) if json_str else {}
    elif py_type == list:
        json_str = item.get("S", "[]")
        return json.loads(json_str) if json_str else []
    elif py_type == datetime:
        date_str = item.get("S", None)
        try:
            return datetime.fromisoformat(date_str) if date_str else None
        except ValueError:
            return datetime.strptime(date_str, "%Y-%m-%dT%H:%M:%S.%f%z")
    elif py_type == Any:
        json_str = item.get("S", "{}")
        try:
            return json.loads(json_str) if json_str else {}
        except json.JSONDecodeError:
            return json_str
    else:
        raise TypeError(f"Unsupported type for conversion from DynamoDB: {py_type}")


def convert_from_dynamo_attributes(
    fields: dict[str, FieldInfo], attributes: dict[str, Any]
) -> dict[str, Any]:
    """
    Convert the DynamoDB attributes to Python types.
    Each field is converted based on its type annotation.
    Python types are converted to DynamoDB types using convert_to_dynamo.
    This method is used when retrieving a model instance from DynamoDB.

    Args:
        attributes (dict[str, Any]): The DynamoDB attributes to be converted.

    Returns:
        dict[str, Any]: The converted attributes with Python types.
    """
    converted_attributes = {}
    for field_name, field_info in fields.items():
        field_value = attributes.get(field_name, {})
        field_type = field_info.annotation
        converted_attributes[field_name] = convert_from_dynamodb_format(
            field_value, field_type  # type: ignore
        )
    return converted_attributes


def convert_to_dynamo_attributes(
    fields: dict[str, FieldInfo], attributes: dict[str, Any]
) -> Dict[str, Any]:
    """
    Convert the instance to a DB-compatible dictionary.
    This method is used when saving a model instance to DynamoDB.

    Args:
        fields (dict[str, FieldInfo]): The fields of the model.
        attributes (dict[str, Any]): The DynamoDB attributes to be converted.

    Returns:
        dict[str, Any]: The DynamoDB-compatible dictionary.
    """
    dynamo_dict = {}

    for field_name, field_info in fields.items():
        field_type = field_info.annotation
        field_value = attributes[field_name]
        assert (
            field_info.json_schema_extra is not None
        ), f"Missing json_schema_extra for {field_name} in {fields}"
        use_map = field_info.json_schema_extra.get("use_map", False)
        if use_map:
            field_value = {k: convert_to_dynamo(v) for k, v in field_value.items()}
            dynamo_value = {"M": field_value}
        else:
            dynamo_value = convert_to_dynamodb_format(
                field_value,
                field_type,  # type: ignore
            )
        if dynamo_value is not None:
            dynamo_dict[field_name] = dynamo_value

    return dynamo_dict


class DynamoAdapter(DatabaseAdapter):
    client: Any
    table_name: str
    fields: Dict[str, Any]
    table_schema: Dict[str, Any]

    def __init__(
        self,
        client: Any,
        fields: Dict[str, Any],
        table_schema: Dict[str, Any],
    ):
        self.client = client
        self.fields = fields
        self.table_schema = table_schema
        self.table_name = table_schema["table_name"]

    def create_table(self) -> None:
        table_name = self.table_name
        key_schema = self.table_schema["key_schema"]
        attribute_definitions = self.table_schema["attribute_definitions"]
        global_secondary_indexes = self.table_schema.get("global_secondary_indexes", {})
        read_capacity_units = self.table_schema.get("read_capacity_units", 1)
        write_capacity_units = self.table_schema.get("write_capacity_units", 1)

        # Prepare key schema list
        key_schema_list = [
            {"AttributeName": name, "KeyType": key_type}
            for name, key_type in key_schema.items()
        ]

        # Prepare attribute definitions list
        attribute_definitions_list = [
            {"AttributeName": name, "AttributeType": type}
            for name, type in attribute_definitions.items()
        ]

        # Prepare global secondary indexes
        gsi_list = []
        if global_secondary_indexes:
            for index_name, schema in global_secondary_indexes.items():
                gsi_list.append(
                    {
                        "IndexName": index_name,
                        "KeySchema": [
                            {"AttributeName": name, "KeyType": key_type}
                            for name, key_type in schema.items()
                        ],
                        "Projection": {"ProjectionType": "ALL"},
                        "ProvisionedThroughput": {
                            "ReadCapacityUnits": read_capacity_units,
                            "WriteCapacityUnits": write_capacity_units,
                        },
                    }
                )

        # Table creation parameters
        table_params = {
            "TableName": table_name,
            "KeySchema": key_schema_list,
            "AttributeDefinitions": attribute_definitions_list,
            "ProvisionedThroughput": {
                "ReadCapacityUnits": read_capacity_units,
                "WriteCapacityUnits": write_capacity_units,
            },
        }

        if gsi_list:
            table_params["GlobalSecondaryIndexes"] = gsi_list

        dynamodb = Environment.get_dynamo_client()

        if table_name in dynamodb.list_tables()["TableNames"]:
            log.info(f"Table {table_name} already exists")
            return

        try:
            dynamodb.create_table(**table_params)
        except Exception as e:
            log.info(f"Table {table_name}: {e}")
            raise e
        else:
            log.info(f"Table {table_name} created")

    def drop_table(self) -> None:
        table_name = self.table_name
        dynamodb = Environment.get_dynamo_client()
        try:
            dynamodb.delete_table(TableName=table_name)
        except Exception as e:
            log.info(f"Table {table_name}: {e}")
            raise e
        else:
            log.info(f"Table {table_name} deleted")

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

    def save(self, item: Dict[str, Any]) -> None:
        item = convert_to_dynamo_attributes(self.fields, item)
        try:
            self.client.put_item(TableName=self.table_name, Item=item)
        except Exception as e:
            log.error(f"Error saving {self.table_name}: {e} using {item}")
            raise e

    def get(self, key: Any) -> Dict[str, Any] | None:
        """
        Retrieve a model instance from DynamoDB using a key.
        The key can be a number, string.
        """

        try:
            dynamo_key = {
                self.get_primary_key(): {"S": str(key)},
            }
            response = self.client.get_item(TableName=self.table_name, Key=dynamo_key)
        except Exception as e:
            log.error(f"Error getting {self.table_name} with key {key}: {e}")
            raise e

        item = response.get("Item", None)
        if item is None:
            return None
        return convert_from_dynamo_attributes(self.fields, item)

    def delete(self, partition_value) -> None:
        self.client.delete_item(
            TableName=self.table_name,
            Key={
                self.get_primary_key(): {"S": partition_value},
            },
        )

    def query(
        self,
        condition: str,
        values: dict[str, Any],
        index: str | None = None,
        start_key: str | None = None,
        limit: int = 100,
        reverse: bool = False,
    ) -> tuple[list[dict[str, Any]], str]:
        """
        Query the DynamoDB table for the model to retrieve a list of items.
        This method is used for pagination and returns a tuple containing a list of items and the last evaluated key.
        It allows for filtering and sorting the results.

        Args:
            client: The DynamoDB client to use for the query.
            table_name: The name of the DynamoDB table to query.
            condition: The condition for the query based on the primary key.
            values: The values for the condition.
            index: The name of the index to use for the query.
            start_key: The exclusive start key for pagination.
            limit: The maximum number of items to retrieve.

        Returns:
            A tuple containing a list of items that match the query conditions and the last evaluated key.
        """
        # convert values to DynamoDB format
        values = {
            key: convert_to_dynamo(value) for key, value in values.items() if value
        }
        # Query parameters for DynamoDB query
        query_params = {
            "TableName": self.table_name,
            "KeyConditionExpression": condition,
            "ExpressionAttributeValues": values,
            "Limit": limit,
            "ScanIndexForward": not reverse,
        }
        if index:
            query_params["IndexName"] = index

        if start_key and start_key != "":
            query_params["ExclusiveStartKey"] = json.loads(start_key)

        # log.info("Querying DynamoDB: %s", query_params)

        try:
            response = self.client.query(**query_params)
        except Exception as e:
            log.error(f"Error querying {self.table_name}: {e}")
            raise e
        items = response.get("Items", [])

        # Extract the last evaluated key
        last_evaluated_key = (
            json.dumps(response.get("LastEvaluatedKey"))
            if response.get("LastEvaluatedKey")
            else ""
        )

        # Convert DynamoDB items to model objects
        items = [convert_from_dynamo_attributes(self.fields, item) for item in items]
        return items, last_evaluated_key
