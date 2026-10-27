# Plan comparators

Each `.mjs` default-exports an object with synchronous `layer`, `precomposite`
or `frame` functions. Each function receives `{ web, native, document, timeMs }`.
Layer and precomposite functions also receive the original `clip`.
Return an array of mismatch strings, empty for a match. Exceptions, invalid
returns and module-load errors fail the check. Files run in filename order.
