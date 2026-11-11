# Latency suite

Times user interactions in the web app and fails any that miss the 400 ms
Doherty threshold. IBM research by Walter Doherty and Ahrvind Thadani (1982)
found that people stay in flow when a system answers within 400 ms.

## Running

```bash
npm run test:latency
npm run typecheck:playwright
```

Playwright builds the app, serves it with `vite preview` on port 3000, and
starts the seeded hermetic backend from the journey suite. Set
`LATENCY_DEV_SERVER=1` to measure against `npm run dev` instead. The dev
server is slower than the build, so only compare runs made the same way.

Each run prints one line per interaction and appends the samples to
`test-results/doherty.jsonl`.

## What a sample measures

`doherty.ts` starts the clock at the `timeStamp` of the first trusted input
event in the page, and stops it at the first animation frame in which the
result is on screen. A result counts as on screen when it is inside the
viewport and is the topmost element at a point inside its box, so content in
a collapsed panel or a background tab does not count. Playwright's own round
trip is outside the measurement.

The longest Event Timing entry in the window is reported beside it. It is the
input-to-next-paint time the browser reports for INP, and it shows main-thread
jank even when the result itself appears quickly.

Tracing is off in this config, because Playwright's DOM snapshots run on the
page's main thread and add to the samples.

## Budgets

| Interaction | Must show | Within |
| --- | --- | --- |
| Without `feedback` | The result | 400 ms |
| With `feedback` | The feedback, such as the new tab or a skeleton | 400 ms |
| With `feedback` | The full result | 1 s (`loadedBudgetMs`) |

Every sample is held to the budget, including the first one, when chunks,
queries and caches are cold. A user meets the cold path on every page load.

Declare `feedback` only for an interaction that has to load something. It
states which visible element tells the user their input was received.

## Adding an interaction

Call `measureInteraction` with:

- `reset`: puts the page back in the starting state. It is not timed.
- `act`: performs the interaction through Playwright.
- `ready`: the selector, text or count that shows the result. `changes`
  waits for an element's inline style or text to change, for a pan or zoom.
- `feedback`: optional, as above.

`ready` and `feedback` can be functions, evaluated after `reset`, for
conditions that depend on the current state. A condition that already holds
before the input throws, so a sample cannot pass by measuring nothing.
