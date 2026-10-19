'use strict';

const sshpk = require('sshpk');
const { Buffer } = require('buffer');

function validateComment(comment) {
  if (typeof comment !== 'string' || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u.test(comment) ||
      Buffer.byteLength(comment, 'utf8') > 256) {
    throw new Error('Key comment must be a single line, at most 256 UTF-8 bytes, without control characters.');
  }
  return comment;
}

function validateConfig({ alias, hostname, username, port, identity }) {
  if (typeof alias !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(alias)) {
    throw new Error('Alias: use 1-64 letters, numbers, underscores or hyphens; start with a letter or number.');
  }
  if (typeof hostname !== 'string' || hostname.length > 253) {
    throw new Error('Hostname must be a DNS name, IPv4 address or bare IPv6 address.');
  }
  let validHost = false;
  if (/^[0-9a-fA-F:]+$/.test(hostname) && hostname.includes(':')) {
    try {
      validHost = new URL(`http://[${hostname}]/`).hostname.startsWith('[');
    } catch {
      validHost = false;
    }
  } else {
    validHost = hostname.split('.').every(label =>
      /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
    if (/^[0-9.]+$/.test(hostname)) {
      validHost = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname) &&
        hostname.split('.').every(part => Number(part) <= 255);
    }
  }
  if (!validHost) throw new Error('Hostname must be a DNS name, IPv4 address or bare IPv6 address, without a URL or port.');
  if (typeof username !== 'string' || !/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(username)) {
    throw new Error('Username: use 1-64 letters, numbers, underscores, dots or hyphens; start with a letter or underscore.');
  }
  if (typeof port !== 'string' || !/^[0-9]{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error('Port must be a whole number from 1 to 65535.');
  }
  if (typeof identity !== 'string' || identity.length > 240 ||
      !/^(?:~\/|\/|[A-Za-z]:\/)[A-Za-z0-9_./ -]+$/.test(identity) ||
      identity.endsWith('/') || identity.trim() !== identity) {
    throw new Error('Identity path: use ~/path, /absolute/path or C:/path (forward slashes), up to 240 characters. Only letters, numbers, spaces, dots, underscores and hyphens are supported.');
  }
  return { alias, hostname, username, port: String(Number(port)), identity };
}

function makeConfig(input) {
  const c = validateConfig(input);
  return `Host ${c.alias}\n    HostName ${c.hostname}\n    User ${c.username}\n    Port ${c.port}\n    IdentityFile "${c.identity}"\n    IdentitiesOnly yes\n`;
}

async function generateKey(algorithm, comment, cryptoApi = globalThis.crypto) {
  validateComment(comment);
  if (!['ed25519', 'rsa3072', 'rsa4096'].includes(algorithm)) throw new Error('Choose Ed25519, RSA 3072 or RSA 4096.');
  if (!cryptoApi?.subtle || !cryptoApi.getRandomValues) {
    throw new Error('WebCrypto is unavailable. Open this app over HTTPS or localhost, or use local ssh-keygen.');
  }
  const params = algorithm === 'ed25519' ? { name: 'Ed25519' } : {
    name: 'RSASSA-PKCS1-v1_5', modulusLength: Number(algorithm.slice(3)),
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256'
  };
  let pair;
  try {
    pair = await cryptoApi.subtle.generateKey(params, true, ['sign', 'verify']);
  } catch {
    throw new Error(`${algorithm === 'ed25519' ? 'Ed25519' : 'RSA'} generation failed or is unsupported in this browser. No fallback was used. Try an updated browser, explicitly select another algorithm, or run ssh-keygen -t ed25519 locally.`);
  }
  const der = Buffer.from(await cryptoApi.subtle.exportKey('pkcs8', pair.privateKey));
  let key;
  try {
    const pem = '-----BEGIN PRIVATE KEY-----\n' +
      der.toString('base64').match(/.{1,64}/g).join('\n') +
      '\n-----END PRIVATE KEY-----\n';
    key = sshpk.parsePrivateKey(pem, 'pkcs8');
    key.comment = comment;
    const publicKey = key.toPublic();
    publicKey.comment = comment;
    const digest = await cryptoApi.subtle.digest('SHA-256', publicKey.toBuffer('rfc4253'));
    return {
      publicKey: publicKey.toString('ssh') + '\n',
      privateKey: key.toString('openssh'),
      fingerprint: 'SHA256:' + Buffer.from(digest).toString('base64').replace(/=+$/, ''),
      filename: algorithm === 'ed25519' ? 'id_ed25519' : 'id_rsa',
      algorithm
    };
  } finally {
    der.fill(0);
    if (key) key.parts.forEach(part => part.data.fill(0));
  }
}

module.exports = { validateComment, validateConfig, makeConfig, generateKey };
