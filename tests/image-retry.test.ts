import test from 'node:test';
import assert from 'node:assert/strict';
import {imageFailureCode,retryableImageError} from '../lib/editorial/image-retry';
test('image timeouts remain distinct from content filtering and permanent failures',()=>{
 assert.equal(imageFailureCode(new DOMException('request timed out','TimeoutError')),'IMAGE_TIMEOUT');
 assert.equal(imageFailureCode(new Error('IMAGE_CONTENT_FILTERED')),'IMAGE_CONTENT_FILTERED');
 assert.equal(retryableImageError('IMAGE_TIMEOUT'),true);assert.equal(retryableImageError('IMAGE_HTTP_503'),true);
 assert.equal(retryableImageError('IMAGE_HTTP_429'),true);assert.equal(retryableImageError('IMAGE_CONTENT_FILTERED'),false);
 assert.equal(retryableImageError('IMAGE_BUDGET_EXCEEDED'),false);
});
