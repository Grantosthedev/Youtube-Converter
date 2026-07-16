const esbuild = require('esbuild');
const path = require('path');

esbuild.buildSync({
  entryPoints: [path.join(__dirname, '../src/sentry-renderer-init.js')],
  bundle: true,
  format: 'iife',
  globalName: 'SentryRenderer',
  platform: 'browser',
  outfile: path.join(__dirname, '../src/renderer/sentry-renderer.js'),
  logLevel: 'info',
});
