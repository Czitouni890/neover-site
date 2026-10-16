const { randomBytes } = require('node:crypto');
const { create, CappedMap, randomInt } = require('altcha-lib/frameworks/express');
const { deriveKey } = require('altcha-lib/algorithms/sha');

function createAntispam() {
  // Per-process secrets invalidate outstanding challenges on restart, along with the replay store.
  return create({
    hmacSignatureSecret: randomBytes(32).toString('hex'),
    hmacKeySignatureSecret: randomBytes(32).toString('hex'),
    deriveKey,
    store: new CappedMap({ maxSize: 10000 }),
    createChallengeParameters: () => ({
      algorithm: 'SHA-256', cost: 1, counter: randomInt(20000, 50000),
      expiresAt: new Date(Date.now() + 5 * 60000)
    })
  });
}

module.exports = { createAntispam };
