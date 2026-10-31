import importlib.util
import math
from pathlib import Path
import struct
import tempfile
import unittest
import zlib

specification = importlib.util.spec_from_file_location('pixel_metrics', Path(__file__).with_name('pixel-metrics.py'))
metrics = importlib.util.module_from_spec(specification)
specification.loader.exec_module(metrics)


def png(width, height, pixels, channels=3, mode=0):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    rows = bytearray()
    previous = bytes(width * channels)
    for y in range(height):
        row = pixels[y * width * channels:(y + 1) * width * channels]
        encoded = bytearray()
        for x, value in enumerate(row):
            a = row[x - channels] if x >= channels else 0
            b = previous[x]
            c = previous[x - channels] if x >= channels else 0
            if mode == 4:
                prediction = a + b - c
                distances = [abs(prediction - neighbor) for neighbor in (a, b, c)]
                predictor = (a, b, c)[distances.index(min(distances))]
            else:
                predictor = (0, a, b, (a + b) // 2)[mode]
            encoded.append((value - predictor) & 255)
        rows.extend(bytes([mode]) + encoded)
        previous = row
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6 if channels == 4 else 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b'')


class PixelMetricsTest(unittest.TestCase):
    def test_decodes_all_png_filters_for_rgb_and_rgba(self):
        expected = bytes([20, 40, 60, 80, 100, 120, 30, 50, 70, 90, 110, 130])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'filtered.png'
            for channels in (3, 4):
                source = expected if channels == 3 else b''.join(expected[index:index + 3] + b'\xff' for index in range(0, len(expected), 3))
                for mode in range(5):
                    path.write_bytes(png(2, 2, source, channels, mode))
                    width, height, decoded = metrics.read_png(path)
                    self.assertEqual((width, height), (2, 2))
                    self.assertEqual(decoded, expected)

    def test_measures_known_pixel_error_without_declaring_parity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference, candidate = root / 'reference.png', root / 'candidate.png'
            reference.write_bytes(png(2, 2, bytes(12)))
            candidate.write_bytes(png(2, 2, bytes([255]) + bytes(11)))
            report = metrics.compare(reference, candidate, {'resolution': {'width': 2, 'height': 2}})
            whole = report['regions']['whole-frame']
            self.assertAlmostEqual(whole['meanAbsoluteError'], 1 / 12)
            self.assertAlmostEqual(whole['rootMeanSquareError'], math.sqrt(1 / 12))
            self.assertEqual(whole['changedPixelFraction'], 0.25)
            self.assertEqual(whole['maximumChannelError'], 1)
            self.assertTrue(report['alignment'].startswith('Unverified'))
            self.assertEqual(report['acceptance'], 'No automatic parity decision or error threshold is applied.')

    def test_rejects_misaligned_extents_instead_of_rescaling(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference, candidate = root / 'reference.png', root / 'candidate.png'
            reference.write_bytes(png(2, 2, bytes(12)))
            candidate.write_bytes(png(1, 2, bytes(6)))
            with self.assertRaisesRegex(ValueError, 'dimensions differ'):
                metrics.compare(reference, candidate, {'resolution': {'width': 2, 'height': 2}})


if __name__ == '__main__':
    unittest.main()
