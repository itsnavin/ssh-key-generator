'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { verifyInterop } = require('../interop.cjs');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.testAudit = { persistence: 0, violations: [], created: 0, revoked: 0 };
    Storage.prototype.setItem = function () { window.testAudit.persistence++; throw new Error('Storage forbidden'); };
    const originalOpen = indexedDB.open.bind(indexedDB);
    indexedDB.open = function (...args) { window.testAudit.persistence++; return originalOpen(...args); };
    const create = URL.createObjectURL.bind(URL);
    const revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { window.testAudit.created++; return create(blob); };
    URL.revokeObjectURL = url => { window.testAudit.revoked++; return revoke(url); };
    document.addEventListener('securitypolicyviolation', event => window.testAudit.violations.push(event.violatedDirective));
  });
  await page.goto('/');
});

for (const algorithm of ['ed25519', 'rsa3072', 'rsa4096']) {
  test(`${algorithm}: browser-generated downloads interoperate with OpenSSH without network or persistence`, async ({ page }) => {
    const requests = [];
    page.on('request', request => requests.push(request.url()));
    await page.locator('#algorithm').selectOption(algorithm);
    await page.locator('#comment').fill('ephemeral-browser-test');
    await page.locator('#generate').click();
    await expect(page.locator('#result')).toBeVisible({ timeout: 60000 });
    expect(await page.evaluate(() => window.testAudit.created)).toBe(0);
    await expect(page.locator('#public-key')).toHaveValue(/^ssh-(ed25519|rsa) /);
    expect(await page.locator('body').textContent()).not.toContain('-----BEGIN OPENSSH PRIVATE KEY-----');
    expect(await page.locator('textarea').evaluateAll(elements =>
      elements.some(element => element.value.includes('-----BEGIN OPENSSH PRIVATE KEY-----')))).toBe(false);
    await page.locator('#download-private').click();
    await expect(page.locator('#status')).toContainText('Acknowledge');
    await page.locator('#acknowledge').check();
    const pending = page.waitForEvent('download');
    await page.locator('#download-private').click();
    const download = await pending;
    expect(download.suggestedFilename()).toBe(algorithm === 'ed25519' ? 'id_ed25519' : 'id_rsa');
    const file = await download.path();
    try {
      verifyInterop({
        privateKey: fs.readFileSync(file, 'utf8'),
        publicKey: await page.locator('#public-key').inputValue(),
        fingerprint: await page.locator('#fingerprint').textContent(),
        algorithm
      });
    } finally { await download.delete(); }
    const publicPending = page.waitForEvent('download');
    await page.locator('#download-public').click();
    const pub = await publicPending;
    expect(pub.suggestedFilename()).toMatch(/\.pub$/);
    expect(fs.readFileSync(await pub.path(), 'utf8')).toBe(await page.locator('#public-key').inputValue());
    await pub.delete();
    await page.locator('#reset').click();
    await expect(page.locator('#result')).toBeHidden();
    await expect(page.locator('#public-key')).toHaveValue('');
    await expect(page.locator('#fingerprint')).toHaveText('');
    const audit = await page.evaluate(() => ({ ...window.testAudit, local: localStorage.length, session: sessionStorage.length, url: location.href }));
    expect(audit.persistence).toBe(0);
    expect(audit.local).toBe(0);
    expect(audit.session).toBe(0);
    expect(audit.violations).toEqual([]);
    expect(audit.created).toBeGreaterThan(0);
    expect(audit.revoked).toBeGreaterThanOrEqual(audit.created);
    expect(audit.url).toBe('http://127.0.0.1:4173/');
    expect(requests).toEqual([]);
  });
}
test('clipboard failure is visible; unexported key replacement and reset need confirmation', async ({ page }) => {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => { throw new Error('denied'); } }, configurable: true });
  });
  await page.locator('#generate').click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#copy-public').click();
  await expect(page.locator('#status')).toContainText('Clipboard access failed');
  const publicKey = await page.locator('#public-key').inputValue();
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#generate').click();
  await expect(page.locator('#public-key')).toHaveValue(publicKey);
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#reset').click();
  await expect(page.locator('#result')).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
  await expect(page.locator('#result')).toBeHidden();
});
test('cancel discards stale output and new generation is independent', async ({ page }) => {
  await page.evaluate(() => {
    const original = crypto.subtle.generateKey.bind(crypto.subtle);
    crypto.subtle.generateKey = async (...args) => {
      const pair = await original(...args);
      await new Promise(resolve => setTimeout(resolve, 1200));
      return pair;
    };
  });
  await page.locator('#generate').click();
  await expect(page.locator('#generate')).toBeDisabled();
  await page.locator('#cancel').click();
  await expect(page.locator('#status')).toContainText('cancelled');
  await page.waitForTimeout(1600);
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#generate').click();
  await expect(page.locator('#result')).toBeVisible();
});
test('unsupported Ed25519 surfaces actionable error, without a downgrade', async ({ page }) => {
  await page.evaluate(() => {
    crypto.subtle.generateKey = async () => { throw new DOMException('unsupported', 'NotSupportedError'); };
  });
  await page.locator('#generate').click();
  await expect(page.locator('#status')).toContainText('No fallback was used');
  await expect(page.locator('#status')).toContainText('ssh-keygen -t ed25519');
  await expect(page.locator('#result')).toBeHidden();
});
test('configuration errors, safe serialization, accessibility labels and responsive layout', async ({ page }) => {
  await page.locator('#alias').fill('bad *');
  await expect(page.locator('#config-error')).toContainText('Alias');
  await expect(page.locator('#copy-config')).toBeDisabled();
  await expect(page.locator('#config-output')).toHaveValue('');
  await page.locator('#alias').fill('production');
  await page.locator('#port').fill('65536');
  await expect(page.locator('#config-error')).toContainText('Port');
  await page.locator('#port').fill('2222');
  await page.locator('#identity').fill('C:/Users/Example User/.ssh/id_rsa');
  await expect(page.locator('#config-output')).toHaveValue(/IdentityFile "C:\/Users\/Example User\/.ssh\/id_rsa"/);
  await expect(page.locator('#config-output')).toHaveValue(/IdentitiesOnly yes/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('input:not([type=checkbox]), select, textarea').evaluateAll(elements =>
    elements.every(element => document.querySelector(`label[for="${element.id}"]`)))).toBe(true);
});
test('only same-origin static assets load', async ({ page }) => {
  const loaded = [];
  page.on('request', request => loaded.push(request.url()));
  await page.reload();
  expect([...new Set(loaded)].sort()).toEqual([
    'http://127.0.0.1:4173/', 'http://127.0.0.1:4173/app.js', 'http://127.0.0.1:4173/styles.css'
  ]);
});
test('public/config clipboard and config download are deliberate', async ({ page }) => {
  await page.evaluate(() => {
    window.copiedPublicData = null;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: async text => { window.copiedPublicData = text; } }, configurable: true
    });
  });
  await page.locator('#copy-config').click();
  expect(await page.evaluate(() => window.copiedPublicData)).toBe(await page.locator('#config-output').inputValue());
  await expect(page.locator('#status')).toContainText('SSH configuration copied');
  const pending = page.waitForEvent('download');
  await page.locator('#download-config').click();
  const download = await pending;
  try {
    expect(download.suggestedFilename()).toBe('ssh-config-snippet.txt');
    expect(fs.readFileSync(await download.path(), 'utf8')).toBe(await page.locator('#config-output').inputValue());
  } finally { await download.delete(); }
  await page.locator('#generate').click();
  await expect(page.locator('#result')).toBeVisible();
  await page.locator('#copy-public').click();
  expect(await page.evaluate(() => window.copiedPublicData)).toBe(await page.locator('#public-key').inputValue());
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#reset').click();
});
test('reset while generation is pending discards output; pagehide clears memory-backed UI', async ({ page }) => {
  await page.evaluate(() => {
    const original = crypto.subtle.generateKey.bind(crypto.subtle);
    crypto.subtle.generateKey = async (...args) => {
      const pair = await original(...args);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return pair;
    };
  });
  await page.locator('#generate').click();
  await page.locator('#reset').click();
  await page.waitForTimeout(1400);
  await expect(page.locator('#result')).toBeHidden();
  await page.locator('#generate').click();
  await expect(page.locator('#result')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await expect(page.locator('#public-key')).toHaveValue('');
  await expect(page.locator('#result')).toBeHidden();
});
