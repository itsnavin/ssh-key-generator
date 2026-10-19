'use strict';

const { generateKey, validateComment, makeConfig } = require('./core.cjs');
const $ = id => document.getElementById(id);
let current = null;
let exported = false;
let generation = 0;
let busy = false;
const urls = new Set();
const status = (message, error = false) => {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
};
function revokeUrls() {
  urls.forEach(url => URL.revokeObjectURL(url));
  urls.clear();
}
function clearKey() {
  revokeUrls();
  current = null;
  exported = false;
  $('public-key').value = '';
  $('fingerprint').textContent = '';
  $('result').hidden = true;
  $('acknowledge').checked = false;
}
function setBusy(value) {
  busy = value;
  $('generate').disabled = value;
  $('cancel').hidden = !value;
  $('key-form').setAttribute('aria-busy', String(value));
}
function download(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/octet-stream' }));
  urls.add(url);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => { URL.revokeObjectURL(url); urls.delete(url); }, 1000);
}
async function copy(text, label) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('unavailable');
    await navigator.clipboard.writeText(text);
    status(`${label} copied.`);
  } catch {
    status(`Clipboard access failed. Select and copy the ${label.toLowerCase()} manually, or download it.`, true);
  }
}
function mayDiscard() {
  return !current || exported || window.confirm('This private key has not been downloaded. Discard it permanently from this page?');
}

$('key-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  try { validateComment($('comment').value); } catch (error) { status(error.message, true); return; }
  if (!mayDiscard()) return;
  clearKey();
  const token = ++generation;
  const algorithm = $('algorithm').value;
  const comment = $('comment').value;
  setBusy(true);
  status('Generating locally with WebCrypto. RSA may take several seconds...');
  try {
    const result = await generateKey(algorithm, comment);
    if (token !== generation) return;
    current = result;
    $('public-key').value = result.publicKey;
    $('fingerprint').textContent = result.fingerprint;
    $('key-label').textContent = `${algorithm === 'ed25519' ? 'Ed25519' : 'RSA ' + algorithm.slice(3)} / ${result.filename}`;
    $('result').hidden = false;
    status('Key pair generated. Private key remains hidden in memory; download it deliberately below.');
  } catch (error) {
    if (token === generation) status(error.message, true);
  } finally {
    if (token === generation) setBusy(false);
  }
});
$('cancel').addEventListener('click', () => {
  ++generation;
  setBusy(false);
  status('Generation cancelled. WebCrypto may finish internally, but its result will be discarded.');
});
$('reset').addEventListener('click', () => {
  if (!mayDiscard()) return;
  ++generation;
  setBusy(false);
  clearKey();
  $('key-form').reset();
  $('config-form').reset();
  updateConfig(false);
  status('Reset: key references and download URLs cleared. Browser memory and downloaded files cannot be securely erased by this page.');
});
$('copy-public').addEventListener('click', () => { if (current) copy(current.publicKey, 'Public key'); });
$('download-public').addEventListener('click', () => {
  if (!current) return;
  download(current.publicKey, current.filename + '.pub');
  status('Public-key download requested. This is the key to install on your server.');
});
$('download-private').addEventListener('click', () => {
  if (!current) return;
  if (!$('acknowledge').checked) { status('Acknowledge the unencrypted private-key warning before downloading.', true); return; }
  download(current.privateKey, current.filename);
  exported = true;
  status('Unencrypted private-key download requested; confirm the file was saved. Move it to your IdentityFile path and protect it locally.');
});
let configText = '';
function updateConfig(announce = true) {
  try {
    configText = makeConfig(Object.fromEntries(new FormData($('config-form'))));
    $('config-output').value = configText;
    $('config-error').textContent = '';
    $('copy-config').disabled = false;
    $('download-config').disabled = false;
    if (announce) $('config-status').textContent = 'Configuration updated locally.';
  } catch (error) {
    configText = '';
    $('config-output').value = '';
    $('config-error').textContent = error.message;
    $('config-status').textContent = '';
    $('copy-config').disabled = true;
    $('download-config').disabled = true;
  }
}
$('config-form').addEventListener('input', () => updateConfig());
$('config-form').addEventListener('submit', event => event.preventDefault());
$('copy-config').addEventListener('click', () => { if (configText) copy(configText, 'SSH configuration'); });
$('download-config').addEventListener('click', () => {
  if (!configText) return;
  download(configText, 'ssh-config-snippet.txt');
  status('Config snippet download requested. Review and append it to ~/.ssh/config; do not overwrite existing entries.');
});
window.addEventListener('beforeunload', event => {
  if (current && !exported) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('pagehide', () => {
  ++generation;
  setBusy(false);
  clearKey();
});
updateConfig(false);
if (!window.isSecureContext || !globalThis.crypto?.subtle) {
  $('generate').disabled = true;
  status('WebCrypto requires HTTPS or localhost. Use a secure origin, or generate locally with ssh-keygen -t ed25519.', true);
}
