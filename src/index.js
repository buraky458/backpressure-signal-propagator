/**
 * backpressure-signal-propagator
 *
 * Re-exports the public API surface of the library. Keeping the entry point
 * thin lets consumers do `import { BackpressurePropagator } from ...` while
 * the implementation lives in core.js, which is easier to test in isolation.
 */
export { BackpressurePropagator } from './core.js';
