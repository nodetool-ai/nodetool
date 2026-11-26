#!/usr/bin/env python3
"""Ratchet native Qt Quick performance debt against per-file counts.

R2 counts scans across each QML file, not just delegates. R3 includes one-shot
APIs and R5 includes static drawing. K11 only checks explicit inline delegate
roots with required properties before any nested object. Existing cases are
grandfathered by counts. Test directories and test_/tst_ files are excluded.
--update only lowers allowances. Increases always fail, including in new files.
"""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[3]
BASELINE = Path(__file__).with_name('performance_baseline.json')
RULES = {
    'R1': (16, 'untyped QML properties'),
    'R2': (35, 'QML indexOf/filter/find calls (whole file)'),
    'R3': (30, 'JSON/QVariant properties and invokable returns'),
    'R4': (34, 'context property calls'),
    'R5-canvas': (38, 'Canvas items'),
    'R5-painted': (38, 'QQuickPaintedItem subclasses'),
    'K11': (16, 'inline required-property delegate without ComponentBehavior: Bound'),
}
# Mask comments and literals before matching, preserving whitespace boundaries.
OPAQUE = re.compile(r'R"(?P<delimiter>[^ ()\\\t\r\n]{0,16})\([\s\S]*?\)(?P=delimiter)"|//[^\n]*|/\*[\s\S]*?\*/|"(?:\\[\s\S]|[^"\\])*"|\'(?:\\[\s\S]|[^\'\\])*\'|`(?:\\[\s\S]|[^`\\])*`')
DOCUMENT = r'(?:QVariantList|QVariantMap|QJsonArray|QJsonObject)\b'


def counts(text, suffix):
    text = OPAQUE.sub(' ', text)
    result = dict.fromkeys(RULES, 0)
    if suffix == '.qml':
        result['R1'] = len(re.findall(r'\bproperty\s+var\b', text))
        result['R2'] = len(re.findall(r'\.\s*(?:indexOf|filter|find)\s*\(', text))
        if not re.search(r'\bpragma\s+ComponentBehavior\s*:\s*Bound\b', text):
            result['K11'] = len(re.findall(
                r'\bdelegate\s*:\s*[\w.]+\s*\{[^{}]*\brequired\s+property\b', text))
        result['R5-canvas'] = len(re.findall(r'\bCanvas\s*\{', text))
    if suffix in {'.h', '.hpp', '.hh', '.hxx'}:
        result['R3'] = len(re.findall(
            r'\bQ_PROPERTY\s*\(\s*(?:const\s+)?' + DOCUMENT +
            r'|\bQ_INVOKABLE\s+(?:(?:virtual|static|const|inline)\s+)*' + DOCUMENT, text))
        result['R5-painted'] = len(re.findall(
            r'\b(?:class|struct)\s+\w+[^;{}]*:\s*[^;{}]*\bQQuickPaintedItem\b', text))
    if suffix in {'.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'}:
        result['R4'] = len(re.findall(r'\bsetContextProperty\s*\(', text))
    return {rule: value for rule, value in result.items() if value}


def inspect(root):
    files = sorted({path for area in (root / 'native').glob('*')
                    for directory in ('qml', 'src')
                    for path in (area / directory).rglob('*')
                    if path.is_file() and not path.name.startswith(('test_', 'tst_'))
                    and path.suffix in
                    {'.qml', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.hh', '.hxx'}
                    and not {'tests', 'test', '__pycache__'}.intersection(path.relative_to(area).parts)})
    return {path.relative_to(root).as_posix(): counts(path.read_text(encoding='utf-8'), path.suffix)
            for path in files}


def read_baseline(path):
    baseline = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(baseline, dict):
        raise ValueError('baseline must contain per-file count objects')
    for filename, rules in baseline.items():
        if not isinstance(rules, dict) or any(
            rule not in RULES or type(value) is not int or value < 0
            for rule, value in rules.items()
        ):
            raise ValueError(f'invalid baseline counts for {filename}')
    return baseline


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT, help='repository root')
    parser.add_argument('--baseline', type=Path, default=BASELINE)
    parser.add_argument('--update', action='store_true', help='write lower counts only')
    args = parser.parse_args(argv)
    try:
        baseline = read_baseline(args.baseline)
        current = inspect(args.root)
    except (OSError, ValueError) as error:
        print(f'Performance audit: {error}', file=sys.stderr)
        return 1
    print(f'Inspected {len(current)} native source files')
    if not current:
        print('No native source files inspected', file=sys.stderr)
        return 1
    failed = False
    for filename in sorted(baseline.keys() | current.keys()):
        for rule, (number, description) in RULES.items():
            old = baseline.get(filename, {}).get(rule, 0)
            new = current.get(filename, {}).get(rule, 0)
            if new != old:
                increased = new > old
                failed |= increased
                print(f'{"FAIL" if increased else "NOTE"} {filename}: {rule} '
                      f'old={old} new={new} PERFORMANCE.md rule {number}: {description}',
                      file=sys.stderr if increased else sys.stdout)
    if args.update and not failed:
        args.baseline.write_text(json.dumps(
            {name: rules for name, rules in current.items() if rules}, indent=2, sort_keys=True) + '\n',
            encoding='utf-8')
        print('Updated lower performance baseline counts')
    for rule in RULES:
        print(f'{rule}: {sum(rules.get(rule, 0) for rules in current.values())}')
    return int(failed)


if __name__ == '__main__':
    sys.exit(main())
