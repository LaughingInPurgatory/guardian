// No paid Apple Developer ID is available, so we can't notarize. Ad-hoc
// signing (identity "-") plus stripping any quarantine bit picked up during
// packaging is the standard best-effort for unsigned distribution — it avoids
// "damaged" launch failures caused by an entirely unsigned bundle. Gatekeeper
// still re-quarantines the file on download; see README for the user-side fix.
'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('xattr', ['-cr', appPath]);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath]);
};
