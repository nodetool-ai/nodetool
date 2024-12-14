import pytest
from nodetool.nodes.nodetool.group import Loop
from nodetool.nodes.nodetool.input import IntegerInput
from nodetool.nodes.nodetool.math import Multiply
from nodetool.types.graph import Node, Edge
from nodetool.workflows.read_graph import read_graph, GraphParsingError


if False:
    # Test does not run on CI due to
    def test_read_graph_comfy_workflow():
        # Original test case
        workflow_json = {
            "ksampler": {
                "inputs": {
                    "seed": 156680208700286,
                    "steps": 20,
                    "cfg": 8,
                    "sampler_name": "euler",
                    "scheduler": "normal",
                    "denoise": 1,
                    "model": ["ckptloader", "model"],
                    "positive": ["clipencode1", "conditioning"],
                    "negative": ["clipencode2", "conditioning"],
                    "latent_image": ["emptylatent", "latent"],
                },
                "class_type": "KSampler",
            },
            "ckptloader": {
                "inputs": {"ckpt_name": "Realistic_Vision_V5.safetensors"},
                "class_type": "CheckpointLoaderSimple",
            },
            "emptylatent": {
                "inputs": {"width": 512, "height": 512, "batch_size": 1},
                "class_type": "EmptyLatentImage",
            },
            "clipencode1": {
                "inputs": {
                    "text": "beautiful scenery nature glass bottle landscape, , purple galaxy bottle,",
                    "clip": ["ckptloader", "clip"],
                },
                "class_type": "CLIPTextEncode",
            },
            "clipencode2": {
                "inputs": {
                    "text": "text, watermark",
                    "clip": ["ckptloader", "clip"],
                },
                "class_type": "CLIPTextEncode",
            },
            "vaedecode": {
                "inputs": {
                    "samples": ["ksampler", "latent"],
                    "vae": ["ckptloader", "vae"],
                },
                "class_type": "VAEDecode",
            },
            "saveimage": {
                "inputs": {"images": ["vaedecode", "image"]},
                "class_type": "SaveImage",
            },
        }

        expected_nodes = [
            Node(id="ksampler", type="comfy.sampling.KSampler"),
            Node(id="ckptloader", type="comfy.loaders.CheckpointLoaderSimple"),
            Node(id="emptylatent", type="comfy.latent.EmptyLatentImage"),
            Node(id="clipencode1", type="comfy.conditioning.CLIPTextEncode"),
            Node(id="clipencode2", type="comfy.conditioning.CLIPTextEncode"),
            Node(id="vaedecode", type="comfy.latent.VAEDecode"),
            Node(id="saveimage", type="comfy.image.SaveImage"),
        ]

        expected_edges_data = {
            ("ckptloader", "model", "ksampler", "model"),
            ("clipencode1", "conditioning", "ksampler", "positive"),
            ("clipencode2", "conditioning", "ksampler", "negative"),
            ("emptylatent", "latent", "ksampler", "latent_image"),
            ("ksampler", "latent", "vaedecode", "samples"),
            ("ckptloader", "clip", "clipencode1", "clip"),
            ("ckptloader", "clip", "clipencode2", "clip"),
            ("ckptloader", "vae", "vaedecode", "vae"),
            ("vaedecode", "image", "saveimage", "images"),
        }

        result_edges, result_nodes = read_graph(workflow_json)

        assert len(result_nodes) == len(expected_nodes)
        for result_node, expected_node in zip(result_nodes, expected_nodes):
            assert result_node.id == expected_node.id
            assert result_node.type == expected_node.type

        result_edges_tuples = {
            (edge.source, edge.sourceHandle, edge.target, edge.targetHandle)
            for edge in result_edges
        }

        assert result_edges_tuples == expected_edges_data


def test_read_graph_custom_format():
    custom_json = {
        "input_node": {"type": "nodetool.input.IntegerInput", "data": {"value": 10}},
        "multiply_node": {
            "type": "nodetool.math.Multiply",
            "data": {"a": ["input_node", "value"], "b": 2},
        },
    }

    expected_nodes = [
        Node(id="input_node", type="nodetool.input.IntegerInput", data={"value": 10}),
        Node(id="multiply_node", type="nodetool.math.Multiply", data={"b": 2}),
    ]

    expected_edges_data = {
        ("input_node", "value", "multiply_node", "a"),
    }

    result_edges, result_nodes = read_graph(custom_json)

    assert len(result_nodes) == len(expected_nodes)
    for result_node, expected_node in zip(result_nodes, expected_nodes):
        assert result_node.id == expected_node.id
        assert result_node.type == expected_node.type
        assert result_node.data == expected_node.data

    result_edges_tuples = {
        (edge.source, edge.sourceHandle, edge.target, edge.targetHandle)
        for edge in result_edges
    }

    assert result_edges_tuples == expected_edges_data


def test_read_graph_invalid_node_type():
    invalid_json = {
        "node1": {
            "type": "InvalidNodeType",
        }
    }
    with pytest.raises(GraphParsingError):
        read_graph(invalid_json)


def test_read_graph_missing_source_node():
    invalid_json = {
        "node1": {
            "type": "IntegerInput",
            "data": {"input": ["non_existent_node", "output"]},
        }
    }
    with pytest.raises(GraphParsingError):
        read_graph(invalid_json)


def test_read_graph_with_ui_properties():
    json_with_ui = {
        "node1": {
            "type": "nodetool.input.IntegerInput",
            "position": [100, 200],
            "width": 150,
            "height": 100,
        }
    }

    _, result_nodes = read_graph(json_with_ui)

    assert len(result_nodes) == 1
    assert result_nodes[0].ui_properties == {
        "position": [100, 200],
        "width": 150,
        "height": 100,
    }


def test_read_graph_with_parent_id():
    json_with_parent = {
        "parent_node": {
            "type": "nodetool.group.Loop",
        },
        "child_node": {
            "type": "nodetool.input.IntegerInput",
            "parent_id": "parent_node",
        },
    }

    _, result_nodes = read_graph(json_with_parent)

    assert len(result_nodes) == 2
    child_node = next(node for node in result_nodes if node.id == "child_node")
    assert child_node.parent_id == "parent_node"


if __name__ == "__main__":
    pytest.main([__file__])
