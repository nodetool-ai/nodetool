"""Exercise ratchet failures through the same CLI used by CI."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

TOOLS = Path(__file__).resolve().parents[1] / 'tools'
sys.path.insert(0, str(TOOLS))
import check_performance


class PerformanceTests(unittest.TestCase):
    def run_check(self, root, baseline, *args):
        return subprocess.run(
            [sys.executable, str(TOOLS / 'check_performance.py'), '--root', str(root),
             '--baseline', str(baseline), *args], capture_output=True, text=True)

    def test_each_rule_rejects_planted_debt_then_passes_after_removal(self):
        samples = [
            ('R6', '.hpp', 'class Bad : public QObject { Q_OBJECT QML_ELEMENT Q_PROPERTY(QVector<int> values READ values) };'),
            ('R6', '.cpp', 'class Bad : public QObject { Q_OBJECT QML_ELEMENT Q_PROPERTY(QList<int> values READ values) };'),
            ('R6', '.h', 'class Bad : public QObject { Q_OBJECT QML_ELEMENT Q_PROPERTY(QList<int> values READ values) };'),
            ('K11', '.qml', 'ListView { delegate: Item { required property int index } }'),
            ('R1', '.qml', 'Item { property var values: [] }'),
            ('R2', '.qml', 'Item { property int n: values.indexOf(1) }'),
            ('R2', '.qml', 'Item { property int n: values.filter(x => x) }'),
            ('R2', '.qml', 'Item { property int n: values.find(x => x) }'),
            ('R4', '.cpp', 'engine.rootContext()->setContextProperty("model", model);'),
            ('R5-canvas', '.qml', 'Item { Canvas {} }'),
            ('R5-painted', '.h', 'struct Plot : QQuickPaintedItem {};'),
            ('R5-painted', '.h', 'class Plot : public QQuickPaintedItem {};'),
        ]
        for qt_type in ('QVariantList', 'QVariantMap', 'QJsonArray', 'QJsonObject'):
            samples.extend([
                ('R3', '.h', f'Q_PROPERTY({qt_type} value READ value NOTIFY changed)'),
                ('R3', '.hpp', f'Q_INVOKABLE const {qt_type}&\nvalue() const;'),
            ])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'native' / 'sample' / 'src'
            source.mkdir(parents=True)
            baseline = root / 'baseline.json'
            baseline.write_text('{}')
            for rule, suffix, sample in samples:
                with self.subTest(rule=rule, sample=sample):
                    path = source / ('Bad' + suffix)
                    path.write_text(sample)
                    result = self.run_check(root, baseline, '--update')
                    self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
                    self.assertIn(f'{rule} old=0 new=1 PERFORMANCE.md rule ', result.stderr)
                    self.assertIn(path.relative_to(root).as_posix(), result.stderr)
                    self.assertEqual(baseline.read_text(), '{}')
                    path.write_text('')
                    self.assertEqual(self.run_check(root, baseline).returncode, 0)
                    path.unlink()

    def test_reductions_update_deleted_files_and_prevent_regrowth(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'native' / 'sample' / 'qml' / 'View.qml'
            source.parent.mkdir(parents=True)
            source.write_text('Item { property var a; }')
            name = source.relative_to(root).as_posix()
            baseline = root / 'baseline.json'
            baseline.write_text(json.dumps({name: {'R1': 2}, 'native/old/qml/Old.qml': {'R1': 1}}))
            before = baseline.read_text()
            result = self.run_check(root, baseline)
            self.assertEqual(result.returncode, 0)
            self.assertIn('NOTE', result.stdout)
            self.assertEqual(baseline.read_text(), before)
            self.assertEqual(self.run_check(root, baseline, '--update').returncode, 0)
            self.assertEqual(json.loads(baseline.read_text()), {name: {'R1': 1}})
            source.write_text('Item { property var a; property var b; }')
            self.assertEqual(self.run_check(root, baseline).returncode, 1)

    def test_comments_literals_and_non_return_types_do_not_count(self):
        text = '''// property var x; Canvas {}; values.find(1)
        /* Q_PROPERTY(QVariantMap x READ x) */
        "setContextProperty("
        R"raw(class X : public QQuickPaintedItem {})raw"
        Q_INVOKABLE bool save(QVariantMap value);
        Q_PROPERTY(QString value READ value)
        '''
        self.assertEqual(check_performance.counts(text, '.h'), {})
        self.assertEqual(check_performance.counts(text, '.qml'), {})

    def test_list_properties_only_count_on_qobjects(self):
        source = """
        struct Record { Q_GADGET Q_PROPERTY(QList<int> values MEMBER values) };
        class Model : public QObject {
            Q_OBJECT
            QML_ELEMENT
            void nested() { if (true) { run(); } }
            Q_PROPERTY(const QList<QPair<int, int>>& values READ values)
            Q_PROPERTY(QVector<int> vector READ vector)
            Q_PROPERTY(QStringList strings READ strings)
            // Q_PROPERTY(QList<int> ignored READ ignored)
            Q_INVOKABLE QList<int> query() const;
        };
        """
        self.assertEqual(check_performance.counts(source, '.h'), {'R6': 2})

    def test_inline_delegate_debt_counts_each_delegate(self):
        delegate = 'delegate: Item { required property int index }'
        source = f'Item {{ ListView {{ {delegate} }} ListView {{ {delegate} }} }}'
        self.assertEqual(check_performance.counts(source, '.qml'), {'K11': 2})

    def test_bound_pragma_satisfies_inline_delegate_check(self):
        source = 'pragma ComponentBehavior: Bound\nListView { delegate: Item { required property int index } }'
        self.assertEqual(check_performance.counts(source, '.qml'), {})

    def test_empty_scope_and_invalid_baseline_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = root / 'baseline.json'
            for value in ('{}', '[]', '{"file": {"R1": -1}}', 'broken'):
                baseline.write_text(value)
                self.assertEqual(self.run_check(root, baseline).returncode, 1)

    def test_scope_includes_new_modules_and_excludes_tests(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('native/new/qml/View.qml', 'native/new/src/Model.h',
                         'native/new/src/tests/Test.h', 'native/new/tests/Test.qml',
                         'native/new/qml/tst_view.qml', 'native/new/src/test_model.cpp'):
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text('')
            self.assertEqual(set(check_performance.inspect(root)), {
                'native/new/qml/View.qml', 'native/new/src/Model.h'})


if __name__ == '__main__':
    unittest.main()
