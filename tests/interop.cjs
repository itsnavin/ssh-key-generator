'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');

function withPrivateFile(privateKey, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssh-studio-test-'));
  const file = path.join(dir, 'ephemeral');
  try {
    fs.writeFileSync(file, privateKey, { mode: 0o600 });
    if (process.platform === 'win32') {
      const user = execFileSync('whoami', { encoding: 'utf8' }).trim();
      execFileSync('icacls', [file, '/inheritance:r', '/grant:r', `${user}:(F)`], { stdio: 'pipe' });
    }
    return run(file);
  } finally {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
}

function verifyInterop(key) {
  withPrivateFile(key.privateKey, file => {
    const derived = execFileSync('ssh-keygen', ['-y', '-P', '', '-f', file], { encoding: 'utf8' }).trim();
    assert.deepEqual(derived.split(' ').slice(0, 2), key.publicKey.trim().split(' ').slice(0, 2));
    const fingerprint = execFileSync('ssh-keygen', ['-lf', file, '-E', 'sha256'], { encoding: 'utf8' });
    assert.equal(fingerprint.split(' ')[1], key.fingerprint);
    const expectedBits = key.algorithm === 'ed25519' ? '256' : key.algorithm.slice(3);
    assert.equal(fingerprint.split(' ')[0], expectedBits);
  });
}
module.exports = { verifyInterop };
