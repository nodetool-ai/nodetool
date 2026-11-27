#!/usr/bin/env python3
"""Run isolated stress scenarios. Gate work counters, report wall time only."""
import argparse
import re
import tempfile
import json
import os
from pathlib import Path
import subprocess


def coarse_connections(root):
    files = sorted((root / 'src').rglob('*'))
    inspected = [p for p in files if p.suffix in {'.cpp', '.h'} and not p.name.startswith('tst_')]
    if not inspected:
        raise ValueError('Connection audit inspected no sources')
    result = {}
    for path in inspected:
        # Mask literals and comments without treating URL slashes as comments.
        text = re.sub(r""""(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|//[^\n]*|/\*[\s\S]*?\*/""",
                      lambda _: ' ',
                      path.read_text())
        aliases = dict(re.findall(
            r'\b(\w+)\s*=\s*&\s*TimelineModel\s*::\s*(timelineChanged|clipsChanged)\b', text))
        signals = []
        for argument in re.findall(r'\bconnect\s*\(\s*[^,;]*,\s*([^,;]+)', text):
            direct = re.search(r'&\s*TimelineModel\s*::\s*(timelineChanged|clipsChanged)\b', argument)
            legacy = re.search(r'\bSIGNAL\s*\(\s*(timelineChanged|clipsChanged)\s*\(', argument)
            signal = direct[1] if direct else legacy[1] if legacy else aliases.get(argument.strip())
            if signal:
                signals.append(signal)
        if signals:
            result[path.relative_to(root).as_posix()] = {name: signals.count(name) for name in set(signals)}
    return result


def check_connections(root, baseline, prior=None):
    if prior is not None:
        for filename, signals in baseline.items():
            for signal, limit in signals.items():
                ceiling = prior.get(filename, {}).get(signal, 0)
                if type(limit) is not int or limit < 0 or limit > ceiling:
                    raise ValueError(f'{filename}: {signal} baseline {limit} exceeds prior {ceiling}')
    actual = coarse_connections(root)
    for filename, signals in actual.items():
        for signal, count in signals.items():
            limit = baseline.get(filename, {}).get(signal, 0)
            if type(limit) is not int or limit < 0 or count > limit:
                raise ValueError(f'{filename}: {signal} connections {count} exceeds {limit}')
    return actual


def reject_constant(value):
    raise ValueError(f'Non-finite JSON number: {value}')


def loads(text):
    return json.loads(text, parse_constant=reject_constant)


def check(actual, ceiling):
    if actual.keys() != ceiling.keys():
        raise ValueError(f'Counter schema changed: {actual.keys()} != {ceiling.keys()}')
    for key, value in actual.items():
        limit = ceiling[key]
        if type(value) is not int or type(limit) is not int or value < 0 or limit < 0:
            raise ValueError(f'{key}: counters and ceilings must be non-negative integers')
        if value > limit:
            raise ValueError(f'{key}: {value} exceeds {limit}')


def ratchet(budget, base):
    if budget['scenarios'].keys() != base['scenarios'].keys():
        raise ValueError('Budget scenario schema changed')
    for scenario, ceilings in budget['scenarios'].items():
        check(ceilings, base['scenarios'][scenario])


def result_from(stdout):
    lines = [line.removeprefix('PERF_RESULT=') for line in stdout.splitlines() if line.startswith('PERF_RESULT=')]
    if len(lines) != 1:
        raise ValueError('Expected exactly one measurement result')
    actual = loads(lines[0])
    if actual['stress'] != {'clips': 2000, 'tracks': 64, 'notes': 20000, 'markers': 500} or actual['scene']['pianoRollNotesCount'] != 2000:
        raise ValueError(f'Incomplete stress scene: {actual["scene"]}')
    return actual


def prior_budget(path, allow_new):
    root = Path(subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=path.parent,
                               check=True, capture_output=True, text=True).stdout.strip())
    relative = path.relative_to(root).as_posix()
    subprocess.run(['git', 'rev-parse', '--verify', 'origin/main^{commit}'], cwd=root,
                   check=True, capture_output=True)
    tree = subprocess.run(['git', 'ls-tree', 'origin/main', '--', relative], cwd=root,
                          check=True, capture_output=True, text=True)
    if not tree.stdout:
        if allow_new:
            return None
        raise ValueError('Budget absent from origin/main. Initial adoption requires --allow-new-budget')
    return loads(subprocess.run(['git', 'show', f'origin/main:{relative}'], cwd=root,
                                check=True, capture_output=True, text=True).stdout)


def update_budget(path, scenario, counters, base):
    # Lock a stable sibling inode: replacing the budget changes its own inode.
    with path.with_suffix(path.suffix + '.lock').open('a') as lock:
        if os.name == 'nt':
            import msvcrt
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        else:
            import fcntl
            fcntl.flock(lock, fcntl.LOCK_EX)
        budget = loads(path.read_text())
        if base is not None:
            ratchet(budget, base)
        check(counters, budget['scenarios'][scenario])
        budget['scenarios'][scenario] = counters
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode='w', dir=path.parent, delete=False) as output:
                temporary = Path(output.name)
                output.write(json.dumps(budget, indent=2) + '\n')
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', required=True)
    parser.add_argument('--scenario', required=True)
    parser.add_argument('--budget', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--agent', action='store_true')
    parser.add_argument('--update', action='store_true', help='Lower this scenario to measured counters without raising a ceiling')
    parser.add_argument('--record', action='store_true', help='Print counters without enforcing ceilings')
    parser.add_argument('--base-budget', type=Path, help='Use an explicit reviewed baseline instead of git')
    parser.add_argument('--allow-new-budget', action='store_true', help='Explicit initial adoption when the path is absent from origin/main')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    connections_path = Path(__file__).with_name('coarse-connections.json')
    check_connections(root, loads(connections_path.read_text()), prior_budget(connections_path, True))
    if args.agent and args.scenario != "model_change":
        parser.error("--agent requires --scenario model_change")
    budget = loads(args.budget.read_text())
    for ceilings in budget['scenarios'].values():
        check(ceilings, ceilings)
    base = loads(args.base_budget.read_text()) if args.base_budget else prior_budget(args.budget.resolve(), args.allow_new_budget)
    if base is not None:
        ratchet(budget, base)
    frames = {'playback': 120, 'scroll': 120, 'zoom': 120, 'clip_drag': 90, 'note_drag': 60, 'model_change': 40}[args.scenario]
    env = dict(os.environ, QT_QPA_PLATFORM='offscreen', QSG_RENDER_LOOP='basic',
               QT_SCALE_FACTOR='1', QT_FONT_DPI='96', QT_QUICK_CONTROLS_STYLE='Basic')
    if env.get('NT_TIMELINE_PERF_GPU') == '1':
        env.pop('QT_QUICK_BACKEND', None)
    else:
        env['QT_QUICK_BACKEND'] = 'software'

    def run(profile):
        command = [args.binary, '--scenario', args.scenario, '--frames', str(frames), '--warmup', '12',
                   '--prof-out', str(args.output if profile else args.output.with_suffix('.timing.json'))]
        if profile:
            command.append('--profile')
        if args.agent:
            command.append('--agent')
        result = subprocess.run(command, env=env, text=True, capture_output=True, timeout=170)
        if result.returncode:
            raise RuntimeError(f'Harness failed ({result.returncode})\n{result.stdout}\n{result.stderr[-5000:]}')
        return result_from(result.stdout)

    actual = run(False)
    scenario = 'agent' if args.agent else args.scenario
    if args.update or not args.record:
        check(actual['counters'], budget['scenarios'][scenario])
    profile = run(True)
    actual['profileSummary'] = profile.get('profileSummary', {})
    if args.update:
        update_budget(args.budget, scenario, actual['counters'], base)
    print(json.dumps(actual, indent=2))


if __name__ == '__main__':
    main()
