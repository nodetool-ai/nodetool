from nodetool.types.graph import Node
from nodetool.nodes.comfy.conditioning import CLIPTextEncode
from nodetool.nodes.comfy.image import SaveImage
from nodetool.nodes.comfy.latent import EmptyLatentImage, VAEDecode
from nodetool.nodes.comfy.loaders import CheckpointLoaderSimple
from nodetool.nodes.comfy.sampling import KSampler
from nodetool.workflows.read_graph import read_graph


def test_read_graph():
    # Define the input JSON representing a Comfy workflow
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

    # Define expected nodes
    expected_nodes = [
        Node(id="ksampler", type="comfy.sampling.KSampler"),
        Node(id="ckptloader", type="comfy.loaders.CheckpointLoaderSimple"),
        Node(id="emptylatent", type="comfy.latent.EmptyLatentImage"),
        Node(id="clipencode1", type="comfy.conditioning.CLIPTextEncode"),
        Node(id="clipencode2", type="comfy.conditioning.CLIPTextEncode"),
        Node(id="vaedecode", type="comfy.latent.VAEDecode"),
        Node(id="saveimage", type="comfy.image.SaveImage"),
    ]

    # Define expected edges
    expected_edges_data = {
        (
            "ckptloader",
            "model",
            "ksampler",
            "model",
        ),
        (
            "clipencode1",
            "conditioning",
            "ksampler",
            "positive",
        ),
        (
            "clipencode2",
            "conditioning",
            "ksampler",
            "negative",
        ),
        (
            "emptylatent",
            "latent",
            "ksampler",
            "latent_image",
        ),
        (
            "ksampler",
            "latent",
            "vaedecode",
            "samples",
        ),
        (
            "ckptloader",
            "clip",
            "clipencode1",
            "clip",
        ),
        (
            "ckptloader",
            "clip",
            "clipencode2",
            "clip",
        ),
        (
            "ckptloader",
            "vae",
            "vaedecode",
            "vae",
        ),
        (
            "vaedecode",
            "image",
            "saveimage",
            "images",
        ),
    }

    # Call the function under test
    result_edges, result_nodes = read_graph(workflow_json)

    # Assert the expected output for nodes
    assert len(result_nodes) == len(expected_nodes)
    for result_node, expected_node in zip(result_nodes, expected_nodes):
        assert result_node.id == expected_node.id
        assert result_node.type == expected_node.type

    # Assert the expected output for edges
    # disregard the order of the edges

    result_edges_tuples = {
        (edge.source, edge.sourceHandle, edge.target, edge.targetHandle)
        for edge in result_edges
    }

    assert result_edges_tuples == expected_edges_data
