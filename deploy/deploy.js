const config = require('./config.json');
const _ = require('lodash');
const globby = require('globby');
const Promise = require('bluebird');
const FTP = require('promise-ftp');
const ftp = new FTP();

function isPathFile(path) {
  return _.last(path.split('/')).includes('.');
}

const fileListingP = globby(['./public_html/**'])
  .then(_.partial(_.partition, _, isPathFile))

function makeRemotePath(path) {
  return _.tail(path).join('');
}

const setupP = ftp.connect(config)
  .then(() => ftp.list('.'))
  .then(list => {
    if (_.find(list, { name: 'public_html' })) {
      console.log('found public_html ... deleting');
      return ftp.rmdir('/public_html', true)
        .then(() => {
          console.log('delete complete. creating...');
          return ftp.mkdir('/public_html')
            .then(() => {
              console.log('creation complete.');
            })
        });
    }
    return ftp.mkdir('/public_html')
      .then(() => {
        console.log('public_html created.');
      })
  });

Promise.all([
  fileListingP,
  setupP
])
  .tap(([[files, directories]]) => {
    return Promise.map(directories, path => {
      return ftp.mkdir(makeRemotePath(path), true)
        .then(() => {
          console.log('D: ', path);
        })
    })
  })
  .tap(([[files, directories]]) => {
    return Promise.map(files, path => {
      return ftp.put(path, makeRemotePath(path))
        .then(() => {
          console.log('F: ', path);
        })
    });
  })
  .finally(ftp.end)
