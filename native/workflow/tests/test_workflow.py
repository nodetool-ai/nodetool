#!/usr/bin/env python3
"""Exercise the native compiler and runner through their public CLI."""
import copy
import concurrent.futures
import json
import math
import os
import random
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import unittest

EXECUTABLE = str(Path(sys.argv.pop(1)).resolve()) if len(sys.argv) > 1 else "nodetool-native"
EXAMPLES = Path(__file__).resolve().parents[1] / "examples"


def node(identifier, operation, **properties):
    return {"id": identifier, "type": "nodetool.native." + operation, "properties": properties}


def edge(source, target, port="input", handle="output"):
    return {"source": source, "sourceHandle": handle, "target": target, "targetHandle": port}


def graph(nodes, edges):
    return {"settings": {"execution": {"kind": "native", "version": 1}}, "nodes": nodes, "edges": edges}


def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="native-workflow-test-")
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.sequence = 0

    def invoke(self, *arguments, success=True):
        result = subprocess.run([EXECUTABLE, *map(str, arguments)], capture_output=True, text=True, timeout=120)
        if success:
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(result.stderr.strip() or result.stdout.strip(), "rejection needs a diagnostic")
        return result

    def compile(self, document, success=True, mode="strict", target="cpu"):
        self.sequence += 1
        source = self.root / f"graph-{self.sequence}.json"
        artifact = self.root / f"artifact-{self.sequence}"
        source.write_text(json.dumps(document))
        self.invoke("compile", source, "--output", artifact, "--target", target, "--mode", mode, success=success)
        if success:
            for filename in (("library.so", "source.cpp", "optimized.ll", "manifest.json") if target == "cpu"
                             else ("kernel.ptx", "source.cpp", "manifest.json")):
                self.assertTrue((artifact / filename).is_file(), filename)
        return artifact

    def run_artifact(self, artifact, inputs, label="run", repeat=1):
        manifest = json.loads((artifact / "manifest.json").read_text())
        arguments = ["run", artifact, "--repeat", str(repeat)]
        for name, values in inputs.items():
            filename = self.root / f"{label}-input-{name}.bin"
            filename.write_bytes(struct.pack("<" + "f" * len(values), *values))
            arguments.extend(["--input", f"{name}={filename}"])
        outputs = {}
        for entry in manifest["outputs"]:
            filename = self.root / f"{label}-output-{entry['name']}.bin"
            outputs[entry["name"]] = filename
            arguments.extend(["--output", f"{entry['name']}={filename}"])
        self.invoke(*arguments)
        result = {}
        for name, filename in outputs.items():
            data = filename.read_bytes()
            self.assertEqual(len(data) % 4, 0)
            result[name] = list(struct.unpack("<" + "f" * (len(data) // 4), data))
        return result

    def assert_values(self, actual, expected, tolerance=2e-5):
        self.assertEqual(len(actual), len(expected))
        for index, (value, reference) in enumerate(zip(actual, expected)):
            if math.isnan(reference):
                self.assertTrue(math.isnan(value), str(index))
            elif math.isinf(reference):
                self.assertEqual(value, reference, str(index))
            else:
                self.assertTrue(math.isclose(value, reference, rel_tol=tolerance, abs_tol=tolerance),
                                f"element {index}: {value} != {reference}")

    def example(self, name):
        return json.loads((EXAMPLES / (name + ".json")).read_text())

    def assert_image_golden(self, name):
        directory = EXAMPLES / "golden"
        document = json.loads((directory / (name + ".json")).read_text())
        case = json.loads((directory / "expected.json").read_text())[name]
        targets = ["cpu"]
        if os.environ.get("NODETOOL_TEST_CUDA") == "1":
            targets.append("cuda")
        for target in targets:
            with self.subTest(target=target):
                artifact = self.compile(document, target=target)
                actual = self.run_artifact(artifact, case["inputs"], name + target)
                self.assertEqual(set(actual), set(case["outputs"]))
                for output, expected in case["outputs"].items():
                    self.assert_values(actual[output], expected, tolerance=1e-6)

    def test_motion_blur_golden(self):
        self.assert_image_golden("motion-blur")

    def test_cnn_classifier_golden(self):
        self.assert_image_golden("cnn-classifier")

    def test_ai_image_filter_golden(self):
        self.assert_image_golden("ai-image-filter")

    def test_color_grading_golden(self):
        self.assert_image_golden("color-grading")

    def test_artifact_identity_ignores_editor_changes(self):
        original = self.example("compute-shader")
        first = self.compile(original)
        digest = json.loads((first / "manifest.json").read_text())["content_hash"]
        edited = copy.deepcopy(original)
        for item in edited["nodes"]:
            item["position"] = {"x": 101, "y": -50}
            item["title"] = "Editor label"
        cached_source = self.root / "editor-change.json"
        cached_source.write_text(json.dumps(edited))
        original_timestamp = (first / "library.so").stat().st_mtime_ns
        self.invoke("compile", cached_source, "--output", first, "--target", "cpu", "--mode", "strict")
        self.assertEqual(original_timestamp, (first / "library.so").stat().st_mtime_ns)
        renamed = copy.deepcopy(edited)
        for item in renamed["nodes"]:
            if item["id"] == "phase":
                item["id"] = "renamed_phase"
        for connection in renamed["edges"]:
            for endpoint in ("source", "target"):
                if connection[endpoint] == "phase":
                    connection[endpoint] = "renamed_phase"
        cached_source.write_text(json.dumps(renamed))
        self.invoke("compile", cached_source, "--output", first, "--target", "cpu", "--mode", "strict")
        refreshed = json.loads((first / "manifest.json").read_text())
        self.assertEqual(digest, refreshed["content_hash"])
        self.assertEqual(original_timestamp, (first / "library.so").stat().st_mtime_ns)
        diagnostic_ids = {entry["node_id"] for entry in refreshed["diagnostic_nodes"]}
        self.assertIn("renamed_phase", diagnostic_ids)
        self.assertNotIn("phase", diagnostic_ids)
        same = self.compile(edited)
        self.assertEqual(digest, json.loads((same / "manifest.json").read_text())["content_hash"])
        edited["nodes"][1]["properties"]["value"] = 0.8
        different = self.compile(edited)
        self.assertNotEqual(digest, json.loads((different / "manifest.json").read_text())["content_hash"])
        fast = self.compile(original, mode="fast")
        self.assertNotEqual(digest, json.loads((fast / "manifest.json").read_text())["content_hash"])

    @unittest.skipUnless(os.environ.get("NODETOOL_TEST_CUDA") == "1", "set NODETOOL_TEST_CUDA=1 on a CUDA host")
    def test_cuda_fused_clamp_tail_and_parity(self):
        document = graph([node("x", "Input", name="x", dtype="f32", shape=[513]),
                          node("scale", "Input", name="scale", dtype="f32", shape=[]),
                          node("bias", "Input", name="bias", dtype="f32", shape=[]),
                          node("zero", "Constant", dtype="f32", shape=[], value=0),
                          node("one", "Constant", dtype="f32", shape=[], value=1),
                          node("mul", "Multiply"), node("add", "Add"),
                          node("max", "Maximum"), node("min", "Minimum"), node("out", "Output", name="y")],
                         [edge("x", "mul", "a"), edge("scale", "mul", "b"),
                          edge("mul", "add", "a"), edge("bias", "add", "b"),
                          edge("add", "max", "a"), edge("zero", "max", "b"),
                          edge("max", "min", "a"), edge("one", "min", "b"), edge("min", "out")])
        inputs = {"x": [f32((i - 100) / 300) for i in range(513)], "scale": [1.7], "bias": [-0.1]}
        gpu = self.compile(document, target="cuda")
        cpu = self.compile(document)
        result = self.run_artifact(gpu, inputs, "gpu", repeat=3)["y"]
        self.assert_values(result, self.run_artifact(cpu, inputs, "cpu")["y"])
        self.assert_values(result, [min(1, max(0, x * f32(1.7) + f32(-0.1))) for x in inputs["x"]])
        self.compile(self.example("compute-shader"), target="cuda", success=False)

    def test_compute_shader_coordinates(self):
        artifact = self.compile(self.example("compute-shader"))
        actual = self.run_artifact(artifact, {})["image"]
        self.assert_values(actual, [math.sin(f32(x * f32(0.7))) for _ in range(3) for x in range(7)])

    def test_image_filter_impulses_and_borders(self):
        artifact = self.compile(self.example("image-filter"))
        for label, pixels in (("impulse", [1.0] + [0.0] * 14), ("constant", [0.3] * 15)):
            horizontal = [sum(2 * pixels[y * 5 + min(4, max(0, x + dx))] * weight
                              for dx, weight in ((-1, 0.25), (0, 0.5), (1, 0.25)))
                          for y in range(3) for x in range(5)]
            expected = [sum(horizontal[min(2, max(0, y + dy)) * 5 + x] * weight
                            for dy, weight in ((-1, 0.25), (0, 0.5), (1, 0.25)))
                        for y in range(3) for x in range(5)]
            self.assert_values(self.run_artifact(artifact, {"image": pixels}, label)["filtered"], expected)

    def test_audio_state_continuity(self):
        artifact = self.compile(self.example("audio-biquad"))
        state = [0.0] * 4
        reference_state = state[:]
        for block in range(2):
            audio = [f32(math.sin((i + block * 7) * 0.31)) for i in range(14)]
            expected = []
            for channel in range(2):
                z1, z2 = reference_state[channel * 2:channel * 2 + 2]
                for sample in audio[channel * 7:channel * 7 + 7]:
                    x = sample * 0.5
                    y = 0.5 * x + z1
                    z1, z2 = 0.25 * x + 0.2 * y + z2, 0.125 * x - 0.1 * y
                    expected.append(math.tanh(y))
                reference_state[channel * 2:channel * 2 + 2] = [z1, z2]
            actual = self.run_artifact(artifact, {"audio": audio, "state": state}, "block" + str(block))
            self.assert_values(actual["audio_out"], expected)
            self.assert_values(actual["state_out"], reference_state)
            state = actual["state_out"]

    def test_tensor_and_neural_examples(self):
        inputs = {"x": [1, -2, 3, -1, 2, 0.5],
                  "weight": [0.25, -1, 2, 0.5, -0.5, 1.5], "bias": [-0.2, 0.4]}
        linear = []
        for row in range(2):
            for column in range(2):
                total = 0.0
                for k in range(3):
                    total = f32(total + f32(inputs["x"][row * 3 + k] * inputs["weight"][k * 2 + column]))
                linear.append(f32(total + inputs["bias"][column]))
        tensor = self.run_artifact(self.compile(self.example("tensor-mlp")), inputs)["y"]
        self.assert_values(tensor, [(max(0, linear[c]) + max(0, linear[2 + c])) / 2 for c in range(2)])

    def test_neural_cnn_example(self):
        inputs = {"x": [f32((i - 5) / 4) for i in range(16)],
                  "conv_weight": [0.5, -0.25, 0.125, 0.75], "bias": [-0.2],
                  "linear_weight": [0.5, -1, 0.25, 0.3, -0.2, 0.1, 0.8, -0.5]}
        conv = []
        for y in range(3):
            for x in range(3):
                total = 0.0
                for ky in range(2):
                    for kx in range(2):
                        total = f32(total + f32(inputs["x"][(y + ky) * 4 + x + kx] * inputs["conv_weight"][ky * 2 + kx]))
                conv.append(max(0, f32(total + inputs["bias"][0])))
        pooled = [max(conv[(y + ky) * 3 + x + kx] for ky in range(2) for kx in range(2))
                  for y in range(2) for x in range(2)]
        expected = [sum(pooled[k] * inputs["linear_weight"][k * 2 + c] for k in range(4)) for c in range(2)]
        result = self.run_artifact(self.compile(self.example("neural-inference")), inputs)
        self.assert_values(result["prediction"], expected)

    def test_diffusion_example_and_seed_reproducibility(self):
        artifact = self.compile(self.example("diffusion-step"))
        inputs = {"latent": [1, 2, 3, 4, 5, 6], "uncond": [0.1] * 6, "cond": [0.3] * 6}
        first = self.run_artifact(artifact, inputs, "first")
        second = self.run_artifact(artifact, inputs, "second")
        self.assert_values(first["latent_out"], [x - 0.1 * (0.1 + 7.5 * (0.3 - 0.1)) for x in inputs["latent"]])
        self.assertEqual(first["noise"], second["noise"])
        expected_noise = []
        for i in range(6):
            value = i + 42
            value ^= value >> 16
            value = (value * 0x7FEB352D) & 0xFFFFFFFF
            value ^= value >> 15
            value = (value * 0x846CA68B) & 0xFFFFFFFF
            value ^= value >> 16
            expected_noise.append((value >> 8) / 16777216)
        self.assert_values(first["noise"], expected_noise, tolerance=0)

    def test_broadcast_fusion_tail_and_concurrent_calls(self):
        document = graph([
            node("x", "Input", name="x", dtype="f32", shape=[3, 7]),
            node("scale", "Input", name="scale", dtype="f32", shape=[]),
            node("bias", "Input", name="bias", dtype="f32", shape=[7]),
            node("multiply", "Multiply"), node("add", "Add"),
            node("output", "Output", name="y")],
            [edge("x", "multiply", "a"), edge("scale", "multiply", "b"),
             edge("multiply", "add", "a"), edge("bias", "add", "b"), edge("add", "output")])
        artifact = self.compile(document)
        values = [f32((i - 9) / 7) for i in range(21)]
        bias = [f32(i / 10) for i in range(7)]
        expected = [f32(f32(x * 2) + bias[i % 7]) for i, x in enumerate(values)]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(self.run_artifact, artifact,
                                   {"x": values, "scale": [2], "bias": bias}, f"parallel-{i}", 3)
                       for i in range(2)]
            for future in futures:
                self.assert_values(future.result()["y"], expected)

    def test_seeded_random_expression_graphs(self):
        rng = random.Random(1907)
        for case in range(4):
            length = rng.choice([1, 3, 17, 33])
            nodes = [node("x", "Input", name="x", dtype="f32", shape=[length])]
            edges = []
            values = [f32(rng.uniform(-1, 1)) for _ in range(length)]
            expected = values[:]
            previous = "x"
            for step in range(5):
                operation = rng.choice(["Add", "Subtract", "Multiply"])
                constant = f32(rng.uniform(-0.8, 0.8))
                constant_id, operation_id = "c" + str(step), "op" + str(step)
                nodes += [node(constant_id, "Constant", dtype="f32", shape=[], value=constant),
                          node(operation_id, operation)]
                edges += [edge(previous, operation_id, "a"), edge(constant_id, operation_id, "b")]
                if operation == "Add":
                    expected = [f32(x + constant) for x in expected]
                elif operation == "Subtract":
                    expected = [f32(x - constant) for x in expected]
                else:
                    expected = [f32(x * constant) for x in expected]
                previous = operation_id
            nodes.append(node("out", "Output", name="y"))
            edges.append(edge(previous, "out"))
            artifact = self.compile(graph(nodes, edges))
            self.assert_values(self.run_artifact(artifact, {"x": values}, "random" + str(case))["y"], expected)

    def test_strict_exceptional_values_and_signed_zero(self):
        document = graph([node("x", "Input", name="x", dtype="f32", shape=[7]),
                          node("two", "Constant", dtype="f32", shape=[], value=2),
                          node("mul", "Multiply"), node("out", "Output", name="y")],
                         [edge("x", "mul", "a"), edge("two", "mul", "b"), edge("mul", "out")])
        artifact = self.compile(document)
        values = [float("nan"), float("inf"), -float("inf"), -0.0, 0.0, 1e-40, -1e-40]
        actual = self.run_artifact(artifact, {"x": values})["y"]
        self.assert_values(actual, [f32(f32(x) * 2) for x in values], tolerance=0)
        self.assertEqual(math.copysign(1, actual[3]), -1)
        self.assertEqual(math.copysign(1, actual[4]), 1)

    def test_validation_rejects_invalid_graphs_before_codegen(self):
        malformed = self.root / "malformed.json"
        malformed.write_text('{"nodes":[')
        self.invoke("compile", malformed, "--output", self.root / "invalid", success=False)
        valid = graph([node("x", "Input", name="x", dtype="f32", shape=[3]),
                       node("out", "Output", name="y")], [edge("x", "out")])
        cases = []
        def changed(mutator):
            document = copy.deepcopy(valid)
            mutator(document)
            cases.append(document)
        changed(lambda d: d["nodes"].append(copy.deepcopy(d["nodes"][0])))
        changed(lambda d: d["edges"][0].update(source="missing"))
        changed(lambda d: d["edges"][0].update(sourceHandle="missing"))
        changed(lambda d: d["edges"][0].update(targetHandle="missing"))
        changed(lambda d: d["edges"].append(copy.deepcopy(d["edges"][0])))
        changed(lambda d: d["nodes"].append(node("unsupported", "Python")))
        changed(lambda d: d["nodes"][0].update(dynamic_properties={"x": 1}))
        changed(lambda d: d["nodes"][0].update(is_streaming=True))
        changed(lambda d: d["nodes"][0]["properties"].update(shape=[2 ** 62, 8]))
        cycle = copy.deepcopy(valid)
        cycle["nodes"] += [node("a", "Add"), node("b", "Add")]
        cycle["edges"] += [edge("a", "b", "a"), edge("b", "a", "a"),
                           edge("x", "a", "b"), edge("x", "b", "b")]
        cases.append(cycle)
        changed(lambda d: d["edges"][0].update(type="control"))
        mismatch = graph([node("a", "Input", name="a", dtype="f32", shape=[2]),
                          node("b", "Input", name="b", dtype="f32", shape=[3]),
                          node("add", "Add"), node("out", "Output", name="y")],
                         [edge("a", "add", "a"), edge("b", "add", "b"), edge("add", "out")])
        cases.append(mismatch)
        cases += [{}, {"nodes": "bad", "edges": []}]
        for index, document in enumerate(cases):
            with self.subTest(case=index):
                self.compile(document, success=False)


if __name__ == "__main__":
    unittest.main()
