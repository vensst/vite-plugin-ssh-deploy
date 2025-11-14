// index.cjs
const {NodeSSH} = require('node-ssh')
const {execSync} = require('child_process')

module.exports = function viteDeployPlugin(options = {}) {
  return require('./index.js').default(options)
}
