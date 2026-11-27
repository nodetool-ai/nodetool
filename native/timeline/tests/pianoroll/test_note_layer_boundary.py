"""Keep GUI objects and font engines outside render synchronization."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]

class NoteLayerBoundary(unittest.TestCase):
    def test_render_uses_item_snapshot(self):
        source = (ROOT / 'src/midi/NoteLayerItem.cpp').read_text()
        render = source.split('QSGNode* NoteLayerItem::updatePaintNode')[1]
        self.assertNotIn('m_controller->', render)
        self.assertNotIn('QFontMetrics', render)
        drawing = source.split('class Drawing')[1].split('void replaceLayer')[0]
        self.assertNotIn('addText(', drawing)
        self.assertNotIn('QFontMetrics', drawing)

    def test_no_private_triangulator(self):
        source = (ROOT / "src/midi/NoteLayerItem.cpp").read_text()
        self.assertNotIn("qtriangulator_p.h", source)

    def test_counters_are_synchronized(self):
        header = (ROOT / 'src/midi/NoteLayerItem.h').read_text()
        self.assertIn('std::atomic<int> m_contentBuildCount', header)
        self.assertIn('std::atomic<int> m_overlayBuildCount', header)

if __name__ == '__main__':
    unittest.main()
