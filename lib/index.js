// index.js (ES module)
import {NodeSSH} from 'node-ssh'
import {execSync} from 'child_process'

export default function viteDeployPlugin(options = {}) {
  const ssh = new NodeSSH()

  const config = {
    host: options.host,
    port: options.port || 22,
    username: options.username,
    password: options.password,
    localPath: options.localPath || 'dist',
    remotePath: options.remotePath,
    isReloadNginx: options.isReloadNginx ?? true,
    backupKeep: options.backupKeep || 3,
    buildCommand: options.buildCommand || null
  }

  return {
    name: '@vensst/vite-plugin-ssh-deploy',
    async closeBundle() {
      console.log('🚀 Build finished, starting deployment...')

      if (!config.host || !config.username || !config.remotePath) {
        throw new Error('[vite-plugin-ssh-deploy] Missing required config fields.')
      }

      const localDir = config.localPath
      const remoteDir = config.remotePath.replace(/\/$/, '')
      const timestamp = new Date()
          .toISOString()
          .replace(/[-T:\.Z]/g, '')
          .slice(0, 14)
      const backupDir = `${remoteDir}_backup_${timestamp}`

      let backupCreated = false

      try {
        // optional local build
        if (config.buildCommand) {
          console.log(`🛠️  Local build: ${config.buildCommand}`)
          execSync(config.buildCommand, {stdio: 'inherit'})
        }

        // connect ssh
        console.log(`🔗 Connecting to ${config.host}...`)
        await ssh.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
        })

        // check existing directory
        const check = await ssh.execCommand(`if [ -d ${remoteDir} ]; then echo "yes"; fi;`)
        const exists = check.stdout.trim() === 'yes'

        if (exists) {
          console.log(`📦 Backup existing version → ${backupDir}`)
          await ssh.execCommand(`mv ${remoteDir} ${backupDir}`)
          backupCreated = true

          // cleanup old backups
          const listRes = await ssh.execCommand(`ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`)
          const backups = listRes.stdout ? listRes.stdout.split('\n') : []
          const toDelete = backups.slice(config.backupKeep)

          if (toDelete.length > 0) {
            console.log(`🗑️ Removing old backups:\n${toDelete.join('\n')}`)
            await ssh.execCommand(`rm -rf ${toDelete.join(' ')}`)
          }
        }

        console.log(`📂 Creating directory ${remoteDir}`)
        await ssh.execCommand(`mkdir -p ${remoteDir}`)

        console.log(`📤 Uploading ${localDir} → ${remoteDir}`)
        await ssh.putDirectory(localDir, remoteDir, {
          recursive: true,
          concurrency: 10,
        })

        if (config.isReloadNginx) {
          console.log(`🔁 Reloading nginx...`)
          const reload = await ssh.execCommand('systemctl reload nginx')
          if (reload.stderr) throw new Error(reload.stderr)
        }

        console.log('🎉 Deployment complete!')
        if (backupCreated) console.log(`📦 Backup saved: ${backupDir}`)

      } catch (err) {
        console.error('❌ Deployment failed:', err.message || err)

        if (backupCreated) {
          console.log('🔄 Rolling back...')
          try {
            const listRes = await ssh.execCommand(`ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`)
            const backups = listRes.stdout ? listRes.stdout.split('\n') : []

            if (backups.length > 0) {
              const latestBackup = backups[0]
              console.log(`♻️ Restoring backup ${latestBackup}`)
              await ssh.execCommand(`rm -rf ${remoteDir}`)
              await ssh.execCommand(`mv ${latestBackup} ${remoteDir}`)
              if (config.isReloadNginx) await ssh.execCommand('systemctl reload nginx')
              console.log('✅ Rollback complete!')
            }
          } catch (rollbackErr) {
            console.error('❌ Rollback failed:', rollbackErr)
          }
        }
      } finally {
        ssh.dispose()
      }
    }
  }
}
