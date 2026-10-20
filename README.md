# backpressure-signal-propagator

Propagates consumer saturation upstream by exposing a readable stream's buffer pressure as a subscribable signal.

## Usage

```js
import { BackpressurePropagator } from 'backpressure-signal-propagator';

const bp = new BackpressurePropagator({ highWaterMark: 16 });

// Producer side: call this whenever the readable's internal buffer changes.
bp.updateBufferSize(8);

// Consumer / upstream side: get notified on saturation transitions.
const unsubscribe = bp.onPressure((state) => {
  if (state.saturated) {
    // pause production
  } else {
    // resume production
  }
});

// When the stream is done:
bp.destroy();
```

## Why

In a pipeline where a fast producer feeds a slow consumer through a readable stream, the only reliable way to avoid unbounded memory growth is to carry the consumer's saturation signal back upstream. Node's built-in streams expose `paused` and the buffer length, but plumbing that signal to a producer that is not itself a Node stream is left to the application. This library is that plumbing.

The deliberate trade-off: the propagator is transport-agnostic. It does not wrap a stream object; it only tracks a number (buffer size) and a threshold (highWaterMark). A stream adapter feeds the number in; whoever needs the signal subscribes. This avoids coupling to the private internals of `ReadableState`, which shift between Node versions, at the cost of requiring the caller to wire the buffer size themselves.

## Edge case

Saturation is defined as `bufferSize >= highWaterMark`. When `highWaterMark` is `0`, the consumer is always saturated — there is no non-saturated state. This is intentional: a zero-capacity consumer can never accept more data, so "always saturated" is the honest signal. Do not set `highWaterMark` to `0` expecting a one-shot drain; use `destroy()` instead.
