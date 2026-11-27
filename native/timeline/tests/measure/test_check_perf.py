import sys
import unittest

sys.dont_write_bytecode = True
from check_perf import check, loads, ratchet, result_from, prior_budget
from unittest.mock import patch
import json
import subprocess
import tempfile
from pathlib import Path


class BudgetTest(unittest.TestCase):
    def test_git_failures_are_not_adoption(self):
        def result(stdout=''):
            return subprocess.CompletedProcess([], 0, stdout=stdout)
        with patch('check_perf.subprocess.run', side_effect=[result('/repo'), subprocess.CalledProcessError(1, 'git')]):
            with self.assertRaises(subprocess.CalledProcessError):
                prior_budget(Path('/repo/budget.json'), True)
        for allow in (False, True):
            with patch('check_perf.subprocess.run', side_effect=[result('/repo'), result(), result()]):
                if allow:
                    self.assertIsNone(prior_budget(Path('/repo/budget.json'), True))
                else:
                    with self.assertRaises(ValueError):
                        prior_budget(Path('/repo/budget.json'), False)
        with patch('check_perf.subprocess.run', side_effect=[result('/repo'), result(), result('budget.json'), subprocess.CalledProcessError(1, 'git')]):
            with self.assertRaises(subprocess.CalledProcessError):
                prior_budget(Path('/repo/budget.json'), True)

    def test_cli_regression_and_restore(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            binary = root / 'fake-harness'
            binary.write_text('#!' + sys.executable + '\nimport json\nprint("PERF_RESULT=" + json.dumps(' + repr({
                'stress': {'clips': 2000, 'tracks': 64, 'notes': 20000, 'markers': 500},
                'scene': {'pianoRollNotesCount': 2000}, 'counters': {'objects': 10}}) + '))\n')
            binary.chmod(0o755)
            budget = root / 'budget.json'
            baseline = root / 'base.json'
            def write(path, value):
                path.write_text(json.dumps({'scenarios': {'playback': {'objects': value}}}))
            write(budget, 10)
            write(baseline, 10)
            command = [sys.executable, str(Path(__file__).with_name('check_perf.py')),
                       '--binary', str(binary), '--scenario', 'playback', '--budget', str(budget),
                       '--base-budget', str(baseline), '--output', str(root / 'result.json')]
            def run():
                return subprocess.run(command, capture_output=True, text=True)
            self.assertEqual(run().returncode, 0)
            write(budget, 9)  # Real measured regression: 10 objects against 9.
            regression = run()
            self.assertNotEqual(regression.returncode, 0)
            self.assertIn('10 exceeds 9', regression.stderr)
            write(budget, 11)  # Loosening a ceiling is a separate ratchet failure.
            increase = run()
            self.assertNotEqual(increase.returncode, 0)
            self.assertIn('11 exceeds 10', increase.stderr)
            write(budget, 10)
            self.assertEqual(run().returncode, 0)

    def test_scenario_schema(self):
        for scenarios in ({}, {'a': {'objects': 0}, 'b': {'objects': 0}}):
            with self.assertRaises(ValueError):
                ratchet({'scenarios': scenarios}, {'scenarios': {'a': {'objects': 0}}})

    def test_non_finite_json(self):
        for value in ('NaN', 'Infinity', '-Infinity'):
            with self.assertRaises(ValueError):
                loads('{"value":' + value + '}')

    def test_result_validation(self):
        valid = 'PERF_RESULT=' + json.dumps({'stress': {'clips': 2000, 'tracks': 64, 'notes': 20000, 'markers': 500}, 'scene': {'pianoRollNotesCount': 2000}})
        result_from(valid)
        for output in ('', valid + '\n' + valid, valid.replace('20000', '20')):
            with self.assertRaises(ValueError):
                result_from(output)

    def test_lower_or_equal(self):
        check({'objects': 9}, {'objects': 10})
        check({'objects': 10}, {'objects': 10})

    def test_reject_increase(self):
        with self.assertRaises(ValueError):
            check({'objects': 11}, {'objects': 10})

    def test_reject_missing_counter(self):
        with self.assertRaises(ValueError):
            check({}, {'objects': 10})

    def test_reject_bad_types(self):
        for value in (True, False, 1.5, float("inf"), float("nan"), -1):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    check({"objects": 0}, {"objects": value})
                with self.assertRaises(ValueError):
                    check({"objects": value}, {"objects": 10})

    def test_reject_negative(self):
        with self.assertRaises(ValueError):
            check({'objects': -1}, {'objects': 10})


if __name__ == '__main__':
    unittest.main()
