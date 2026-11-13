import unittest
from build_candidate import replace_exact


class HostAdaptationTest(unittest.TestCase):
    def test_source_drift_fails_instead_of_silently_changing_the_experiment(self):
        self.assertEqual(replace_exact("poll(); yield();", "yield();", "sleep();", 1),
                         "poll(); sleep();")
        with self.assertRaises(RuntimeError):
            replace_exact("poll();", "yield();", "sleep();", 1)
        with self.assertRaises(RuntimeError):
            replace_exact("yield(); yield();", "yield();", "sleep();", 1)


if __name__ == "__main__":
    unittest.main()
