# Sunrush Kart native port

Ports the original coastal race to `native-cpp-1`, schema 4, native Jolt pose
markers and shared QuickJS. The original game and assets remain unchanged.
All 31 source entities and ten original script bodies are retained.

The fixture preserves ordered race gates, three laps, rivals, drift/items,
recovery, camera and HUD logic through explicit native bindings. Exact
attribute-tuple welding and bounded partitions retain triangle attributes,
selected scenes, materials and animation without raising caps. Original vertex
colors and emissive-strength channels remain intact.

Read [verification and reproduction](VERIFY.md) for commands, provenance,
controls and presentation differences. Model admission, full route/replay,
live input, captures and performance require their actual runtime reports.
Development validation alone does not establish those results.

The adapter explicitly documents unsupported dynamic kart scale, moving
minimap dots, pointer/focus buttons, source fog/postprocessing, confetti shape
and audio processing. It does not claim complete visual or hardware performance
parity.
