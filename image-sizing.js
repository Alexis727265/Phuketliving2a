'use strict';
function fit1080(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Invalid image dimensions');
  const landscape = width >= height;
  const scale = Math.min(1, (landscape ? 1920 : 1080) / width, (landscape ? 1080 : 1920) / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
if (typeof module !== 'undefined') module.exports = { fit1080 };
