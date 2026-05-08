
## 2024-05-08 - Use findLastIndex for streaming updates
**Learning:** During high-frequency streaming events (like LLM token generation) where an array is continuously updated, using `findIndex()` to locate the message or step scans from the beginning and creates an O(N²) time complexity bottleneck.
**Action:** Use `findLastIndex()` or an O(1) Map lookup when updating arrays during streaming, since the updated items are typically at or near the end.
