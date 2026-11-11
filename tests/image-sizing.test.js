const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fit1080 } = require('../image-sizing');
test('limits common high resolution landscape images to 1080p', () => {
  assert.deepEqual(fit1080(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(fit1080(8000, 6000), { width: 1440, height: 1080 });
});
test('limits portrait images and does not upscale smaller photos', () => {
  assert.deepEqual(fit1080(2160, 3840), { width: 1080, height: 1920 });
  assert.deepEqual(fit1080(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fit1080(4000, 4000), { width: 1080, height: 1080 });
});
test('rejects invalid dimensions', () => assert.throws(() => fit1080(0, 1080)));
