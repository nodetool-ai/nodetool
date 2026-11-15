# Native UI primitives

Follow [the native design](DESIGN.md) and [module interface](README.md).
Keep this module independent of feature modules, backend services, web assets,
and npm. Use public Qt APIs and test user interactions through the interface.

Every list, grid or panel that loads or scrolls follows
[Qt Quick performance](PERFORMANCE.md): views instead of repeaters,
row-level models, async image decode, and measured frame times.
