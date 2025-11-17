import {NodeSSH} from "node-ssh"
import type {Plugin} from "vite"
import {execSync} from "child_process"

export interface DeployConfig {
  host: string
  port?: number
  username: string
  password?: string
  privateKey?: string
  localPath?: string
  remotePath: string
  buildCommand?: string
  reloadNginx?: boolean
  backupKeep?: number
}

export default function viteSshDeploy(config: DeployConfig): Plugin {
  return {
    name: "vite-plugin-ssh-deploy",
    apply: "build",

    async closeBundle() {
      validateConfig(config)

      const ssh = new NodeSSH()

      const localDir = config.localPath || "dist"
      const remoteDir = config.remotePath.replace(/\/$/, "")
      const timestamp = new Date()
        .toISOString()
        .replace(/[-T:\.Z]/g, "")
        .slice(0, 14)

      const backupDir = `${remoteDir}_backup_${timestamp}`
      const steps = config.reloadNginx ? 5 : 4
      let backupCreated = false

      try {
        // 1️⃣ 本地构建
        console.log(`🚧 [1/${steps}] 本地构建项目 (${localDir})...`)
        execSync(config.buildCommand || "npm run build", {stdio: "inherit"})

        // 2️⃣ 连接服务器
        console.log(`🔗 [2/${steps}] 连接服务器: ${config.host}...`)
        await ssh.connect({
          host: config.host,
          port: config.port,
          username: config.username,
          password: config.password,
          privateKey: config.privateKey,
        })

        // 3️⃣ 检查远程目录
        console.log(`🗂️ [3/${steps}] 检查远程目录是否存在...`)
        const check = await ssh.execCommand(
          `if [ -d ${remoteDir} ]; then echo "yes"; fi;`
        )

        const exists = check.stdout.trim() === "yes"

        if (exists) {
          console.log(`📦 发现旧版本，开始备份为：${backupDir}`)
          await ssh.execCommand(`mv ${remoteDir} ${backupDir}`)
          backupCreated = true

          // 清理备份
          if (
            config.backupKeep &&
            Number.isInteger(config.backupKeep) &&
            config.backupKeep > 0
          ) {
            console.log(`🗑️ 检查多余备份，保留最近 ${config.backupKeep} 个...`)
            const listRes = await ssh.execCommand(
              `ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`
            )

            if (listRes.stdout) {
              const backups = listRes.stdout.split("\n")
              const toDelete = backups.slice(config.backupKeep)
              if (toDelete.length > 0) {
                console.log(`🗑️ 删除旧备份：\n${toDelete.join("\n")}`)
                await ssh.execCommand(`rm -rf ${toDelete.join(" ")}`)
              } else {
                console.log("✅ 没有多余备份需要删除")
              }
            }
          }
        } else {
          console.log("📁 远程不存在旧目录，跳过备份")
        }

        // 4️⃣ 创建远程目录
        console.log(`📂 创建远程部署目录 ${remoteDir}...`)
        await ssh.execCommand(`mkdir -p ${remoteDir}`)

        // 5️⃣ 上传
        console.log(`📤 [4/${steps}] 上传 ${localDir} → ${remoteDir} ...`)
        await ssh.putDirectory(localDir, remoteDir, {
          recursive: true,
          concurrency: 10,
        })

        // 6️⃣ 重载 nginx
        if (config.reloadNginx) {
          console.log(`🔁 [5/${steps}] 重载 nginx...`)
          const nginxReload = await ssh.execCommand("systemctl reload nginx")
          if (nginxReload.stderr) {
            throw new Error(`Nginx reload 出错：${nginxReload.stderr}`)
          }
        }

        console.log("🎉 部署成功！")
        if (backupCreated) console.log(`📦 旧版本备份在：${backupDir}`)

      } catch (err: any) {
        console.error("❌ 部署失败:", err.message || err)

        if (backupCreated) {
          console.log("🔄 触发自动回滚到最近备份...")
          try {
            const listRes = await ssh.execCommand(
              `ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`
            )
            const backups = listRes.stdout ? listRes.stdout.split("\n") : []
            if (backups.length > 0) {
              const latestBackup = backups[0]
              console.log(`♻️ 回滚到 ${latestBackup} ...`)
              await ssh.execCommand(`rm -rf ${remoteDir}`)
              await ssh.execCommand(`mv ${latestBackup} ${remoteDir}`)

              if (config.reloadNginx)
                await ssh.execCommand("systemctl reload nginx")

              console.log("✅ 回滚完成")
            } else {
              console.log("⚠️ 没有备份可回滚，请手动处理")
            }
          } catch (rollbackErr) {
            console.error("❌ 自动回滚失败:", rollbackErr)
          }
        } else {
          console.log("⚠️ 未创建备份，无需回滚")
        }
      } finally {
        ssh.dispose()
      }
    },
  }
}

function validateConfig(cfg: DeployConfig) {
  const required = ["host", "username", "remotePath"]
  required.forEach((key) => {
    if (!cfg[key as keyof DeployConfig])
      throw new Error(`deploy.config.js 缺少必要字段：${key}`)
  })
  if (!cfg.localPath)
    console.warn("⚠️ 未设置 localPath，默认使用: dist")
}
