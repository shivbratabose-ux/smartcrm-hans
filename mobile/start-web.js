// Wrapper that boots Expo's web preview from the repo root.
// `launch.json` runs `node mobile/start-web.js` from the repo root, but the
// Expo CLI looks for `app.json` in process.cwd(). This script chdirs into
// `mobile/` before delegating, so the same launch.json config that works
// for the web preview (Vite at the root) also works for the mobile preview
// (Expo inside mobile/).
const path = require('path');

process.chdir(__dirname);

// Forward exactly what Expo's CLI expects on argv.
const expoCli = path.resolve(__dirname, 'node_modules/expo/bin/cli');
process.argv = [
  process.argv[0],
  expoCli,
  'start',
  '--web',
  '--port', String(process.env.PORT || 5174),
  '--clear',
];

require(expoCli);
