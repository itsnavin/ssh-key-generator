'use strict';
const fs = require('node:fs');
const path = require('node:path');
const browserify = require('browserify');
fs.mkdirSync('dist', { recursive: true });
for (const name of ['index.html', 'styles.css']) fs.copyFileSync(path.join('public', name), path.join('dist', name));
const builtins = { ...require('browserify/lib/builtins'), crypto: require.resolve('../src/browser-crypto.cjs') };
browserify('src/app.cjs', { builtins }).bundle((error, buffer) => {
  if (error) { console.error(error.message); process.exitCode = 1; return; }
  fs.writeFileSync('dist/app.js', buffer);
  fs.writeFileSync('dist/.nojekyll', '');
  console.log('Built static site in dist.');
});
