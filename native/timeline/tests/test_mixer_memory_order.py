"""Ordering contracts that runtime stress cannot deterministically falsify."""
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[3]


class MixerMemoryOrder(unittest.TestCase):
    def test_return_payload_precedes_closing_sequence_check(self):
        source = (ROOT / "native/timeline-player/src/model/TimelineTypes.h").read_text()
        read = source.split("void read(Snapshot& next)")[1].split("std::uint64_t generation()")[0]
        self.assertIn("std::atomic_thread_fence(std::memory_order_acquire);", read)
        self.assertLess(read.index("copy.values[i]="), read.index("std::atomic_thread_fence"))
        self.assertLess(read.index("std::atomic_thread_fence"), read.index("if (before==sequence.load(std::memory_order_relaxed))"))

    def test_clear_publishes_both_parameters(self):
        source = (ROOT / "native/timeline/src/model/TimelineModel.cpp").read_text()
        clear = source.split("void TimelineModel::clearMixerOverrides()")[1].split("std::optional<double>")[0]
        for param in ("volumeDb", "pan"):
            self.assertIn(f"state->{param}.store(std::numeric_limits<double>::quiet_NaN(),std::memory_order_release)", clear)


if __name__ == "__main__":
    unittest.main()
