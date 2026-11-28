import json
from pathlib import Path
import tempfile
import unittest
from check_aot import HOT_FILES, check, failed_sites


def stats(result=0):
    entry = dict(line=1, column=1, functionName="width", codegenResult=result)
    return dict(formatRevision=1, modules=[dict(moduleFiles=[dict(entries=[entry, entry])])])


class AotRatchetTests(unittest.TestCase):
    def test_counts_functions_once(self):
        self.assertEqual(len(failed_sites(stats(1))), 1)
        self.assertEqual(len(failed_sites(stats())), 0)

    def test_rejects_regression_missing_file_and_empty_scan(self):
        with tempfile.TemporaryDirectory() as folder:
            cache = Path(folder)
            for name in HOT_FILES:
                (cache / f"timeline_qml_qml_Tracks_{name}_qml.cpp.aotstats").write_text(json.dumps(stats()))
            ceilings = dict.fromkeys(HOT_FILES, 0)
            self.assertEqual(check(cache, ceilings), ceilings)
            clip = cache / "timeline_qml_qml_Tracks_Clip_qml.cpp.aotstats"
            clip.write_text(json.dumps(stats(1)))
            with self.assertRaisesRegex(ValueError, "exceeds"):
                check(cache, ceilings)
            clip.unlink()
            with self.assertRaises(FileNotFoundError):
                check(cache, ceilings)
        with self.assertRaisesRegex(ValueError, "no functions"):
            failed_sites(dict(formatRevision=1, modules=[]))


if __name__ == "__main__":
    unittest.main()
