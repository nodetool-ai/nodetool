#!/usr/bin/env python3
"""Run isolated stress scenarios. Gate work counters, report wall time only."""
import argparse
import json
import os
from pathlib import Path
import subprocess


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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--binary', required=True)
    parser.add_argument('--scenario', required=True)
    parser.add_argument('--budget', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--agent', action='store_true')
    parser.add_argument('--record', action='store_true', help='Print counters without enforcing ceilings')
    parser.add_argument('--base-budget', type=Path, help='Use an explicit reviewed baseline instead of git')
    parser.add_argument('--allow-new-budget', action='store_true', help='Explicit initial adoption when the path is absent from origin/main')
    args = parser.parse_args()
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
    if not args.record:
        check(actual['counters'], budget['scenarios']['agent' if args.agent else args.scenario])
    profile = run(True)
    actual['profileSummary'] = profile.get('profileSummary', {})
    print(json.dumps(actual, indent=2))


if __name__ == '__main__':
    main()
