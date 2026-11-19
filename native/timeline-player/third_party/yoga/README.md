# Yoga 3.2.1 (vendored)

The C++ core of [Yoga](https://github.com/facebook/yoga), tag `v3.2.1`
(commit `042f5013152eb81c1552dec945b88f7b95ca350f`). `@nodetool-ai/timeline`
lays out flex groups with the `yoga-layout` npm package at `~3.2.1`, which is
this source compiled to WebAssembly. The native scene model
(`src/scene/FlexLayout.cpp`) uses the same source, so both compute the same
boxes.

Contents: the `yoga/` source folder of the tag, unchanged, and `LICENSE`
(MIT). CMakeLists.txt builds it as the `yogacore` static library with
`-ffp-contract=off`: WebAssembly has no fused multiply-add, so a contracted
build could round differently from the npm package.
