# PSD fixtures

Photoshop files from the [psd-tools](https://github.com/psd-tools/psd-tools)
test suite (`tests/psd_files/`), MIT licensed, see [LICENSE](LICENSE).

`expected.json` was produced by psd-tools 1.24 reading each file with
`topil(apply_icc=False)`: layer tree, names, visibility, opacity, bounds,
blend mode, per-channel pixel sums of each layer, and RGB sums of the
merged image. `psdFixtures.test.ts` checks `decodePsd` against it, so the
expected values come from an independent decoder.
