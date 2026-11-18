// Uploads ./public_html to the FTP server, overwriting files in place.
//
//   npm run deploy             upload everything
//   npm run deploy -- --dry-run  list what would be uploaded, don't connect
//
// Remote files that no longer exist locally are left alone; nothing on the
// server is deleted (so .htaccess, .well-known, cgi-bin etc. survive).

const fs = require('fs');
const path = require('path');
const globby = require('globby');
const Promise = require('bluebird');
const FTP = require('promise-ftp');

const LOCAL_ROOT = path.join(__dirname, '..', 'public_html');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const dryRun = process.argv.includes('--dry-run');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Missing ${path.relative(process.cwd(), CONFIG_PATH)}. ` +
      'Copy deploy/config_sample.json to deploy/config.json and fill in the FTP credentials.'
    );
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  // `cwd` is the remote directory to upload into; it is not an FTP option.
  const { cwd = 'public_html', ...connection } = config;
  return { remoteRoot: cwd.replace(/\/+$/, ''), connection };
}

function listLocal() {
  // mark: directories come back with a trailing slash
  return globby(['**'], { cwd: LOCAL_ROOT, mark: true, ignore: ['**/.DS_Store'] })
    .then(paths => {
      const dirs = paths.filter(p => p.endsWith('/')).map(p => p.slice(0, -1));
      const files = paths.filter(p => !p.endsWith('/'));
      return { dirs: dirs.sort(), files: files.sort() };
    });
}

function main() {
  const { remoteRoot, connection } = loadConfig();
  const remote = p => path.posix.join(remoteRoot, p);

  return listLocal().then(({ dirs, files }) => {
    console.log(`${dirs.length} directories, ${files.length} files -> ${connection.host}:${remoteRoot}`);

    if (dryRun) {
      dirs.forEach(d => console.log('D:', remote(d)));
      files.forEach(f => console.log('F:', remote(f)));
      return;
    }

    const ftp = new FTP();
    return ftp.connect(connection)
      .then(() => ftp.mkdir(remoteRoot, true))
      // One control connection, so go one command at a time.
      .then(() => Promise.each(dirs, d =>
        ftp.mkdir(remote(d), true).then(() => console.log('D:', remote(d)))))
      .then(() => Promise.each(files, f =>
        ftp.put(path.join(LOCAL_ROOT, f), remote(f)).then(() => console.log('F:', remote(f)))))
      .then(() => ftp.end())
      .then(() => console.log('Deploy complete.'))
      .catch(err => {
        ftp.destroy();
        throw err;
      });
  });
}

Promise.try(main).catch(err => {
  console.error('Deploy failed:', err.message);
  process.exitCode = 1;
});
