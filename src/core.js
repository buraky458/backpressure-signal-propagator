/**
 * Core implementation of the backpressure-signal-propagator.
 *
 * A BackpressurePropagator exposes the subset of stream-internal state that a
 * readable stream uses to decide whether to pause: the size of its internal
 * buffer and a highWaterMark threshold. An observer (typically the upstream
 * producer) subscribes to be notified whenever the saturation level changes.
 *
 * The propagator is intentionally transport-agnostic. It does NOT wrap a
 * Node stream object directly, because coupling to a specific stream type
 * (Readable, ReadableState, web ReadableStream, etc.) forces an interpretation
 * of that type's internals that is brittle across Node versions. Instead, the
 * producer-side code (a readable stream adapter) feeds current buffer length
 * into `updateBufferSize`, and the consumer side subscribes via `onPressure`.
 * This is the single explicit decision: we propagate a number and a boolean,
 * not a stream reference.
 */

/**
 * Pressure snapshot handed to subscribers on every state change.
 *
 * @typedef {Object} PressureState
 * @property {number} bufferSize   Current number of buffered items (>= 0).
 * @property {number} highWaterMark Threshold above which the consumer is saturated (>= 0).
 * @property {boolean} saturated     True when bufferSize >= highWaterMark.
 */

/**
 * Callback invoked when pressure state changes.
 *
 * @callback PressureCallback
 * @param {PressureState} state
 * @returns {void}
 */

export class BackpressurePropagator {
  /**
   * @param {Object} [options]
   * @param {number} [options.highWaterMark=16] Threshold at which the consumer is considered saturated.
   * @param {number} [options.minBufferSize=0]  Minimum value bufferSize will be clamped to (>= 0).
   */
  constructor(options = {}) {
    const { highWaterMark = 16, minBufferSize = 0 } = options;

    if (typeof highWaterMark !== 'number' || !Number.isFinite(highWaterMark) || highWaterMark < 0) {
      throw new TypeError('highWaterMark must be a non-negative finite number');
    }
    if (typeof minBufferSize !== 'number' || !Number.isFinite(minBufferSize) || minBufferSize < 0) {
      throw new TypeError('minBufferSize must be a non-negative finite number');
    }

    this._highWaterMark = highWaterMark;
    this._minBufferSize = minBufferSize;
    this._bufferSize = minBufferSize;
    this._saturated = minBufferSize >= highWaterMark;
    this._subscribers = new Set();
    this._active = true;
  }

  /**
   * Current highWaterMark. Read-only from the outside.
   * @returns {number}
   */
  get highWaterMark() {
    return this._highWaterMark;
  }

  /**
   * Current buffer size (clamped, so always >= minBufferSize).
   * @returns {number}
   */
  get bufferSize() {
    return this._bufferSize;
  }

  /**
   * Whether the consumer is currently saturated (bufferSize >= highWaterMark).
   * @returns {boolean}
   */
  get saturated() {
    return this._saturated;
  }

  /**
   * Updates the tracked buffer size and notifies subscribers if the
   * saturation state changed.
   *
   * Non-finite or sub-minBufferSize values are clamped to minBufferSize.
   *
   * @param {number} size
   * @returns {void}
   */
  updateBufferSize(size) {
    if (!this._active) {
      return;
    }

    let next;
    if (typeof size !== 'number' || !Number.isFinite(size)) {
      next = this._minBufferSize;
    } else {
      next = Math.max(this._minBufferSize, size);
    }

    if (next === this._bufferSize) {
      return;
    }

    this._bufferSize = next;
    const nowSaturated = next >= this._highWaterMark;

    if (nowSaturated !== this._saturated) {
      this._saturated = nowSaturated;
      this._notify();
    }
  }

  /**
   * Updates the highWaterMark threshold and notifies subscribers if the
   * saturation state changed as a result.
   *
   * @param {number} mark
   * @returns {void}
   */
  setHighWaterMark(mark) {
    if (!this._active) {
      return;
    }
    if (typeof mark !== 'number' || !Number.isFinite(mark) || mark < 0) {
      throw new TypeError('highWaterMark must be a non-negative finite number');
    }

    if (mark === this._highWaterMark) {
      return;
    }

    this._highWaterMark = mark;
    const nowSaturated = this._bufferSize >= mark;

    if (nowSaturated !== this._saturated) {
      this._saturated = nowSaturated;
      this._notify();
    }
  }

  /**
   * Registers a subscriber that will be called whenever the saturation state
   * changes. Returns an unsubscribe function.
   *
   * @param {PressureCallback} fn
   * @returns {() => void}
   */
  onPressure(fn) {
    if (!this._active) {
      return () => {};
    }
    this._subscribers.add(fn);
    return () => {
      this._subscribers.delete(fn);
    };
  }

  /**
   * Removes a previously-registered subscriber. Idempotent: unsubscribing a
   * callback that was never registered, or already removed, is a no-op.
   *
   * @param {PressureCallback} fn
   * @returns {void}
   */
  off(fn) {
    this._subscribers.delete(fn);
  }

  /**
   * Builds and dispatches a snapshot to every subscriber.
   */
  _notify() {
    const snapshot = {
      bufferSize: this._bufferSize,
      highWaterMark: this._highWaterMark,
      saturated: this._saturated,
    };
    for (const fn of this._subscribers) {
      fn(snapshot);
    }
  }

  /**
   * Tears down the propagator: clears subscribers and marks it inactive.
   * Subsequent calls to updateBufferSize / onPressure are no-ops.
   */
  destroy() {
    if (!this._active) {
      return;
    }
    this._active = false;
    this._subscribers.clear();
  }
}
