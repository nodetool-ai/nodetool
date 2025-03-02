import os
import sys
import json
import argparse
import openai
from openai.types.shared_params.response_format_json_schema import (
    ResponseFormatJSONSchema,
)


JSON_SCHEMA = {
    "$schema": "http://json-schema.org/draft-07/schema#",
    "title": "Workflow Schema",
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "access": {"type": "string"},
        "created_at": {"type": "string", "format": "date-time"},
        "updated_at": {"type": "string", "format": "date-time"},
        "name": {"type": "string"},
        "description": {"type": "string"},
        "tags": {
            "anyOf": [{"type": "array", "items": {"type": "string"}}, {"type": "null"}]
        },
        "thumbnail": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "thumbnail_url": {"anyOf": [{"type": "string"}, {"type": "null"}]},
        "graph": {
            "type": "object",
            "properties": {
                "nodes": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "parent_id": {
                                "anyOf": [{"type": "string"}, {"type": "null"}]
                            },
                            "type": {"type": "string"},
                            "data": {"type": "object"},
                            "ui_properties": {
                                "type": "object",
                                "properties": {
                                    "position": {
                                        "type": "object",
                                        "properties": {
                                            "x": {"type": "number"},
                                            "y": {"type": "number"},
                                        },
                                        "required": ["x", "y"],
                                    },
                                    "zIndex": {"type": "number"},
                                    "width": {"type": "number"},
                                    "height": {"type": "number"},
                                    "selectable": {"type": "boolean"},
                                },
                                "required": [
                                    "position",
                                    "zIndex",
                                    "width",
                                    "selectable",
                                ],
                            },
                            "dynamic_properties": {"type": "object"},
                        },
                        "required": [
                            "id",
                            "type",
                            "data",
                            "ui_properties",
                            "dynamic_properties",
                        ],
                    },
                },
                "edges": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "id": {"type": "string"},
                            "source": {"type": "string"},
                            "sourceHandle": {"type": "string"},
                            "target": {"type": "string"},
                            "targetHandle": {"type": "string"},
                            "ui_properties": {
                                "type": "object",
                                "properties": {"className": {"type": "string"}},
                            },
                        },
                        "required": [
                            "id",
                            "source",
                            "sourceHandle",
                            "target",
                            "targetHandle",
                            "ui_properties",
                        ],
                    },
                },
            },
            "required": ["nodes", "edges"],
        },
        "input_schema": {"anyOf": [{"type": "object"}, {"type": "null"}]},
        "output_schema": {"anyOf": [{"type": "object"}, {"type": "null"}]},
    },
    "required": [
        "id",
        "access",
        "created_at",
        "updated_at",
        "name",
        "description",
        "graph",
    ],
}


def load_example_jsons(directory):
    """
    Load and parse all JSON files from the given directory.

    Args:
        directory (str): Path to the directory containing JSON example files.

    Returns:
        list: List of parsed JSON objects.
    """
    examples = []
    if not os.path.isdir(directory):
        print(f"Directory not found: {directory}")
        return examples

    for filename in os.listdir(directory):
        if filename.endswith(".json"):
            filepath = os.path.join(directory, filename)
            try:
                with open(filepath, "r") as f:
                    content = json.load(f)
                    examples.append(content)
            except Exception as e:
                print(f"Error loading {filename}: {e}")
    return examples


def build_context_message(examples, nodes_metadata=None):
    """
    Build a context string from the provided example JSON objects and nodes metadata.

    Args:
        examples (list): List of JSON objects.
        nodes_metadata (dict): Nodes metadata JSON object.

    Returns:
        str: A string that contains formatted examples and metadata.
    """
    context = "JSON Examples:\n\n"
    for example in examples:
        context += json.dumps(example, indent=2)
        context += "\n\n"

    if nodes_metadata:
        context += "Nodes Metadata:\n"
        context += json.dumps(nodes_metadata, indent=2)
        context += "\n\n"

    return context


def generate_workflow(user_prompt, examples):
    """
    Combine the JSON examples with the user prompt and send the request to the OpenAI API.

    Args:
        user_prompt (str): The prompt provided by the user.
        examples (list): List of example JSON objects.

    Returns:
        str: The generated workflow from the API.
    """
    nodes_metadata = load_metadata_json()
    assert type(nodes_metadata) == list
    nodes_metadata = [
        {
            "node_type": node["node_type"],
            "properties": [p["name"] for p in node["properties"]],
        }
        for node in nodes_metadata
    ]
    properties_metadata = [node["properties"] for node in nodes_metadata]
    context_message = build_context_message(examples, nodes_metadata)
    # Combine the JSON context with the user prompt.
    full_prompt = (
        f"{context_message}\n"
        f"User Prompt: {user_prompt}\n\n"
        "Please generate a workflow in JSON format based on the above examples and prompt."
    )

    try:
        response = openai.chat.completions.create(
            model="o3-mini",
            messages=[
                {
                    "role": "user",
                    "content": "You are an assistant that generates workflows based on JSON examples.",
                },
                {"role": "user", "content": full_prompt},
            ],
            response_format=ResponseFormatJSONSchema(
                type="json_schema",
                json_schema={
                    "name": "workflow",
                    "schema": JSON_SCHEMA,
                },
            ),
        )
        generated_workflow = response.choices[0].message.content
        # Print response metrics
        print(f"Response: {response.usage}")
    except Exception as e:
        generated_workflow = f"Error calling OpenAI API: {e}"
    return generated_workflow


def main():
    """
    Main function that parses arguments, loads JSON examples,
    calls the OpenAI API, and prints the generated workflow.
    """
    parser = argparse.ArgumentParser(
        description="Generate a workflow based on a given prompt using example JSON files."
    )
    parser.add_argument(
        "--prompt",
        "-p",
        required=True,
        help="The prompt to use for workflow generation.",
    )
    parser.add_argument(
        "--examples-dir",
        "-e",
        default="examples",
        help="Directory containing the example JSON files.",
    )
    args = parser.parse_args()

    # Ensure that OPENAI_API_KEY is available.
    if not os.environ.get("OPENAI_API_KEY"):
        print("Please set the OPENAI_API_KEY environment variable.")
        sys.exit(1)
    openai.api_key = os.environ.get("OPENAI_API_KEY")

    examples = load_example_jsons(args.examples_dir)
    if not examples:
        print("No valid JSON examples could be loaded. Exiting.")
        sys.exit(1)

    result = generate_workflow(args.prompt, examples)
    print("Generated Workflow:")
    print(result)


if __name__ == "__main__":
    main()
