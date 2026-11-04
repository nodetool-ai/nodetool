"""Validated Torch workflow documents and their trusted FX operation registry."""
from collections import deque
import math

import torch
from torch import fx
from torch.nn import functional as F


REGISTRY = {
    'Input': {'inputs': (), 'properties': ('name', 'dtype', 'shape')},
    'Constant': {'inputs': (), 'properties': ('dtype', 'shape', 'values')},
    'Output': {'inputs': ('value',), 'properties': ('name',)},
    'Add': {'inputs': ('a', 'b'), 'properties': ()},
    'Subtract': {'inputs': ('a', 'b'), 'properties': ()},
    'Multiply': {'inputs': ('a', 'b'), 'properties': ()},
    'Clamp': {'inputs': ('input',), 'properties': ('min', 'max')},
    'Reshape': {'inputs': ('input',), 'properties': ('shape',)},
    'Permute': {'inputs': ('input',), 'properties': ('dims',)},
    'MatMul': {'inputs': ('a', 'b'), 'properties': ()},
    'Conv2D': {'inputs': ('input', 'weight'), 'properties': ('stride', 'padding', 'dilation', 'groups', 'weight_layout')},
    'ReLU': {'inputs': ('input',), 'properties': ()},
    'MaxPool2D': {'inputs': ('input',), 'properties': ('kernel_size', 'stride', 'padding', 'dilation')},
    'Pad': {'inputs': ('input',), 'properties': ('pad', 'mode', 'value')},
}

_PROPERTY_TYPES = {
    'name': 'string', 'dtype': 'float32', 'shape': 'positive_integer_array',
    'values': 'finite_float32_array', 'min': 'finite_number', 'max': 'finite_number',
    'dims': 'permutation', 'stride': 'positive_integer_pair',
    'padding': 'nonnegative_integer_pair', 'dilation': 'positive_integer_pair',
    'groups': 'positive_integer', 'weight_layout': 'OIHW',
    'kernel_size': 'positive_integer_pair', 'pad': 'nonnegative_integer_array',
    'mode': 'constant_or_replicate', 'value': 'finite_number',
}
_EDITOR_DEFAULTS = {'string': 'tensor', 'float32': 'float32', 'positive_integer_array': [1],
                    'finite_float32_array': [0.0], 'finite_number': 0.0, 'permutation': [0],
                    'positive_integer_pair': [1, 1], 'nonnegative_integer_pair': [0, 0],
                    'positive_integer': 1, 'OIHW': 'OIHW', 'nonnegative_integer_array': [0, 0, 0, 0],
                    'constant_or_replicate': 'constant'}
for _operation, _definition in REGISTRY.items():
    _definition['property_definitions'] = {
        name: {'type': _PROPERTY_TYPES[name], 'default': 1.0 if name == 'max' else _EDITOR_DEFAULTS[_PROPERTY_TYPES[name]], 'required': not (_operation == 'Pad' and name == 'value')}
        for name in _definition['properties']
    }


def editor_metadata():
    """Return JSON-compatible editor definitions from the compiler registry."""
    return [
        {'type': f'nodetool.torch.{name}',
         'inputs': [{'name': port, 'type': 'tensor'} for port in definition['inputs']],
         'outputs': [] if name == 'Output' else [{'name': 'output', 'type': 'tensor'}],
         'properties': {key: dict(value) for key, value in definition['property_definitions'].items()}}
        for name, definition in REGISTRY.items()
    ]


class GraphError(ValueError):
    """A source workflow node or port violates the Torch contract."""


def _require(condition, message):
    if not condition:
        raise GraphError(message)


def _integers(value, location, minimum=0, length=None):
    _require(isinstance(value, list), f'{location}: expected an integer list')
    _require(length is None or len(value) == length, f'{location}: expected {length} integers')
    _require(all(type(x) is int and x >= minimum for x in value), f'{location}: invalid dimensions')


def _number(value):
    return type(value) in (int, float) and math.isfinite(value)


def _properties(node, operation):
    location = f"node {node['id']}"
    props = node.get('properties', {})
    _require(isinstance(props, dict), f'{location}: properties must be an object')
    spec = REGISTRY[operation]
    _require(set(props) <= set(spec['properties']), f'{location}: unsupported properties {set(props) - set(spec["properties"])}')
    required = set(spec['properties']) - ({'value'} if operation == 'Pad' else set())
    _require(required <= set(props), f'{location}: missing properties {required - set(props)}')
    if operation in ('Input', 'Constant'):
        _require(props['dtype'] == 'float32', f'{location}.dtype: expected float32')
        _integers(props['shape'], f'{location}.shape', 1)
    if operation in ('Input', 'Output'):
        _require(isinstance(props['name'], str) and bool(props['name']), f'{location}.name: expected a nonempty string')
    if operation == 'Constant':
        values = props['values']
        _require(isinstance(values, list) and len(values) == math.prod(props['shape']) and all(_number(x) and abs(x) <= torch.finfo(torch.float32).max for x in values), f'{location}.values: expected finite flat values matching shape')
    if operation == 'Reshape':
        _integers(props['shape'], f'{location}.shape', 1)
    if operation == 'Permute':
        _integers(props['dims'], f'{location}.dims')
        _require(sorted(props['dims']) == list(range(len(props['dims']))), f'{location}.dims: expected a permutation')
    if operation == 'Clamp':
        _require(_number(props['min']) and _number(props['max']) and props['min'] <= props['max'], f'{location}: invalid clamp bounds')
    if operation in ('Conv2D', 'MaxPool2D'):
        for name in ('stride', 'padding', 'dilation'):
            _integers(props[name], f'{location}.{name}', 0 if name == 'padding' else 1, 2)
        if operation == 'Conv2D':
            _require(type(props['groups']) is int and props['groups'] > 0, f'{location}.groups: expected positive integer')
            _require(props['weight_layout'] == 'OIHW', f'{location}.weight_layout: expected OIHW')
        else:
            _integers(props['kernel_size'], f'{location}.kernel_size', 1, 2)
    if operation == 'Pad':
        _integers(props['pad'], f'{location}.pad')
        _require(len(props['pad']) in (2, 4, 6), f'{location}.pad: expected 2, 4, or 6 integers')
        _require(isinstance(props['mode'], str) and props['mode'] in ('constant', 'replicate'), f'{location}.mode: unsupported padding')
        _require(_number(props.get('value', 0)), f'{location}.value: expected finite number')
        _require(props['mode'] == 'constant' or props.get('value', 0) == 0, f'{location}.value: replicate padding cannot have a value')
    return props


def validate_graph(document):
    """Validate every node and edge, returning a deterministic topological graph."""
    _require(isinstance(document, dict), 'graph: expected an object')
    settings = document.get('settings')
    execution = settings.get('execution') if isinstance(settings, dict) else None
    _require(isinstance(execution, dict) and execution == {'kind': 'torch', 'version': 1} and type(execution.get('version')) is int, 'settings.execution: expected Torch version 1')
    nodes, edges = document.get('nodes'), document.get('edges')
    _require(isinstance(nodes, list) and isinstance(edges, list), 'graph: nodes and edges must be lists')
    by_id, operations, properties = {}, {}, {}
    names = {'Input': set(), 'Output': set()}
    for node in nodes:
        _require(isinstance(node, dict), 'node: expected an object')
        node_id = node.get('id')
        _require(isinstance(node_id, str) and bool(node_id) and node_id not in by_id, f'node {node_id}: invalid or duplicate ID')
        node_type = node.get('type', '')
        _require(isinstance(node_type, str) and node_type.startswith('nodetool.torch.') and node_type[15:] in REGISTRY, f'node {node_id}: unsupported operation {node_type}')
        operation = node_type[15:]
        _require(not any(key in node for key in ('dynamic_properties', 'dynamic_inputs', 'dynamic_outputs', 'workflow', 'workflow_id', 'streaming', 'is_streaming', 'is_streaming_output', 'slots')), f'node {node_id}: dynamic or nested nodes are unsupported')
        props = _properties(node, operation)
        if operation in names:
            _require(props['name'] not in names[operation], f'node {node_id}: duplicate {operation} name')
            names[operation].add(props['name'])
        by_id[node_id], operations[node_id], properties[node_id] = node, operation, props
    _require(bool(names['Output']), 'graph: at least one Output is required')
    incoming, children, indegree = {}, {key: [] for key in by_id}, {key: 0 for key in by_id}
    for edge in edges:
        _require(isinstance(edge, dict), 'edge: expected an object')
        source, target = edge.get('source'), edge.get('target')
        _require(isinstance(source, str) and isinstance(target, str) and source in by_id and target in by_id, f'edge {source} -> {target}: unknown node')
        port = edge.get('targetHandle')
        _require(edge.get('sourceHandle') == 'output' and operations[source] != 'Output', f'node {source}: invalid source port')
        _require(isinstance(port, str) and port in REGISTRY[operations[target]]['inputs'], f'node {target}.{port}: invalid target port')
        _require(edge.get('edge_type', 'data') == 'data' and edge.get('type', 'data') in ('data', 'default'), f'node {target}.{port}: control or streaming edges unsupported')
        _require((target, port) not in incoming, f'node {target}.{port}: multiple producers')
        incoming[target, port] = source
        children[source].append(target)
        indegree[target] += 1
    for node_id, operation in operations.items():
        for port in REGISTRY[operation]['inputs']:
            _require((node_id, port) in incoming, f'node {node_id}.{port}: missing producer')
    pending = deque(key for key in by_id if indegree[key] == 0)
    order = []
    while pending:
        current = pending.popleft()
        order.append(current)
        for child in children[current]:
            indegree[child] -= 1
            if indegree[child] == 0:
                pending.append(child)
    _require(len(order) == len(nodes), 'graph: cycle detected')
    return {'nodes': by_id, 'operations': operations, 'properties': properties, 'incoming': incoming, 'order': order}


def translate_graph(document, device='cpu'):
    """Build a trusted FX module and ordered example/signature contracts."""
    validated = validate_graph(document)
    graph, root, values = fx.Graph(), torch.nn.Module(), {}
    examples, input_signatures, outputs, output_names = [], [], [], []
    has_inputs = 'Input' in validated['operations'].values()
    for index, node_id in enumerate(validated['order']):
        op, props = validated['operations'][node_id], validated['properties'][node_id]
        args = [values[validated['incoming'][node_id, port]] for port in REGISTRY[op]['inputs']]
        if op == 'Input':
            value = graph.placeholder(f'input_{len(examples)}')
            examples.append(torch.zeros(props['shape'], dtype=torch.float32, device=device))
            input_signatures.append({'name': props['name'], 'shape': props['shape'], 'dtype': 'float32'})
        elif op == 'Constant':
            name = f'constant_{index}'
            buffer_shape = props['shape']
            scalar_cuda_constant = device == 'cuda' and not buffer_shape and not has_inputs
            if scalar_cuda_constant:
                buffer_shape = [1]
            root.register_buffer(name, torch.tensor(props['values'], dtype=torch.float32, device=device).reshape(buffer_shape))
            value = graph.get_attr(name)
            if scalar_cuda_constant:
                # Keep scalar-only packages on CUDA instead of CPU scalar folding.
                value = graph.call_function(torch.clone, (value,))
                value = graph.call_function(torch.reshape, (value, ()))
        elif op == 'Output':
            outputs.append(args[0])
            output_names.append(props['name'])
            continue
        elif op in ('Add', 'Subtract', 'Multiply', 'MatMul'):
            target = {'Add': torch.add, 'Subtract': torch.sub, 'Multiply': torch.mul, 'MatMul': torch.matmul}[op]
            value = graph.call_function(target, tuple(args))
        elif op == 'ReLU':
            value = graph.call_function(torch.relu, tuple(args))
        elif op == 'Clamp':
            value = graph.call_function(torch.clamp, tuple(args), {'min': props['min'], 'max': props['max']})
        elif op == 'Reshape':
            value = graph.call_function(torch.reshape, (args[0], tuple(props['shape'])))
        elif op == 'Permute':
            value = graph.call_function(torch.permute, (args[0], tuple(props['dims'])))
        elif op == 'Conv2D':
            value = graph.call_function(F.conv2d, tuple(args), {name: props[name] for name in ('stride', 'padding', 'dilation', 'groups')})
        elif op == 'MaxPool2D':
            value = graph.call_function(F.max_pool2d, tuple(args), {name: props[name] for name in ('kernel_size', 'stride', 'padding', 'dilation')})
        elif op == 'Pad':
            kwargs = {'mode': props['mode']}
            if props['mode'] == 'constant':
                kwargs['value'] = props.get('value', 0)
            value = graph.call_function(F.pad, (args[0], tuple(props['pad'])), kwargs)
        value.meta['nodetool_node_id'] = node_id
        value.meta['nodetool_port'] = 'output'
        values[node_id] = value
    if device == 'cuda' and not examples:
        # AOTInductor otherwise labels a buffer-only program as a CPU package.
        outputs = [graph.call_function(torch.clone, (value,)) for value in outputs]
    graph.output(tuple(outputs))
    module = fx.GraphModule(root, graph)
    try:
        with torch.inference_mode():
            result = _SourceInterpreter(module).run(*examples)
    except Exception as error:
        raise GraphError(f'Torch shape validation failed: {error}') from error
    signatures = []
    for name, tensor in zip(output_names, result):
        _require(tensor.dtype == torch.float32, f'output {name}: expected float32')
        signatures.append({'name': name, 'shape': list(tensor.shape), 'dtype': 'float32'})
    return module, tuple(examples), {'inputs': input_signatures, 'outputs': signatures}


class _SourceInterpreter(fx.Interpreter):
    def run_node(self, node):
        try:
            return super().run_node(node)
        except Exception as error:
            source = node.meta.get('nodetool_node_id', node.name)
            port = node.meta.get('nodetool_port', 'output')
            raise GraphError(f'node {source}.{port}: {error}') from error
