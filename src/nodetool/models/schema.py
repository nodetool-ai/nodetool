# Create the DynamoDB table
from nodetool.common.environment import Environment

from nodetool.models.asset import Asset
from nodetool.models.job import Job
from nodetool.models.message import Message
from nodetool.models.prediction import Prediction
from nodetool.models.task import Task
from nodetool.models.thread import Thread
from nodetool.models.user import User
from nodetool.models.workflow import Workflow

log = Environment.get_logger()


def generate_terraform_config(schema):
    key_schema_reverse = {v: k for k, v in schema["key_schema"].items()}
    hash_key = key_schema_reverse["HASH"]
    range_key = key_schema_reverse.get("RANGE", None)

    config = f'resource "aws_dynamodb_table" "{schema["table_name"]}" {{\n'
    config += '  name           = "{}"\n'.format(schema["table_name"])
    config += '  billing_mode   = "PAY_PER_REQUEST"\n'
    # config += "  read_capacity  = 1\n"
    # config += "  write_capacity = 1\n"
    config += '  hash_key       = "{}"\n'.format(hash_key)

    if range_key:
        config += '  range_key      = "{}"\n'.format(range_key)

    for name, type in schema["attribute_definitions"].items():
        config += "  attribute {\n"
        config += '    name = "{}"\n'.format(name)
        config += '    type = "{}"\n'.format(type)
        config += "  }\n"

    for index_name, index_schema in schema.get("global_secondary_indexes", {}).items():
        index_schema_reverse = {v: k for k, v in index_schema.items()}
        index_hash_key = index_schema_reverse["HASH"]
        index_range_key = index_schema_reverse.get("RANGE", None)

        config += "  global_secondary_index {\n"
        config += '    name            = "{}"\n'.format(index_name)
        config += '    hash_key        = "{}"\n'.format(index_hash_key)
        # config += "    write_capacity  = 1\n"
        # config += "    read_capacity   = 1\n"
        config += '    projection_type = "ALL"\n'

        if index_range_key:
            config += '    range_key       = "{}"\n'.format(index_range_key)

        config += "  }\n"

    config += "}\n"

    return config


models = [Asset, Job, Message, Prediction, Task, Thread, User, Workflow]


def write_all_configs_to_file(fname: str):
    with open(fname, "w") as f:
        for model in models:
            schema = model.get_table_schema()
            config = generate_terraform_config(schema)
            f.write(config + "\n")


def create_all_tables():
    for model in models:
        model.create_table()


def drop_all_tables():
    for model in models:
        model.drop_table()
