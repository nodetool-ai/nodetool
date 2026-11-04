"""Compile trusted NodeTool Torch documents into packaged AOTInductor artifacts."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import tempfile
import time

import torch
import triton

from torch_graph import translate_graph, validate_graph, editor_metadata


def configure_numerics():
    torch.set_float32_matmul_precision('highest')
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False


def toolchain():
    return {'torch': torch.__version__, 'triton': triton.__version__,
            'python': platform.python_version(), 'cuda': torch.version.cuda}


def target_requirements(target):
    requirements = {"architecture": platform.machine()}
    if target == "cuda":
        requirements["cuda_capability"] = list(torch.cuda.get_device_capability())
    else:
        requirements["cpu_capability"] = torch.backends.cpu.get_cpu_capability()
    return requirements


def normalized_graph(document):
    return {'settings': {'execution': document['settings']['execution']},
            'nodes': [{key: node[key] for key in ('id', 'type', 'properties') if key in node}
                      for node in document['nodes']],
            'edges': [{key: edge[key] for key in ('source', 'sourceHandle', 'target', 'targetHandle', 'type') if key in edge}
                      for edge in document['edges']]}


def compile_package(exported, path):
    # PyTorch 2.9's package API is isolated here for toolchain upgrades.
    return torch._inductor.aoti_compile_and_package(
        exported, package_path=str(path), inductor_configs={'max_autotune': False})


def compile_graph(document, target, output_dir):
    if target not in ('cpu', 'cuda'):
        raise ValueError('target must be cpu or cuda')
    validate_graph(document)
    configure_numerics()
    if target == 'cuda' and not torch.cuda.is_available():
        raise RuntimeError('CUDA target requested but CUDA is unavailable')
    compiler_hash = hashlib.sha256(Path(__file__).read_bytes() + Path(__file__).with_name('torch_graph.py').read_bytes()).hexdigest()
    identity = {'compiler_hash': compiler_hash, 'graph': normalized_graph(document), 'target': target, 'toolchain': toolchain(),
                'target_requirements': target_requirements(target),
                'compiler_options': {'max_autotune': False, 'allow_tf32': False, 'matmul_precision': 'highest'}}
    graph_hash = hashlib.sha256(json.dumps(identity, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()).hexdigest()
    destination = Path(output_dir).resolve()
    manifest_path = destination / 'manifest.json'
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        package = destination / 'package.pt2'
        if manifest.get('graph_hash') == graph_hash and package.is_file() and hashlib.sha256(package.read_bytes()).hexdigest() == manifest.get('artifact_sha256'):
            return manifest_path
        raise ValueError('output directory contains an incompatible artifact; use a new directory')
    if destination.exists():
        raise ValueError('output directory already exists without a completed artifact')
    destination.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.torch-build-', dir=destination.parent))
    try:
        started = time.perf_counter()
        module, examples, signatures = translate_graph(document, device=target)
        exported = torch.export.export(module, examples, strict=True)
        compile_package(exported, stage / 'package.pt2')
        manifest = {'version': 1, 'graph_version': 1, 'target': target, 'torch_version': torch.__version__,
                    'toolchain': toolchain(), 'graph_hash': graph_hash,
                    'artifact_sha256': hashlib.sha256((stage / 'package.pt2').read_bytes()).hexdigest(),
                    'inputs': signatures['inputs'], 'outputs': signatures['outputs'],
                    'compiler_options': identity['compiler_options'], 'target_requirements': identity['target_requirements'],
                    'compile_seconds': time.perf_counter() - started}
        (stage / 'manifest.json').write_text(json.dumps(manifest, indent=2, allow_nan=False) + '\n')
        os.rename(stage, destination)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    return manifest_path


def editor_graph(document):
    """Adapt compiler fixtures to NodeTool's persisted property and layout fields."""
    validated = validate_graph(document)
    depths, lanes = {}, {}
    nodes = []
    for node_id in validated['order']:
        parents = [source for (target, _), source in validated['incoming'].items() if target == node_id]
        depth = max((depths[parent] + 1 for parent in parents), default=0)
        lane = lanes.get(depth, 0)
        depths[node_id], lanes[depth] = depth, lane + 1
        source = validated['nodes'][node_id]
        nodes.append({'id': source['id'], 'type': source['type'], 'data': source.get('properties', {}),
                      'ui_properties': {'position': {'x': depth * 400, 'y': lane * 400}}})
    by_id = {node['id']: node for node in nodes}
    return {'nodes': [by_id[node['id']] for node in document['nodes']], 'edges': document['edges']}


def compiler_document(document):
    """Read editor data without treating editor-generated empty slot maps as slots."""
    nodes = []
    for source in document.get('nodes', []):
        if not isinstance(source, dict):
            nodes.append(source)
            continue
        node = dict(source)
        if 'data' in node:
            if 'properties' in node and node['properties'] != node['data']:
                raise ValueError(f"node {node.get('id')}: conflicting property representations")
            node['properties'] = node.pop('data')
        for key in ('dynamic_properties', 'dynamic_outputs'):
            if node.get(key) == {}:
                node.pop(key)
        nodes.append(node)
    return {**document, 'nodes': nodes}


def validate_local_budget(document):
    """Inspect fake intermediates before allocating examples for a local UI job."""
    from torch._subclasses.fake_tensor import FakeTensorMode
    class BoundedInterpreter(torch.fx.Interpreter):
        def run_node(self, node):
            result = super().run_node(node)
            values = result if isinstance(result, (tuple, list)) else [result]
            for value in values:
                if isinstance(value, torch.Tensor) and value.numel() > 1_000_000:
                    raise ValueError(f'node {node.name}: local UI tensor limit is 1000000 elements')
            return result
    with FakeTensorMode():
        module, examples, _ = translate_graph(document)
        for value in examples:
            if value.numel() > 1_000_000:
                raise ValueError('local UI input tensor limit is 1000000 elements')
        BoundedInterpreter(module).run(*examples)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('catalog')
    sub.add_parser('capabilities')
    compile_parser = sub.add_parser('compile')
    compile_parser.add_argument('graph', type=Path)
    compile_parser.add_argument('--bounded-local', action='store_true')
    compile_parser.add_argument('--target', choices=('cpu', 'cuda'), required=True)
    compile_parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.command == 'capabilities':
        print(json.dumps({'targets': ['cpu', 'cuda'] if torch.cuda.is_available() else ['cpu']}))
    elif args.command == 'catalog':
        templates = []
        expected = json.loads(Path(__file__).parent.joinpath('examples/golden/expected.json').read_text())
        for path in sorted(Path(__file__).parent.joinpath('examples/golden').glob('*.json')):
            if path.name == 'expected.json':
                continue
            document = json.loads(path.read_text())
            templates.append({'id': path.stem, 'name': path.stem.replace('-', ' ').title(),
                              'graph': editor_graph(document),
                              'settings': document['settings'],
                              'exampleInputs': {node['properties']['name']: {'shape': node['properties']['shape'],
                                                'values': expected[path.stem]['inputs'][node['properties']['name']]}
                                                for node in document['nodes'] if node['type'] == 'nodetool.torch.Input'}})
        print(json.dumps({'nodes': editor_metadata(), 'templates': templates}))
    else:
        document = compiler_document(json.loads(args.graph.read_text()))
        if args.bounded_local:
            validate_local_budget(document)
        print(compile_graph(document, args.target, args.output))


if __name__ == '__main__':
    main()
