# Control executor

`ControlExecutor::prepare` lowers a loaded plan into a topologically ordered
register program for one domain. It owns the instructions, registers and cleared
state blocks. The host transfers this unique owner to one render or audio thread
and destroys it after execution stops. No plan references survive preparation.
`registerControlOperations` adds the built-in names to the loader's registry.
Preparation also checks arity, vector width, literal count and state version.

`tick` and `reset` neither allocate nor parse JSON. Registers contain one to four
double lanes. Arithmetic broadcasts scalar inputs. Two non-scalar inputs must
have the same width. Comparisons produce numeric booleans, zero or one. Packed
vectors and colors use the same lane representation.

## Operation contracts

Input numbers below are ordered register inputs. `values` is empty unless the
table specifies literals. All stateful operations use `stateVersion: 1`.

| Analytic name | Inputs and behavior |
|---|---|
| `constant` | No inputs. One to four literal lanes |
| `time.seconds`, `time.beats`, `time.dt`, `time.frame` | No inputs. Read the tick context |
| `output.width`, `output.height` | No inputs. Read output dimensions |
| `add`, `subtract`, `multiply`, `divide` | Two inputs. Division by zero returns zero |
| `min`, `max`, `less`, `equal`, `pow` | Two inputs, lane-wise |
| `tanh` | One input, lane-wise |
| `remap` | Value, input minimum, input maximum, output minimum, output maximum. A zero input range returns the output minimum. No clamping |
| `vec2`, `vec3`, `vec4` | Two, three or four scalar inputs |
| `sine` | No inputs. Literals are constant frequency in Hz and phase in turns |
| `noise` | No inputs. One nonnegative rate literal. Hashes the integer time bucket, session seed and graph-node identity into `[-1, 1)` |

| Stateful name | Inputs and behavior |
|---|---|
| `damp` | Target and time constant in seconds. Exponential approach from zero. Nonpositive time constants follow the target immediately |
| `envelope` | Gate, attack seconds, release seconds. Linear attack/release between zero and one. Nonpositive durations complete in one quantum |
| `oscillator` | Scalar frequency in Hz. Integrates phase in turns and outputs sine |
| `sample_hold` | Scalar frequency in Hz. Each whole phase crossing advances the seeded noise index. Negative frequency traverses the sequence backward |
| `integrator` | Integrates its input using seconds |
| `counter` | Scalar trigger and reset. Counts rising trigger edges, with reset taking precedence |

## Stream time and state

The host supplies seconds, beats, consumer `dt`, consumer frame index, output
dimensions and beats per second. Within a catch-up interval, tempo and external
inputs are assumed constant. Event-timestamped changes and cross-domain signal
history belong to WP13 and WP22.

Following RT-D12 and RT-D15, state advances for every complete 128-sample quantum
at the session sample rate. Intermediate evaluations use the quantum's end time,
quantum duration and quantum index. Analytic values are evaluated again at the
consumer's context after stepping. This final evaluation preserves stateful
outputs. A repeated time cannot advance state twice. Backward or non-finite
times are rejected without mutation. `reset` clears state and clock position
before a new stream begins. Time-to-step conversion accepts at most `2^53 - 1`
steps and allows one floating-point ULP at a quantum boundary.

Only state and its transitive inputs run during intermediate quantum steps.
Independent analytic operations run once at the consumer tick. Programs without
state perform no quantum catch-up. The tick result reports executed instruction
count alongside state-step and skipped-step counts.

Render catch-up executes at most 0.25 seconds of quanta. It discards the oldest
missed quanta, executes the remaining recent ones and returns both counts
(RT-R12). Audio ticks with state may advance at most one quantum. A larger gap is rejected,
so the audio thread cannot enter an unbounded catch-up loop. Offline audio
drivers must tick every quantum. Seeking requires reset and replay.

## Project math and qualification

`src/math.cpp` supplies sine, exponential, power, hyperbolic tangent and seeded
noise to both domains. It uses range reduction and fixed polynomial/series
evaluation, with IEEE double bit decomposition for power-of-two scaling and
logarithms. It calls no platform transcendental function. The build disables
fast-math and FMA contraction (RT-N6). This source can also be built for Wasm,
but native/Wasm byte parity remains unqualified until the comparison fixtures
run there.

The math functions have explicit limits:

- Sine accepts finite radians through magnitude `2^30`. Larger arguments return
  NaN. Oscillators reduce their phase to one turn before calling it. Phase
  arguments that are non-finite or have magnitude at least `2^52` return zero because double precision
  cannot preserve their fractional turn.
- Exponential clears results below an input of -700 and returns infinity above
  700. Power uses the same exponential range. Negative bases require an integer
  exponent with magnitude at most `2^53`. Invalid powers return NaN.
- Hyperbolic tangent saturates beyond magnitude 20. Decaying control state is
  explicitly cleared below magnitude `1e-30` to avoid depending on host
  flush-to-zero settings. Non-finite arithmetic is not a qualified fixture and
  will require the WP07 sink checks before device output.

The tests compare the project functions with reference math on a fixed grid:
sine and exponential across `[-100, 100]`, exponential at the range edges,
hyperbolic tangent across `[-100, 100]`, and positive/negative power cases.
These are numerical regression checks, not a proof of correct rounding over
every double input.

`realtime-control` tests operation contracts, domain isolation, invalid plans,
a 10,000-operation chain and cycle, and exact damper equality at matching stream
times across 60 Hz, 120 Hz and quantum ticks at both sample rates. The ordinary
build reuses the native C++ allocation counter with its positive control.
Sanitizer builds omit that allocator hook and require the separate ordinary
run for allocation evidence, as the M0 tests do.
