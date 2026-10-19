'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateKey, validateComment, validateConfig, makeConfig } = require('../src/core.cjs');
const { verifyInterop } = require('./interop.cjs');

for (const algorithm of ['ed25519', 'rsa3072', 'rsa4096']) {
  test(`${algorithm}: real WebCrypto keys match ssh-keygen public key, fingerprint and size`, async () => {
    const key = await generateKey(algorithm, 'ephemeral-test');
    assert.ok(key.privateKey.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----\n'));
    assert.ok(key.publicKey.trim().endsWith('ephemeral-test'));
    assert.match(key.fingerprint, /^SHA256:[A-Za-z0-9+/]{43}$/);
    verifyInterop(key);
  });
}
const base = { alias: 'my-server', hostname: 'server.example.com', username: 'deploy', port: '22', identity: '~/.ssh/id_ed25519' };
test('configuration serialization and explicit safe path quoting', () => {
  assert.equal(makeConfig(base), 'Host my-server\n    HostName server.example.com\n    User deploy\n    Port 22\n    IdentityFile "~/.ssh/id_ed25519"\n    IdentitiesOnly yes\n');
  for (const hostname of ['localhost', '192.0.2.1', '2001:db8::1', '::1']) {
    assert.equal(validateConfig({ ...base, hostname }).hostname, hostname);
  }
  for (const identity of ['/home/user/My Keys/id_rsa', 'C:/Users/Example User/.ssh/id_rsa']) {
    assert.ok(makeConfig({ ...base, identity }).includes(`IdentityFile "${identity}"`));
  }
  for (const port of ['1', '65535', '00022']) assert.ok(validateConfig({ ...base, port }));
});
test('reject configuration directive, token, shell and option injections and boundaries', () => {
  const invalid = {
    alias: ['', '-oProxyCommand=x', '*', '!host', 'a b', 'a\nHost *', 'a'.repeat(65)],
    hostname: ['', 'https://example.com', '-host', 'host:22', '256.0.0.1', '1.2.3', 'a..b', 'a'.repeat(64), 'host\nProxyCommand evil', 'host%h', '$(evil)', '[::1]', '::gg'],
    username: ['', '-root', 'a b', 'root\nLocalCommand evil', '%u', '$USER', 'a'.repeat(65)],
    port: ['', '0', '65536', '-1', '22\nHost *', '2.2', '1e2', ' 22'],
    identity: ['', 'relative/path', '~other/.ssh/id', '~/.ssh/id\nProxyCommand evil', '~/.ssh/"x"', '~/.ssh/%h', '~/.ssh/${HOME}', '~/.ssh/`whoami`', '~/.ssh/id\\x', '~/.ssh/id\tkey', '/tmp/', '/a'.repeat(121)]
  };
  for (const [field, values] of Object.entries(invalid)) {
    for (const value of values) assert.throws(() => makeConfig({ ...base, [field]: value }), Error, `${field} input rejected`);
  }
});
test('comments have UTF-8 byte boundaries and cannot add lines', () => {
  assert.equal(validateComment(''), '');
  assert.equal(validateComment('a'.repeat(256)).length, 256);
  assert.equal(validateComment('\u00e9'.repeat(128)).length, 128);
  for (const comment of ['a'.repeat(257), '\u00e9'.repeat(129), 'x\nx', 'x\rx', 'x\0', 'x\u2028x', 'x\u0085x']) {
    assert.throws(() => validateComment(comment));
  }
});
test('unsupported algorithms and browser capabilities fail visibly without fallback', async () => {
  await assert.rejects(generateKey('dsa', ''), /Choose Ed25519/);
  await assert.rejects(generateKey('ed25519', '', {}), /WebCrypto is unavailable/);
  let calls = 0;
  await assert.rejects(generateKey('ed25519', '', {
    getRandomValues() {},
    subtle: { async generateKey() { calls++; throw new Error('unsupported'); } }
  }), /No fallback was used/);
  assert.equal(calls, 1);
});
