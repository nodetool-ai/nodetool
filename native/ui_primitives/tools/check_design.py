#!/usr/bin/env python3
"""Audit native QML object types and presentation bindings against its inventory."""
import argparse
import json
from dataclasses import dataclass, field
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
MODULE = Path(__file__).resolve().parents[1]
ROOTS = ('native/timeline/qml', 'native/timeline/src', 'native/chat/qml', 'native/model-picker/qml')
TOKEN = re.compile(r'''(?P<space>\s+)|(?P<comment>//[^\n]*|/\*[\s\S]*?\*/)|(?P<string>"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|(?P<ident>[A-Za-z_$][\w$]*)|(?P<number>0[xX][\da-fA-F]+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)|(?P<punct>.)''')
RAW_CONTROLS = {
    'Button', 'ToolButton', 'RoundButton', 'TextField', 'TextArea', 'ComboBox',
    'Slider', 'RangeSlider', 'Switch', 'CheckBox', 'RadioButton', 'SpinBox',
    'ItemDelegate', 'CheckDelegate', 'RadioDelegate', 'SwitchDelegate',
    'Dialog', 'Popup', 'Menu', 'MenuItem', 'ToolTip', 'ScrollBar',
    'ProgressBar', 'BusyIndicator', 'TabButton', 'TabBar', 'Frame', 'Pane'}
RAW_TEXT = {'Text', 'Label'}
METRICS = {'spacing', 'padding', 'leftPadding', 'rightPadding', 'topPadding',
           'bottomPadding', 'margins', 'leftMargin', 'rightMargin', 'topMargin',
           'bottomMargin', 'radius', 'border.width'}
METRIC_TYPES = {'Metrics', 'TimelineMetrics', 'ChatMetrics', 'ModelPickerMetrics'}
SCRIPT_WORDS = {'else', 'try', 'finally', 'do', 'return', 'function', 'switch', 'if', 'for', 'while', 'catch'}
GROUPS = {'font', 'border', 'anchors', 'Layout', 'Accessible', 'Drag', 'LayoutMirroring'}
ICON_GLYPHS = {'×', '✕', '⚙', '⋮', '⋯', '▾', '⌄', '▶', '⏸', '↻', '⌕', '★', '☆', '⚠', '✓'}


@dataclass
class Token:
    kind: str
    value: str
    line: int
    owner: int = -1


@dataclass
class Binding:
    name: str
    tokens: list
    line: int
    value_type: str = ''


@dataclass
class Object:
    name: str
    start: int
    end: int
    parent: object = None
    identifier: str = ''
    key: str = ''
    bindings: list = field(default_factory=list)
    line: int = 1


@dataclass
class Issue:
    filename: str
    line: int
    object: str
    binding: str
    rule: str
    message: str

    def __str__(self):
        return '{}:{}: {} [{}:{}] {}'.format(self.filename, self.line, self.rule, self.object, self.binding, self.message)


def tokenize(text):
    tokens = []
    errors = []
    line = 1
    position = 0
    while position < len(text):
        # A JavaScript regular expression is opaque, including character
        # classes and brace quantifiers. Division remains punctuation.
        if text[position] == '/' and not text.startswith(('//', '/*'), position) and tokens and tokens[-1].value in {'(', '=', ',', ':', 'return', '!', '?', ';'}:
            end = position + 1
            in_class = False
            while end < len(text) and text[end] not in '\r\n':
                char = text[end]
                if char == '\\':
                    if end + 1 >= len(text) or text[end + 1] in '\r\n':
                        break
                    end += 2
                    continue
                if char == '/' and not in_class:
                    end += 1
                    while end < len(text) and 'a' <= text[end] <= 'z':
                        end += 1
                    tokens.append(Token('regex', text[position:end], line))
                    position = end
                    break
                if char == '[':
                    in_class = True
                elif char == ']':
                    in_class = False
                end += 1
            else:
                end = len(text)
            if position != end:
                errors.append((line, 'Unterminated regular expression'))
                break
            continue
        match = TOKEN.match(text, position)
        if match is None:
            errors.append((line, 'Unsupported token'))
            break
        value = match.group()
        kind = match.lastgroup
        if kind not in {'space', 'comment'}:
            if kind == 'punct' and value in {'"', "'", '`'}:
                errors.append((line, 'Unterminated string'))
            if kind == 'string' and value.startswith('`'):
                errors.append((line, 'Unsupported template string'))
            tokens.append(Token(kind, value, line))
        if value == '/' and text.startswith('/*', position):
            errors.append((line, 'Unterminated comment'))
        line += value.count('\n')
        position = match.end()
    return tokens, errors


def qualified_before(tokens, index):
    if index < 0 or tokens[index].kind != 'ident':
        return '', index
    parts = [tokens[index].value]
    start = index
    while start >= 2 and tokens[start - 1].value == '.' and tokens[start - 2].kind == 'ident':
        start -= 2
        parts.insert(0, tokens[start].value)
    return '.'.join(parts), start


def member_at(tokens, index):
    if index >= len(tokens):
        return False
    token = tokens[index]
    if token.value in {'property', 'readonly', 'required', 'signal', 'function', 'component'}:
        return True
    if token.kind != 'ident':
        return False
    end = index + 1
    while end + 1 < len(tokens) and tokens[end].value == '.' and tokens[end + 1].kind == 'ident':
        end += 2
    return end < len(tokens) and tokens[end].value in {':', '{', 'on'}


def approved_role_font(values, aliases, method='font'):
    if len(values) < 8 or values[0].value not in aliases:
        return False
    if [token.value for token in values[1:6]] != ['.', 'Typography', '.', method, '(']:
        return False
    depth = 0
    for index in range(5, len(values)):
        if values[index].value == '(':
            depth += 1
        elif values[index].value == ')':
            depth -= 1
            if depth == 0:
                return index == len(values) - 1
    return False


def color_result_literals(values):
    """Return literal color results, excluding map keys and comparands."""
    literals = []
    for index, token in enumerate(values):
        if token.kind != 'string':
            continue
        previous = values[index - 1].value if index else ''
        following = values[index + 1].value if index + 1 < len(values) else ''
        if (following == ':' and previous in {'{', ','}) or previous in {'=', '!', '<', '>'} or following in {'=', '!', '<', '>'}:
            continue
        # Strings passed as semantic keys to a function are not colors.
        if previous == '(' and index >= 2 and values[index - 2].kind == 'ident':
            continue
        if index == 0 or previous in {'(', '?', ':', 'return'}:
            literals.append(token.value[1:-1])
    return literals


def numeric_value(token):
    return int(token.value, 16) if token.value.startswith(('0x', '0X')) else float(token.value)


def metric_unit_factor(values, index, ui_aliases):
    """Allow only identity multiplication or division of a named metric."""
    if (index >= 4 and values[index - 1].value in {'*', '/'} and
            values[index - 2].kind == 'ident' and values[index - 3].value == '.' and
            values[index - 4].value in METRIC_TYPES):
        return True
    if index + 4 >= len(values) or values[index + 1].value != '*':
        return False
    start = index + 2
    if values[start].value in ui_aliases and values[start + 1].value == '.':
        start += 2
    return (start + 2 < len(values) and values[start].value in METRIC_TYPES and
            values[start + 1].value == '.' and values[start + 2].kind == 'ident')


def assignment_value(values, start):
    depth = 0
    for index in range(start, len(values)):
        value = values[index].value
        if depth == 0 and value == ';':
            return values[start:index]
        if depth == 0 and index > start and values[index].line > values[index - 1].line and values[index].kind == 'ident':
            previous = values[index - 1].value
            if previous not in {'+', '-', '*', '/', '=', '?', ':', ',', '&', '|', '!'}:
                return values[start:index]
        if value in {'(', '[', '{'}:
            depth += 1
        elif value in {')', ']', '}'}:
            if depth == 0:
                return values[start:index]
            depth -= 1
    return values[start:]


def parse(text):
    tokens, errors = tokenize(text)
    stack = []
    pairs = {}
    enclosing = {}
    for index, token in enumerate(tokens):
        enclosing[index] = stack[-1] if stack else None
        if token.value in {'{', '[', '('}:
            stack.append(index)
        elif token.value in {'}', ']', ')'}:
            expected = {'}': '{', ']': '[', ')': '('}[token.value]
            if not stack or tokens[stack[-1]].value != expected:
                errors.append((token.line, 'Unmatched closing delimiter'))
            else:
                pairs[stack.pop()] = index
    for index in stack:
        errors.append((tokens[index].line, 'Unclosed object or expression'))
    opens = {end: start for start, end in pairs.items()}
    objects = []
    for index, token in enumerate(tokens):
        if token.value != '{' or index not in pairs:
            continue
        name, start = qualified_before(tokens, index - 1)
        if not name or name in SCRIPT_WORDS:
            continue
        # Only QML type declarations and grouped property declarations create
        # objects. JavaScript object literals and statement blocks do not.
        if not (name.rsplit('.', 1)[-1][:1].isupper() or name in GROUPS):
            continue
        if start >= 2 and tokens[start - 1].value == ':' and tokens[start - 2].value == ')':
            parameters = opens.get(start - 2)
            if parameters is not None and parameters >= 2 and tokens[parameters - 2].value == 'function':
                continue
        objects.append(Object(name, index, pairs[index], line=token.line))
    by_start = {obj.start: obj for obj in objects}
    owners = []
    for index, token in enumerate(tokens):
        while owners and index > owners[-1].end:
            owners.pop()
        if index in by_start:
            owners.append(by_start[index])
        token.owner = owners[-1].start if owners else -1
    active = []
    for obj in objects:
        while active and obj.start > active[-1].end:
            active.pop()
        obj.parent = active[-1] if active else None
        active.append(obj)
        index = obj.start + 1
        while index < obj.end:
            if index in pairs:
                index = pairs[index] + 1
                continue
            if enclosing.get(index) != obj.start or tokens[index].kind != 'ident':
                index += 1
                continue
            if tokens[index].value == 'function' and index + 2 < obj.end:
                parameter_start = index + 2
                if parameter_start in pairs:
                    body_start = pairs[parameter_start] + 1
                    return_type = ''
                    if body_start < obj.end and tokens[body_start].value == ':':
                        body_start += 1
                        type_start = body_start
                        while body_start < obj.end and (tokens[body_start].kind == 'ident' or tokens[body_start].value in {'.', '<', '>', ',', '[', ']'}):
                            body_start += 1
                        return_type = ''.join(t.value for t in tokens[type_start:body_start])
                    if body_start in pairs and tokens[body_start].value == '{':
                        body_end = pairs[body_start]
                        obj.bindings.append(Binding('@function:' + tokens[index + 1].value,
                                                    tokens[body_start + 1:body_end], tokens[index].line, return_type))
                        index = body_end + 1
                        continue
                    errors.append((tokens[index].line, 'Unsupported function declaration'))
            end_name = index
            while end_name + 2 < obj.end and tokens[end_name + 1].value == '.' and tokens[end_name + 2].kind == 'ident':
                end_name += 2
            if end_name + 1 >= obj.end or tokens[end_name + 1].value != ':':
                index += 1
                continue
            name = ''.join(t.value for t in tokens[index:end_name + 1])
            start_value = end_name + 2
            end_value = start_value
            while end_value < obj.end:
                if tokens[end_value].value == ';':
                    break
                if end_value > start_value and tokens[end_value].line > tokens[end_value - 1].line and member_at(tokens, end_value):
                    break
                if end_value in pairs:
                    end_value = pairs[end_value] + 1
                else:
                    end_value += 1
            value_type = tokens[index - 1].value if index >= 2 and tokens[index - 2].value == 'property' else ''
            binding = Binding(name, tokens[start_value:end_value], tokens[index].line, value_type)
            obj.bindings.append(binding)
            if name == 'id' and binding.tokens and binding.tokens[0].kind == 'ident':
                obj.identifier = binding.tokens[0].value
            index = max(end_value, end_name + 2)
    siblings = {}
    for obj in objects:
        parent_key = obj.parent.key if obj.parent else ''
        sibling_key = (parent_key, obj.name)
        ordinal = siblings.get(sibling_key, 0)
        siblings[sibling_key] = ordinal + 1
        obj.key = '/'.join(filter(None, (parent_key, obj.identifier or '{}[{}]'.format(obj.name, ordinal))))
    aliases = []
    for index, token in enumerate(tokens):
        if token.value != 'import' or token.owner != -1 or index + 1 >= len(tokens):
            continue
        end = index + 1
        if tokens[end].kind != 'ident':
            continue
        parts = [tokens[end].value]
        while end + 2 < len(tokens) and tokens[end + 1].value == '.' and tokens[end + 2].kind == 'ident':
            end += 2
            parts.append(tokens[end].value)
        end += 1
        if end < len(tokens) and tokens[end].kind == 'number':
            end += 1
        if end + 1 < len(tokens) and tokens[end].value == 'as':
            aliases.append(('.'.join(parts), tokens[end + 1].value))
    ui_aliases = {alias for module, alias in aliases if module == 'NodeTool.UiPrimitives'
                  and all(other_module == module for other_module, other_alias in aliases if other_alias == alias)}
    return objects, errors, ui_aliases


def inspect(text, filename, semantic_types=None, strict=False):
    objects, errors, ui_aliases = parse(text)
    issues = [Issue(filename, line, '<syntax>', '*', 'syntax', message) for line, message in errors]
    if strict and Path(filename).name in {'Theme.qml', 'ChatTheme.qml', 'ModelPickerTheme.qml', 'Icon.qml', 'Icons.qml'}:
        issues.append(Issue(filename, 1, '<module>', '@type', 'legacy', 'obsolete feature presentation facade'))
    for obj in objects:
        short = obj.name.rsplit('.', 1)[-1]
        is_ui = '.' in obj.name and obj.name.split('.')[0] in ui_aliases
        semantic = '.' not in obj.name and short in (semantic_types or set())
        if short in RAW_CONTROLS and not is_ui and not semantic:
            issues.append(Issue(filename, obj.line, obj.key, '@type', 'control', 'direct interactive control ' + obj.name))
        if short in RAW_TEXT and not is_ui:
            issues.append(Issue(filename, obj.line, obj.key, '@type', 'typography', 'raw text type ' + obj.name))
        if short == 'FontLoader':
            issues.append(Issue(filename, obj.line, obj.key, '@type', 'font-resource', 'feature font loader'))
        if short in {'Gradient', 'GradientStop', 'ConicalGradient', 'LinearGradient', 'RadialGradient'} and not is_ui:
            issues.append(Issue(filename, obj.line, obj.key, '@type', 'gradient', 'feature gradient recipe'))
        for binding in obj.bindings:
            name = binding.name
            if obj.name in GROUPS:
                name = obj.name + '.' + name
            values = [token for token in binding.tokens if token.owner == obj.start]
            strings = [token.value[1:-1] for token in values if token.kind == 'string']
            def add(rule, message):
                issues.append(Issue(filename, binding.line, obj.key, binding.name, rule, message))
            if strict and any(token.value in {'Theme', 'ChatTheme', 'ModelPickerTheme', 'Icons'} and
                              not (index >= 2 and values[index - 1].value == '.' and values[index - 2].value in ui_aliases)
                              for index, token in enumerate(values) if token.kind == 'ident'):
                add('legacy', 'legacy feature presentation reference')
            measured_font = short in {'TextMetrics', 'FontMetrics'} and name == 'font' and len(values) >= 3 and values[-2].value == '.' and values[-1].value == 'font'
            role_font = name == 'font' and approved_role_font(values, ui_aliases)
            if name in {'font', 'font.family', 'font.pixelSize', 'font.pointSize', 'font.weight', 'font.bold', 'lineHeight', 'lineHeightMode'} and not measured_font and not role_font:
                add('typography', 'independent font attribute ' + name)
            if any(re.fullmatch(r'#[\da-fA-F]{3,8}', value) for value in strings) or any(
                    values[i].value == 'Qt' and values[i + 1].value == '.' and values[i + 2].value in {'rgba', 'hsla', 'hsva', 'color'}
                    for i in range(max(0, len(values) - 2))):
                add('color', 'literal color recipe')
            color_binding = not name.startswith('@function:') and (name == 'color' or name.endswith('.color') or name.endswith('Color'))
            if (color_binding or binding.value_type == 'color') and any(value != 'transparent' for value in color_result_literals(values)):
                add('color', 'named color literal')
            metric_name = name.removeprefix('anchors.')
            if metric_name in METRICS and any(
                    token.kind == 'number' and numeric_value(token) != 0 and
                    not (numeric_value(token) == 1 and metric_unit_factor(values, index, ui_aliases))
                    for index, token in enumerate(values)):
                add('metric', 'literal chrome metric ' + name)
            for index, token in enumerate(values):
                if token.kind != 'ident':
                    continue
                chain = [token.value]
                cursor = index + 1
                while cursor + 1 < len(values) and values[cursor].value == '.' and values[cursor + 1].kind == 'ident':
                    chain.append(values[cursor + 1].value)
                    cursor += 2
                if len(chain) < 2 or cursor >= len(values) or values[cursor].value != '=':
                    continue
                if 'font' in chain and not approved_role_font(assignment_value(values, cursor + 1), ui_aliases, 'canvasFont'):
                    add('typography', 'imperative font mutation')
                    break
                if (chain[-1] == 'color' or chain[-1].endswith('Color')) and cursor + 1 < len(values) and values[cursor + 1].kind == 'string' and values[cursor + 1].value[1:-1] != 'transparent':
                    add('color', 'imperative color literal')
                    break
            body_slot = short in {'Dialog', 'Popover'} and name == 'contentItem'
            if is_ui and name in {'background', 'contentItem', 'font', 'color', 'padding', 'leftPadding', 'rightPadding', 'topPadding', 'bottomPadding'} and not body_slot:
                add('internal-style', 'feature overrides primitive internals')
            if name == 'source' and any('fonts/' in value or 'node_modules' in value for value in strings):
                add('font-resource', 'local font resource')
            if name == 'source' and any('data:image/svg' in value for value in strings):
                add('icon', 'feature SVG icon rendering')
            if short in RAW_TEXT and name == 'text' and any(value.strip() in ICON_GLYPHS for value in strings):
                add('icon', 'action glyph must use the native icon catalog')
            if short == 'Canvas' and any(values[i].value == '.' and values[i + 1].value == 'font' and values[i + 2].value == '=' and values[i + 3].kind == 'string' for i in range(max(0, len(values) - 3))):
                add('typography', 'literal canvas font')
            if any(values[i].value == '.' and values[i + 1].value in {'createLinearGradient', 'createRadialGradient', 'createConicalGradient'} for i in range(max(0, len(values) - 1))):
                add('gradient', 'feature canvas gradient recipe')
            if short in {'MouseArea', 'TapHandler'} and name in {'onClicked', 'onTapped', 'onDoubleClicked', 'onDoubleTapped'}:
                add('manual-control', 'feature pointer activation needs a primitive or a domain exception')
            if short.endswith('Animation') and name == 'duration' and any(token.kind == 'number' for token in values) and not any(token.value == 'Metrics' for token in values):
                add('motion', 'literal animation duration')
            if name == 'z' and any(token.kind == 'number' and token.value not in {'0', '0.0'} for token in values) and not any(token.value in {'Metrics', 'TimelineMetrics'} for token in values):
                add('layer', 'literal chrome layer')
            if any(values[i].value == 'Qt' and values[i + 1].value == '.' and values[i + 2].value == 'createQmlObject' for i in range(max(0, len(values) - 2))):
                add('dynamic-qml', 'dynamic QML must use a statically declared component')
    return issues


def audit(text, filename):
    return [str(issue) for issue in inspect(text, filename)]


def semantic_wrappers(paths):
    result = set()
    for path in paths:
        try:
            path.resolve().relative_to((ROOT / 'native').resolve())
        except ValueError:
            continue
        if path.stem not in RAW_CONTROLS:
            continue
        objects, errors, aliases = parse(path.read_text(encoding='utf-8'))
        if not errors and objects and '.' in objects[0].name and objects[0].name.split('.')[0] in aliases:
            result.add(path.stem)
    return result


def read_manifest(path):
    # A deliberately small, strict TOML subset keeps the gate usable with the
    # platform Python 3.9. It accepts only tables, strings and string arrays.
    manifest = {'file': [], 'exception': []}
    current = None
    for line_number, raw in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith('#') or line == 'version = 1':
            continue
        if line in {'[[file]]', '[[exception]]'}:
            kind = line[2:-2]
            current = {}
            manifest[kind].append(current)
            continue
        key, separator, value = line.partition('=')
        key = key.strip()
        if current is None or not separator or re.fullmatch(r'\w+', key) is None:
            raise ValueError('{}:{}: unsupported inventory syntax'.format(path, line_number))
        try:
            value = json.loads(value)
        except ValueError as error:
            raise ValueError('{}:{}: unsupported inventory syntax'.format(path, line_number)) from error
        if not isinstance(value, str) and not (isinstance(value, list) and all(isinstance(item, str) for item in value)):
            raise ValueError('{}:{}: inventory values must be strings or string arrays'.format(path, line_number))
        if key in current:
            raise ValueError('{}:{}: duplicate inventory key'.format(path, line_number))
        current[key] = value
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--strict', action='store_true')
    parser.add_argument('--report', action='store_true', help='Print object/binding diagnostics for every inventoried file')
    args = parser.parse_args(argv)
    manifest = read_manifest(MODULE / 'tools/migration.toml')
    entries = {}
    for entry in manifest['file']:
        path = entry.get('path')
        if not path or path in entries or entry.get('category') not in {'pending', 'chrome', 'domain'}:
            raise ValueError('Invalid or duplicate inventory entry: {}'.format(path))
        entries[path] = entry
    actual = {p.relative_to(ROOT).as_posix() for directory in ROOTS for p in (ROOT / directory).rglob('*.qml')}
    errors = []
    if not actual:
        errors.append('No native QML files inspected')
    errors.extend('{}: unclassified file'.format(path) for path in sorted(actual - entries.keys()))
    errors.extend('{}: stale inventory entry'.format(path) for path in sorted(entries.keys() - actual))
    used = set()
    wrappers = semantic_wrappers([ROOT / path for path in actual])
    for path in sorted(actual & entries.keys()):
        entry = entries[path]
        if args.strict and (entry['category'] == 'pending' or entry.get('test_host') in {None, '', 'unreviewed'} or entry.get('replacement') in {None, '', 'unreviewed'}):
            errors.append('{}: pending inventory review'.format(path))
        enforce = entry['category'] != 'pending' or args.strict or args.report
        feature_wrappers = wrappers if path.startswith('native/timeline/') else set()
        source = ROOT / path
        try:
            source.resolve().relative_to((ROOT / 'native').resolve())
        except ValueError:
            errors.append('{}: source link escapes native tree'.format(path))
            continue
        for issue in inspect(source.read_text(encoding='utf-8'), path, feature_wrappers, strict=args.strict):
            matching = []
            for index, exception in enumerate(manifest['exception']):
                if (exception.get('path'), exception.get('object'), exception.get('binding'), exception.get('rule')) == (path, issue.object, issue.binding, issue.rule):
                    if not exception.get('reason') or exception['reason'] == 'unreviewed' or not exception.get('owner'):
                        errors.append('{}: exception needs a domain reason and owner'.format(path))
                    matching.append(index)
            if len(matching) == 1 and issue.rule != 'syntax':
                used.add(matching[0])
            elif enforce:
                errors.append(str(issue))
    for index, exception in enumerate(manifest['exception']):
        if index not in used:
            errors.append('{}: stale or duplicate exception {}:{}'.format(exception.get('path'), exception.get('object'), exception.get('binding')))
    print('Inspected {} inventoried native QML files'.format(len(actual)))
    for error in errors:
        print(error, file=sys.stderr)
    return int(bool(errors))


if __name__ == '__main__':
    sys.exit(main())
