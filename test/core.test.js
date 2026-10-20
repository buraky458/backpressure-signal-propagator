import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { BackpressurePropagator } from '../src/core.js';

describe('BackpressurePropagator', () => {
  describe('constructor', () => {
    it('applies default highWaterMark of 16', () => {
      const p = new BackpressurePropagator();
      assert.equal(p.highWaterMark, 16);
    });

    it('accepts a custom highWaterMark', () => {
      const p = new BackpressurePropagator({ highWaterMark: 4 });
      assert.equal(p.highWaterMark, 4);
    });

    it('throws on non-number highWaterMark', () => {
      assert.throws(() => new BackpressurePropagator({ highWaterMark: 'hi' }), TypeError);
    });

    it('throws on negative highWaterMark', () => {
      assert.throws(() => new BackpressurePropagator({ highWaterMark: -1 }), TypeError);
    });

    it('throws on NaN highWaterMark', () => {
      assert.throws(() => new BackpressurePropagator({ highWaterMark: NaN }), TypeError);
    });

    it('throws on Infinity highWaterMark', () => {
      assert.throws(() => new BackpressurePropagator({ highWaterMark: Infinity }), TypeError);
    });

    it('throws on negative minBufferSize', () => {
      assert.throws(() => new BackpressurePropagator({ minBufferSize: -1 }), TypeError);
    });

    it('throws on Infinity minBufferSize', () => {
      assert.throws(() => new BackpressurePropagator({ minBufferSize: Infinity }), TypeError);
    });

    it('clamps initial bufferSize to minBufferSize', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 5 });
      assert.equal(p.bufferSize, 5);
    });
  });

  describe('initial saturation', () => {
    it('reports unsaturated when minBufferSize < highWaterMark', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 3 });
      assert.equal(p.saturated, false);
    });

    it('reports saturated when minBufferSize >= highWaterMark', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 12 });
      assert.equal(p.saturated, true);
    });
  });

  describe('updateBufferSize', () => {
    it('clamps negative values to minBufferSize', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 2 });
      p.updateBufferSize(-5);
      assert.equal(p.bufferSize, 2);
    });

    it('clamps non-finite values to minBufferSize', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 0 });
      p.updateBufferSize(Infinity);
      assert.equal(p.bufferSize, 0);
      p.updateBufferSize(NaN);
      assert.equal(p.bufferSize, 0);
    });

    it('calls subscribers on transition into saturation', () => {
      const p = new BackpressurePropagator({ highWaterMark: 5 });
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.updateBufferSize(6);
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], { bufferSize: 6, highWaterMark: 5, saturated: true });
    });

    it('does not call subscribers when saturation is unchanged', () => {
      const p = new BackpressurePropagator({ highWaterMark: 5 });
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.updateBufferSize(7); // transition
      assert.equal(calls.length, 1);
      p.updateBufferSize(8); // still saturated, no call
      assert.equal(calls.length, 1);
      p.updateBufferSize(4); // transition out
      assert.equal(calls.length, 2);
      p.updateBufferSize(3); // still unsaturated, no call
      assert.equal(calls.length, 2);
    });

    it('handles zero highWaterMark', () => {
      const p = new BackpressurePropagator({ highWaterMark: 0, minBufferSize: 0 });
      const calls = [];
      p.onPressure(s => calls.push(s));
      // At zero, any positive buffer size is saturated, zero is saturated too.
      assert.equal(p.saturated, true);
      p.updateBufferSize(1);
      // saturated -> saturated, no callback
      assert.equal(calls.length, 0);
      // make it unsaturated by increasing highWaterMark
      p.setHighWaterMark(2);
      assert.equal(p.saturated, false);
      assert.equal(calls.length, 1);
    });

    it('triggers callback exactly at highWaterMark boundary', () => {
      const p = new BackpressurePropagator({ highWaterMark: 4 });
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.updateBufferSize(4);
      assert.equal(p.saturated, true);
      assert.equal(calls.length, 1);
      p.updateBufferSize(3);
      assert.equal(p.saturated, false);
      assert.equal(calls.length, 2);
    });
  });

  describe('setHighWaterMark', () => {
    it('updates and notifies on saturation change', () => {
      const p = new BackpressurePropagator({ highWaterMark: 10, minBufferSize: 0 });
      p.updateBufferSize(5);
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.setHighWaterMark(3);
      assert.equal(p.saturated, true);
      assert.equal(calls.length, 1);
    });

    it('notifies when saturation clears due to higher mark', () => {
      const p = new BackpressurePropagator({ highWaterMark: 2, minBufferSize: 0 });
      p.updateBufferSize(5);
      assert.equal(p.saturated, true);
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.setHighWaterMark(10);
      assert.equal(p.saturated, false);
      assert.equal(calls.length, 1);
    });

    it('throws on invalid value', () => {
      const p = new BackpressurePropagator();
      assert.throws(() => p.setHighWaterMark('x'), TypeError);
      assert.throws(() => p.setHighWaterMark(-1), TypeError);
      assert.throws(() => p.setHighWaterMark(NaN), TypeError);
    });
  });

  describe('onPressure / off', () => {
    it('supports multiple subscribers', () => {
      const p = new BackpressurePropagator({ highWaterMark: 3 });
      const a = [];
      const b = [];
      p.onPressure(s => a.push(s));
      p.onPressure(s => b.push(s));
      p.updateBufferSize(4);
      assert.equal(a.length, 1);
      assert.equal(b.length, 1);
    });

    it('off removes only the specified callback', () => {
      const p = new BackpressurePropagator({ highWaterMark: 3 });
      const a = [];
      const b = [];
      const fa = s => a.push(s);
      const fb = s => b.push(s);
      p.onPressure(fa);
      p.onPressure(fb);
      p.off(fa);
      p.updateBufferSize(4);
      assert.equal(a.length, 0);
      assert.equal(b.length, 1);
    });

    it('off is idempotent', () => {
      const p = new BackpressurePropagator({ highWaterMark: 3 });
      const f = () => {};
      p.onPressure(f);
      p.off(f);
      p.off(f); // no throw
      assert.doesNotThrow(() => p.off(f));
    });

    it('onPressure returns the unsubscribe function', () => {
      const p = new BackpressurePropagator({ highWaterMark: 3 });
      const calls = [];
      const unsub = p.onPressure(s => calls.push(s));
      assert.equal(typeof unsub, 'function');
      p.updateBufferSize(4);
      assert.equal(calls.length, 1);
      unsub();
      p.updateBufferSize(0);
      assert.equal(calls.length, 1);
    });

    it('returns a snapshot object, not internal state', () => {
      const p = new BackpressurePropagator({ highWaterMark: 5 });
      let snap;
      p.onPressure(s => { snap = s; });
      p.updateBufferSize(6);
      assert.equal(snap.bufferSize, 6);
      snap.bufferSize = 999;
      assert.equal(p.bufferSize, 6);
    });
  });

  describe('destroy', () => {
    it('clears subscribers', () => {
      const p = new BackpressurePropagator({ highWaterMark: 2 });
      const calls = [];
      p.onPressure(s => calls.push(s));
      p.destroy();
      p.updateBufferSize(5);
      assert.equal(calls.length, 0);
    });

    it('is idempotent', () => {
      const p = new BackpressurePropagator();
      p.destroy();
      assert.doesNotThrow(() => p.destroy());
    });

    it('onPressure after destroy is a no-op', () => {
      const p = new BackpressurePropagator();
      p.destroy();
      let called = false;
      p.onPressure(() => { called = true; });
      p.updateBufferSize(999);
      assert.equal(called, false);
    });
  });
});
