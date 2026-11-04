#!/usr/bin/env python3
"""Verify Torch graph contracts and independent eager/C++ AOT goldens."""
import argparse
import copy
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import torch
from build_tool import compile_graph, configure_numerics, normalized_graph
from torch_graph import GraphError, translate_graph, validate_graph

GOLDENS = ROOT / 'examples' / 'golden'
EXPECTED = json.loads((GOLDENS / 'expected.json').read_text())
PARSER = argparse.ArgumentParser(description=__doc__)
PARSER.add_argument('--runner', type=Path, default=ROOT.parents[1] / 'build/native-workflow/nodetool-workflow')
PARSER.add_argument('--targets', nargs='+', choices=('cpu', 'cuda'), default=['cpu'])
PARSER.add_argument('--artifacts', type=Path)
PARSER.add_argument('--eager-only', action='store_true')
OPTIONS, UNITTEST_ARGS = PARSER.parse_known_args()
configure_numerics()


def document(name):
    return json.loads((GOLDENS / (name + '.json')).read_text())


def simple_graph():
    return {'settings': {'execution': {'kind': 'torch', 'version': 1}}, 'nodes': [
        {'id': 'x', 'type': 'nodetool.torch.Input', 'properties': {'name': 'x', 'dtype': 'float32', 'shape': [7]}},
        {'id': 'two', 'type': 'nodetool.torch.Constant', 'properties': {'dtype': 'float32', 'shape': [], 'values': [2]}},
        {'id': 'mul', 'type': 'nodetool.torch.Multiply', 'properties': {}},
        {'id': 'out', 'type': 'nodetool.torch.Output', 'properties': {'name': 'y'}}],
        'edges': [{'source': source, 'sourceHandle': 'output', 'target': target, 'targetHandle': port}
                  for source, target, port in [('x', 'mul', 'a'), ('two', 'mul', 'b'), ('mul', 'out', 'value')]]}


def tensor_inputs(signatures, values):
    return tuple(torch.tensor(values[entry['name']], dtype=torch.float32).reshape(entry['shape']).contiguous()
                 for entry in signatures)


def encoded(value):
    if math.isnan(value):
        return 'nan'
    if math.isinf(value):
        return 'inf' if value > 0 else '-inf'
    if value == 0 and math.copysign(1, value) < 0:
        return '-0.0'
    return value


def decoded(value):
    return float(value)


class GraphContracts(unittest.TestCase):
    def test_invalid_documents(self):
        mutations = [
            lambda d: d.update(settings={'execution': {'kind': 'native', 'version': 1}}),
            lambda d: d['nodes'].append(copy.deepcopy(d['nodes'][0])),
            lambda d: d['nodes'].append({'id': 'unused', 'type': 'nodetool.torch.Python', 'properties': {}}),
            lambda d: d['nodes'][0]['properties'].update(dtype='float64'),
            lambda d: d['nodes'][0]['properties'].update(shape=[True]),
            lambda d: d['settings']['execution'].update(version=True),
            lambda d: d.update(settings=[]),
            lambda d: d['edges'].append({'source': [], 'target': 'out'}),
            lambda d: d['nodes'][0]['properties'].update(import_name='os'),
            lambda d: d['nodes'][1]['properties'].update(values=[float('nan')]),
            lambda d: d['nodes'][1]['properties'].update(values=[]),
            lambda d: d['nodes'][0].update(dynamic_properties={}),
            lambda d: d['nodes'][0].update(is_streaming=True),
            lambda d: d['edges'][0].update(source='missing'),
            lambda d: d['edges'][0].update(sourceHandle='missing'),
            lambda d: d['edges'][0].update(targetHandle='missing'),
            lambda d: d['edges'][0].update(type='control'),
            lambda d: d['edges'].append(copy.deepcopy(d['edges'][0])),
            lambda d: d['edges'].pop(),
            lambda d: d['edges'][0].update(source='mul'),
        ]
        for index, mutate in enumerate(mutations):
            with self.subTest(case=index):
                value = simple_graph()
                mutate(value)
                with self.assertRaises(GraphError):
                    validate_graph(value)
        disconnected = simple_graph()
        disconnected['nodes'] += [
            {'id': 'a', 'type': 'nodetool.torch.ReLU', 'properties': {}},
            {'id': 'b', 'type': 'nodetool.torch.ReLU', 'properties': {}}]
        disconnected['edges'] += [
            {'source': 'a', 'sourceHandle': 'output', 'target': 'b', 'targetHandle': 'input'},
            {'source': 'b', 'sourceHandle': 'output', 'target': 'a', 'targetHandle': 'input'}]
        with self.assertRaises(GraphError):
            validate_graph(disconnected)
        for value in ({}, {'nodes': 'invalid', 'edges': []}):
            with self.assertRaises(GraphError):
                validate_graph(value)

    def test_torch_rejects_incompatible_shapes(self):
        value = simple_graph()
        value['nodes'][1]['properties'].update(shape=[3], values=[1, 2, 3])
        with self.assertRaises(GraphError):
            translate_graph(value)

    def test_normalization_keeps_compute_and_excludes_editor_state(self):
        value = simple_graph()
        original = copy.deepcopy(normalized_graph(value))
        for node in value['nodes']:
            node.update(position={'x': 31, 'y': -5}, title='editor label')
        self.assertEqual(original, normalized_graph(value))
        value['nodes'][1]['properties']['values'] = [3]
        self.assertNotEqual(original, normalized_graph(value))

    def test_constant_and_replicate_padding(self):
        for mode, value, expected in [('constant', 2, [2, 1, 2, 3, 2]), ('replicate', 0, [1, 1, 2, 3, 3])]:
            graph = simple_graph()
            graph['nodes'] = [graph['nodes'][0], {'id': 'pad', 'type': 'nodetool.torch.Pad',
                                'properties': {'pad': [1, 1], 'mode': mode, 'value': value}}, graph['nodes'][-1]]
            graph['nodes'][0]['properties']['shape'] = [1, 1, 3]
            graph['edges'] = [{'source': source, 'sourceHandle': 'output', 'target': target, 'targetHandle': port}
                              for source, target, port in [('x', 'pad', 'input'), ('pad', 'out', 'value')]]
            module, _, _ = translate_graph(graph)
            self.assertEqual(module(torch.tensor([[[1., 2., 3.]]]))[0].flatten().tolist(), expected)

    def test_strict_export_failure_does_not_publish(self):
        with tempfile.TemporaryDirectory(prefix='torch-export-failure-') as temporary:
            output = Path(temporary) / 'artifact'
            with mock.patch('build_tool.torch.export.export', side_effect=RuntimeError('strict capture failed')) as export:
                with self.assertRaisesRegex(RuntimeError, 'strict capture failed'):
                    compile_graph(simple_graph(), 'cpu', output)
                self.assertTrue(export.call_args.kwargs['strict'])
            self.assertFalse(output.exists())
            self.assertEqual(list(Path(temporary).iterdir()), [])


class GoldenExecution(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='torch-workflow-tests-')
        cls.directory = OPTIONS.artifacts.resolve() if OPTIONS.artifacts else Path(cls.temporary.name) / 'artifacts'
        cls.directory.mkdir(parents=True, exist_ok=True)
        cls.exchange = Path(cls.temporary.name)
        cls.measurements = {}
        if not OPTIONS.eager_only and not OPTIONS.runner.is_file():
            raise RuntimeError(f'C++ AOT runner missing: {OPTIONS.runner}')

    @classmethod
    def tearDownClass(cls):
        if cls.measurements:
            report = {'cases': cls.measurements,
                      'memory_note': 'peak_host_rss_bytes is process RSS high-water including the runtime. GPU peak memory is not measured.'}
            (cls.directory / 'measurements.json').write_text(json.dumps(report, indent=2) + '\n')
            print('Torch workflow measurements: ' + json.dumps(report, sort_keys=True))
        cls.temporary.cleanup()

    def assert_values(self, actual, expected):
        self.assertEqual(len(actual), len(expected))
        for index, (value, reference) in enumerate(zip(actual, expected)):
            value = decoded(value)
            if math.isnan(reference):
                self.assertTrue(math.isnan(value), str(index))
            elif math.isinf(reference):
                self.assertEqual(value, reference, str(index))
            else:
                self.assertTrue(math.isclose(value, reference, rel_tol=1e-6, abs_tol=1e-6),
                                f'element {index}: {value} != {reference}')

    def invoke(self, artifact, manifest, values, success=True, repeat=1):
        source, output = self.exchange / 'inputs.json', self.exchange / 'outputs.json'
        payload = {entry['name']: {'shape': entry['shape'], 'values': [encoded(v) for v in values[entry['name']]]}
                   for entry in manifest['inputs']}
        source.write_text(json.dumps(payload, allow_nan=False))
        result = subprocess.run([str(OPTIONS.runner.resolve()), 'run', str(artifact / 'package.pt2'),
                                 str(artifact / 'manifest.json'), str(source), str(output), '--repeat', str(repeat)],
                                capture_output=True, text=True, timeout=120)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.last_metrics = next((json.loads(line) for line in reversed(result.stderr.splitlines())
                                      if line.startswith('{') and 'load_seconds' in line), {})
            return json.loads(output.read_text())
        self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(result.stdout.strip() or result.stderr.strip(), 'failure must report a diagnostic')
        return None

    def test_four_goldens(self):
        self.assertEqual(set(EXPECTED), {'motion-blur', 'cnn-classifier', 'ai-image-filter', 'color-grading'})
        for name, case in EXPECTED.items():
            graph = document(name)
            module, _, signatures = translate_graph(graph)
            inputs = tensor_inputs(signatures['inputs'], case['inputs'])
            with torch.inference_mode():
                eager = module(*inputs)
            for entry, actual in zip(signatures['outputs'], eager):
                self.assert_values(actual.flatten().tolist(), case['outputs'][entry['name']])
            if OPTIONS.eager_only:
                continue
            for target in OPTIONS.targets:
                with self.subTest(golden=name, target=target):
                    artifact = self.directory / (name + '-' + target)
                    compile_graph(graph, target, artifact)
                    manifest = json.loads((artifact / 'manifest.json').read_text())
                    self.assertEqual(manifest['target'], target)
                    result = self.invoke(artifact, manifest, case['inputs'], repeat=3)
                    self.assertTrue({'load_seconds', 'first_execution_seconds', 'execution_seconds',
                                     'upload_seconds', 'download_seconds', 'peak_host_rss_bytes'} <= set(self.last_metrics))
                    baseline_module = copy.deepcopy(module).to(target)
                    baseline_inputs = tuple(value.to(target) for value in inputs)
                    with torch.inference_mode():
                        baseline_module(*baseline_inputs)
                        if target == 'cuda':
                            torch.cuda.synchronize()
                        started = time.perf_counter()
                        for _ in range(10):
                            baseline_module(*baseline_inputs)
                        if target == 'cuda':
                            torch.cuda.synchronize()
                    self.measurements[name + '-' + target] = {
                        'compile_seconds': manifest['compile_seconds'],
                        'eager_execution_seconds': (time.perf_counter() - started) / 10,
                        **self.last_metrics}
                    self.assertEqual(set(result), set(case['outputs']))
                    for entry in manifest['outputs']:
                        actual = result[entry['name']]
                        self.assertEqual(actual['shape'], entry['shape'])
                        self.assert_values(actual['values'], case['outputs'][entry['name']])
                    print(f'golden passed: {name} {target} C++ AOT', file=sys.stderr)
                    package = artifact / 'package.pt2'
                    before = package.stat().st_mtime_ns
                    edited = copy.deepcopy(graph)
                    edited['nodes'][0]['position'] = {'x': 17, 'y': 44}
                    compile_graph(edited, target, artifact)
                    self.assertEqual(before, package.stat().st_mtime_ns)
                    edited['nodes'][0]['properties']['shape'][-1] += 1
                    with self.assertRaises((ValueError, GraphError)):
                        compile_graph(edited, target, artifact)
                    invalid = copy.deepcopy(graph)
                    invalid['nodes'].append({'id': 'invalid', 'type': 'nodetool.torch.Python', 'properties': {}})
                    with self.assertRaises(GraphError):
                        compile_graph(invalid, target, artifact)

    @unittest.skipIf(OPTIONS.eager_only, 'requires packaged C++ execution')
    def test_zero_inputs_and_noncontiguous_output(self):
        constant = simple_graph()
        constant['nodes'] = [constant['nodes'][1], constant['nodes'][-1]]
        constant['edges'] = [{'source': 'two', 'sourceHandle': 'output', 'target': 'out', 'targetHandle': 'value'}]
        permute = simple_graph()
        permute['nodes'] = [permute['nodes'][0], {'id': 'transpose', 'type': 'nodetool.torch.Permute',
                            'properties': {'dims': [1, 0]}}, permute['nodes'][-1]]
        permute['nodes'][0]['properties']['shape'] = [2, 3]
        permute['edges'] = [{'source': source, 'sourceHandle': 'output', 'target': target, 'targetHandle': port}
                            for source, target, port in [('x', 'transpose', 'input'), ('transpose', 'out', 'value')]]
        for target in OPTIONS.targets:
            for name, graph, values, expected in [('zero-input', constant, {}, [2]),
                                                  ('noncontiguous', permute, {'x': [1, 2, 3, 4, 5, 6]}, [1, 4, 2, 5, 3, 6])]:
                with self.subTest(case=name, target=target):
                    artifact = self.directory / (name + '-' + target)
                    compile_graph(graph, target, artifact)
                    manifest = json.loads((artifact / 'manifest.json').read_text())
                    self.assert_values(self.invoke(artifact, manifest, values)['y']['values'], expected)

    @unittest.skipIf(OPTIONS.eager_only, 'requires packaged C++ execution')
    def test_runtime_contracts_and_exceptional_values(self):
        graph = simple_graph()
        values = {'x': [float('nan'), float('inf'), -float('inf'), -0., 0., 1.25, -2.5]}
        for target in OPTIONS.targets:
            with self.subTest(target=target):
                artifact = self.directory / ('exceptional-' + target)
                compile_graph(graph, target, artifact)
                path = artifact / 'manifest.json'
                manifest = json.loads(path.read_text())
                result = self.invoke(artifact, manifest, values)['y']['values']
                self.assert_values(result, [float('nan'), float('inf'), -float('inf'), -0., 0., 2.5, -5.])
                self.assertEqual(math.copysign(1, decoded(result[3])), -1)
                wrong = copy.deepcopy(manifest)
                wrong['inputs'][0]['shape'] = [1, 7]
                self.invoke(artifact, wrong, values, success=False)
                saved = path.read_text()
                try:
                    for key, value in [('torch_version', '0.0.0-incompatible'), ('graph_version', 99),
                                       ('target_requirements', {'architecture': 'incompatible'})]:
                        wrong = copy.deepcopy(manifest)
                        wrong[key] = value
                        path.write_text(json.dumps(wrong))
                        self.invoke(artifact, manifest, values, success=False)
                finally:
                    path.write_text(saved)
                changed = copy.deepcopy(graph)
                changed['nodes'][1]['properties']['values'] = [3]
                with self.assertRaises(ValueError):
                    compile_graph(changed, target, artifact)
                original = (artifact / 'package.pt2').read_bytes()
                try:
                    with (artifact / 'package.pt2').open('ab') as package:
                        package.write(b'corruption')
                    with self.assertRaises(ValueError):
                        compile_graph(graph, target, artifact)
                finally:
                    (artifact / 'package.pt2').write_bytes(original)


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *UNITTEST_ARGS], verbosity=2)
