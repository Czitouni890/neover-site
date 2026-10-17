const { randomBytes } = require('node:crypto');
const { create, randomInt } = require('altcha-lib/frameworks/express');
const { deriveKey } = require('altcha-lib/algorithms/sha');

const TTL_MS = 5 * 60000;

function createReplayStore({ now = Date.now, maxSize = 10000 } = {}) {
  const used = new Map();
  return {
    setIfAbsent(id) {
      const time = now();
      for (const [key, expires] of used) {
        if (expires <= time) used.delete(key);
        else break;
      }
      // Never evict a still-valid proof: fail closed if the store fills up.
      if (used.has(id) || used.size >= maxSize) return false;
      used.set(id, time + TTL_MS);
      return true;
    }
  };
}

function createAntispam() {
  // Secrets and replay state share a lifecycle; a restart invalidates old proofs.
  return create({
    hmacSignatureSecret: randomBytes(32).toString('hex'),
    hmacKeySignatureSecret: randomBytes(32).toString('hex'),
    deriveKey,
    store: createReplayStore(),
    createChallengeParameters: () => ({
      algorithm: 'SHA-256', cost: 1, counter: randomInt(20000, 50000),
      expiresAt: new Date(Date.now() + TTL_MS)
    })
  });
}

module.exports = { createAntispam, createReplayStore };
