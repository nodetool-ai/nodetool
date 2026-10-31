import unittest
import sys
import tempfile
import io
from contextlib import redirect_stdout, redirect_stderr
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))
from check_design import audit
import check_design

class DesignAuditTests(unittest.TestCase):
    def test_acceptance_review_style_bypasses_are_rejected(self):
        cases = [
            'Item { anchors.margins: 13 }',
            'Item { anchors { margins: 13 } }',
            'Rectangle { color: "magenta" }',
            'Rectangle { border.color: "red" }',
            'Item { property color customInk: "aliceblue" }',
            'import NodeTool.UiPrimitives as Ui\nUi.Text { id: caption; Component.onCompleted: caption.font.pixelSize = 40 }',
            'import NodeTool.UiPrimitives as Ui\nUi.Text { id: caption; Component.onCompleted: caption.color = "magenta" }',
            'Item { function apply(): void { Qt.createQmlObject("Rectangle {}", parent) } }',
            'Item { function apply(): Item { Qt.createQmlObject("Rectangle {}", parent); return null } }'
        ]
        for source in cases:
            with self.subTest(source=source):
                self.assertTrue(check_design.inspect(source, 'invalid.qml', strict=True))

    def test_conditional_color_cannot_hide_after_first_operand(self):
        self.assertTrue(any('literal color' in issue for issue in audit('Rectangle { color: selected ? "#fff" : "#000" }', 'bad.qml')))
        self.assertTrue(audit('Rectangle { color: selected ? "magenta" : "transparent" }', 'bad.qml'))
        self.assertEqual(audit('Rectangle { color: status === "saved" ? Ui.Theme.statusSuccess : Ui.Theme.textPrimary }', 'good.qml'), [])
        self.assertEqual(audit('QtObject { property var color: effects.find(effect => effect.type === "color") }', 'good.qml'), [])

    def test_alias_is_resolved_from_import_not_spelling(self):
        self.assertTrue(audit('import QtQuick.Controls as Ui\nUi.Button {}', 'bad.qml'))
        self.assertEqual(audit('import NodeTool.UiPrimitives as Design\nDesign.Text { text: "Hello" }', 'good.qml'), [])
        self.assertTrue(audit('/* import NodeTool.UiPrimitives as Ui */\nUi.Text {}', 'bad.qml'))
        self.assertTrue(audit('import NodeTool.UiPrimitives as Ui\nimport QtQuick.Controls as Ui\nUi.Button {}', 'bad.qml'))

    def test_binding_scope_and_javascript_regex_are_preserved(self):
        objects, errors, aliases = check_design.parse('Item { id: root\n Canvas { id: plot\n onPaint: { const test = /a{2}/g; if (test) { draw() } }\n }\n Text { id: caption; text: "Value" } }')
        self.assertEqual(errors, [])
        self.assertEqual([obj.key for obj in objects], ['root', 'root/plot', 'root/caption'])
        self.assertEqual(objects[1].bindings[-1].name, 'onPaint')

    def test_measurement_can_copy_a_primitive_font(self):
        self.assertEqual(audit('TextMetrics { font: caption.font }', 'good.qml'), [])
        self.assertTrue(audit('TextMetrics { font.pixelSize: 13 }', 'bad.qml'))
        self.assertEqual(audit('import NodeTool.UiPrimitives as Ui\nTimeRulerCanvas { font: Ui.Typography.font(Ui.Typography.MonoCaption) }', 'good.qml'), [])
        self.assertTrue(audit('import NodeTool.UiPrimitives as Ui\nTimeRulerCanvas { font: Ui.Typography.font(Ui.Typography.MonoCaption) || Qt.font({family: "Wrong"}) }', 'bad.qml'))
        self.assertEqual(audit('import NodeTool.UiPrimitives as Ui\nCanvas { onPaint: { ctx.font = Ui.Typography.canvasFont(Ui.Typography.MonoCaption); ctx.fillText("Data", 0, 0) } }', 'good.qml'), [])
        self.assertEqual(audit('import NodeTool.UiPrimitives as Ui\nCanvas { onPaint: { ctx.font = Ui.Typography.canvasFont(Ui.Typography.MonoCaption)\nctx.fillText("Data", 0, 0) } }', 'good.qml'), [])

    def test_raw_text_and_overridden_primitive_internals_fail(self):
        self.assertTrue(audit('Text { text: "Wrong role" }', 'bad.qml'))
        self.assertTrue(audit('import NodeTool.UiPrimitives as Ui\nUi.EditorButton { background: Rectangle {} }', 'bad.qml'))
        self.assertEqual(audit('import NodeTool.UiPrimitives as Ui\nUi.Dialog { contentItem: Item {} }', 'good.qml'), [])
        self.assertTrue(audit('import NodeTool.UiPrimitives as Ui\nUi.EditorButton { contentItem: Item {} }', 'bad.qml'))

    def test_scoped_exception_cannot_cover_a_neighbor_or_go_stale(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            module = root / 'module'
            (module / 'tools').mkdir(parents=True)
            qml = root / 'native/chat/qml'
            qml.mkdir(parents=True)
            source = qml / 'Plot.qml'
            source.write_text('Item { id: root\n Rectangle { id: scene; color: "#fff" }\n Rectangle { id: chrome; color: "#fff" } }')
            manifest = module / 'tools/migration.toml'
            manifest.write_text('version = 1\n[[file]]\npath = "native/chat/qml/Plot.qml"\ncategory = "domain"\ntest_host = "plot fixture"\nreplacement = "document surface"\n[[exception]]\npath = "native/chat/qml/Plot.qml"\nobject = "root/scene"\nbinding = "color"\nrule = "color"\nowner = "Document editor"\nreason = "Document color is user content"\n')
            with patch.object(check_design, 'ROOT', root), patch.object(check_design, 'MODULE', module), patch.object(check_design, 'ROOTS', ('native/chat/qml',)):
                output = io.StringIO()
                with redirect_stdout(output), redirect_stderr(output):
                    self.assertEqual(check_design.main(['--strict']), 1)
                self.assertIn('root/chrome', output.getvalue())
                source.write_text('Item { id: root\n Rectangle { id: scene; color: "#fff" } }')
                with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                    self.assertEqual(check_design.main(['--strict']), 0)
                source.write_text('Item { id: root }')
                with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
                    self.assertEqual(check_design.main(['--strict']), 1)

    def test_rejects_interactive_control_and_literal(self):
        issues = audit('Item { Button { background: Rectangle { color: "#ff0000" } } }', 'invalid.qml')
        self.assertTrue(any('interactive control' in issue for issue in issues))
        self.assertTrue(any('literal color' in issue for issue in issues))

    def test_ignores_comments_and_string_contents(self):
        self.assertEqual(audit('Item { // Button { color: "#fff" }\n property string data: "Button { color: \\\"#fff\\\" }" }', 'valid.qml'), [])

    def test_qualified_ui_is_allowed_and_basic_is_not(self):
        self.assertEqual(audit('import NodeTool.UiPrimitives as Ui\nUi.EditorButton { }', 'valid.qml'), [])
        self.assertTrue(any('Basic.Button' in x for x in audit('Basic.Button { }', 'invalid.qml')))

    def test_rejects_literal_recipes_and_templates(self):
        for sample in ('Item { border.color: Qt.rgba(1, 1, 1, .5) }', 'Item { spacing: 4 }', 'Item { font.weight: 600 }', 'Item { property string x: `x` }'):
            self.assertTrue(audit(sample, 'invalid.qml'), sample)

    def test_metric_token_does_not_hide_literal_offset(self):
        for value in ('Ui.Metrics.none + 13', 'Ui.Metrics.sm + 13',
                      'Ui.Metrics.sm + 0xD', 'active ? Ui.Metrics.sm : 13',
                      'Ui.Metrics.sm * 13'):
            with self.subTest(value=value):
                issues = check_design.inspect('Item { spacing: ' + value + ' }', 'invalid.qml')
                self.assertTrue(any(issue.rule == 'metric' for issue in issues), issues)
        for value in ('Ui.Metrics.sm', 'Ui.Metrics.sm + 0',
                      'Ui.Metrics.sm * 1', '1 * Ui.Metrics.sm'):
            with self.subTest(value=value):
                issues = check_design.inspect('import NodeTool.UiPrimitives as Ui\nItem { spacing: ' + value + ' }', 'valid.qml')
                self.assertFalse(any(issue.rule == 'metric' for issue in issues), issues)

    def test_large_input(self):
        self.assertEqual(audit('Item {\n' + 'property string value: "domain"\n' * 20000 + '}', 'large.qml'), [])

    def test_rejects_unbalanced_scopes(self):
        self.assertTrue(audit('Item {', 'broken.qml'))

if __name__ == '__main__':
    unittest.main()
