# SSH Key Studio

A static, browser-local SSH key generator and validated SSH client configuration helper.

**Live app:** https://itsnavin.github.io/ssh-key-generator/

## What it does

- Generates real Ed25519 (default) or RSA 3072/4096 keys with WebCrypto, using the browser's cryptographically secure randomness. Unsupported algorithms fail visibly, without silently switching algorithms. HTTPS or localhost is required.
- Exports OpenSSH public keys and **unencrypted `OPENSSH PRIVATE KEY` files**, using the established [sshpk](https://github.com/TritonDataCenter/node-sshpk) serializer. PKCS#8 is an intermediate representation, never mislabeled as an OpenSSH export.
- Computes `SHA256:` fingerprints from the SSH public wire blob, without base64 padding, matching `ssh-keygen -lf`.
- Allows a public key comment and configuration of connection alias, server hostname/IP, existing username, port and local IdentityFile path. Includes `IdentitiesOnly yes`.
- Copies/downloads public keys and config snippets. Private keys are always hidden and can only be downloaded after acknowledging an unencrypted-export warning.

There is **no passphrase field or browser encryption claim**. To protect a downloaded key, restrict its file permissions and run `ssh-keygen -p -f <your-private-key-path>` locally. No encrypted OpenSSH roundtrip is claimed or tested because encrypted export is not offered.

Ed25519 is compact and modern. RSA 3072 offers approximately 128-bit classical security; RSA 4096 is larger and slower. `ssh-rsa` denotes the RSA public-key format, not a requirement to use deprecated RSA/SHA-1 signatures. Modern OpenSSH negotiates RSA SHA-2 signatures. No legacy algorithms or weak fallbacks are enabled.

## Security and trust

Private-key data is kept in page memory only, until deliberate download or reset. There is no local/session storage, IndexedDB, account, analytics, telemetry, service worker, API, CDN or third-party runtime script. Static assets load from the same origin. Generated key material never enters request bodies, URLs, history, logs or saved application state. User-entered fields disable autocomplete; browser/extension behavior remains outside the app's control.

A restrictive meta CSP blocks network connections, workers, external code, inline scripts and forms. The application uses no `eval` or inline event handlers. Only WebCrypto performs key generation. sshpk performs parsing/encoding and uses established library operations where needed, including Ed25519 public-key derivation. Its browser crypto adapter exposes only the established `randombytes` library, using `crypto.getRandomValues` for OpenSSH check integers and throwing if unavailable. The unused crypto-browserify signing/encryption stack is not bundled; no custom cryptographic primitive is implemented.

**You must trust the origin, its scripts and dependency supply chain, your browser, extensions and device.** CSP does not defend against a compromised origin/browser/extension. A downloaded static app can be inspected and hosted locally, but local OpenSSH is safer for sensitive production use. This is not a hardware-backed key, audited security product, or guarantee of actual server login.

Reset clears key references, public output and acknowledgement, and revokes generated Blob URLs. Replacement/reset warns when a private-key download has not been requested. Downloads are deliberate; browsers do not let the app verify that you retained a downloaded file. Closing/leaving the page warns about unexported keys; pagehide clears keys, including when restored from browser back/forward cache. Cancellation discards stale asynchronous results; WebCrypto itself cannot be interrupted. JavaScript GC, retained engine buffers, OS swap, browser downloads and disk files cannot be securely erased by this page.

## First login

1. Download both keys. Move the private key and `.pub` file to your machine's SSH directory. The IdentityFile setting refers to that local destination, **not** the browser's download folder. For RSA use `id_rsa`; examples below use Ed25519.
2. On Linux/macOS, run `mkdir -p ~/.ssh`, `chmod 700 ~/.ssh`, and `chmod 600 ~/.ssh/id_ed25519`. Add a passphrase with `ssh-keygen -p -f ~/.ssh/id_ed25519`. On Windows use your user-profile `.ssh` folder and restrict private-file ACLs to your account; chmod is not a substitute for Windows ACLs.
3. With **existing authorized access**, install only the public key: `ssh-copy-id -i ~/.ssh/id_ed25519.pub -p 22 deploy@server.example.com`. Replace the port/user/host. For IPv6, follow your SSH client's destination syntax. If ssh-copy-id is unavailable, use your provider's key installer or append the public line to the remote user's `~/.ssh/authorized_keys` through an authenticated session. On Unix the remote directory/file should be owned by that user, modes 700/600 respectively. Never send the private key to the server or upload it to this app.
4. Review and **append**, rather than overwrite, the snippet in local `~/.ssh/config`. Earlier matching entries can take precedence. On Unix use `chmod 600 ~/.ssh/config`. Connect with `ssh my-server` (your alias).
5. Verify the **server host-key fingerprint** with your administrator/provider. It is distinct from your generated user-key fingerprint. Keep your existing session and password/recovery access until a fresh key-based login works. Do not blindly disable authentication methods.
6. Optionally use ssh-agent: on Linux/macOS, `eval "$(ssh-agent -s)"` when needed and `ssh-add ~/.ssh/id_ed25519`. On Windows use your configured OpenSSH Authentication Agent. Remove unlocked identities when no longer needed.

The app makes no server connections and runs no server commands. Config generation cannot create remote users or passwords and does not disable host-key verification.

### Configuration validation

Aliases are 1-64 ASCII letters/digits/underscores/hyphens, starting alphanumeric. Usernames are 1-64 ASCII letters/digits/underscores/dots/hyphens, starting with a letter or underscore. Hosts accept valid DNS labels, IPv4, or bare IPv6 (no URL, zone ID or embedded port). Ports are 1-65535. Identity paths are explicitly quoted, up to 240 characters, and must start with `~/`, `/`, or a drive prefix such as `C:/`. Only ASCII letters/digits/spaces/dots/underscores/hyphens and path separators are accepted in the remainder. Use forward slashes on Windows. Quotes, control characters, config wildcards, `%` tokens, `$` environment expansion and other metacharacters are rejected rather than escaped. This deliberately supports a safe subset of SSH syntax. Comments are one line, up to 256 UTF-8 bytes, with no control characters.

## Development and local hosting

Requires Node.js 24+, npm, and OpenSSH `ssh-keygen` on PATH for interoperability tests.

```text
npm ci
npm test
npm run build
npx playwright install chromium
npm run test:browser
npm start
```

Open http://127.0.0.1:4173. On Windows use `npm.cmd` / `npx.cmd` if PowerShell's script policy prevents the `.ps1` launchers. The preview binds only to loopback. For deployment, serve **only `dist/`**, not the repository or node_modules, over HTTPS. Keep the CSP and no-referrer meta policy. If your host supports headers, also set `Content-Security-Policy: frame-ancestors 'none'` (not supported in a meta policy), `X-Content-Type-Options: nosniff` and an appropriate HSTS policy for your domain.

The production dependencies are pinned sshpk 1.18.0, Buffer 6.0.3 and randombytes 2.1.0; `package-lock.json` pins the transitive graph. Browserify bundles dependencies locally. Playwright is test-only. Dependency review and updates remain necessary; an established library is not a claim that this application has undergone an independent cryptographic audit.

## Verification

Node tests generate real ephemeral Ed25519, RSA 3072 and RSA 4096 keys and compare exported pairs, SHA256 fingerprints and sizes with actual `ssh-keygen -y` / `-lf`. They cover byte/field boundaries, directive/token/line injection, safe path quoting and capability errors.

Playwright generates all three algorithms in desktop and mobile Chromium configurations, downloads ephemeral keys, checks them with ssh-keygen, verifies public downloads, private-hidden/acknowledgement/reset behavior, replacement warnings, cancellation/stale results, clipboard errors, unsupported Ed25519, responsive width and form labels. It checks that generation/download/reset cause no network requests, storage writes, URL changes or CSP violations. These are regression tests of app behavior, not proof against compromised clients or all browser vendors. Real keys are never committed; ephemeral files are removed in finally blocks. Browser traces, screenshots, videos and test-artifact uploads are disabled to avoid accidentally publishing secrets.

These checks demonstrate parsing and key-pair compatibility, **not an actual server login**, hardware security, or correctness of a user's server configuration.

## Publishing

The public repository is https://github.com/itsnavin/ssh-key-generator. GitHub Pages uses the **GitHub Actions** source. `.github/workflows/pages.yml` installs the locked graph, audits production dependencies, runs Node tests, builds, and runs desktop/mobile browser checks before uploading only `dist/` and deploying on `main`. Pull requests run verification without deploying. No test/download artifacts are uploaded.

To publish a reviewed update, push to `main` and inspect the “Verify and publish” workflow and the live URL. For a first deployment, a repository administrator must enable Pages with Actions as its build source. Deployment needs `pages: write` and `id-token: write`; the verification job has read-only repository permissions.

## References

- [OpenSSH ssh-keygen manual](https://man.openbsd.org/ssh-keygen): key generation, fingerprints, passphrase changes.
- [OpenSSH ssh_config manual](https://man.openbsd.org/ssh_config): IdentityFile, IdentitiesOnly, quoting and tokens.
- [OpenSSH private-key format](https://github.com/openssh/openssh-portable/blob/master/PROTOCOL.key).
- [sshpk source and OpenSSH serializer](https://github.com/TritonDataCenter/node-sshpk/blob/master/lib/formats/ssh-private.js).
- [WebCrypto specification](https://www.w3.org/TR/WebCryptoAPI/).
