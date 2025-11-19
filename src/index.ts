import type {Plugin} from "vite"
import {NodeSSH} from "node-ssh"
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
  isReloadNginx?: boolean
  backupKeep?: number
}

function validateConfig(cfg: DeployConfig) {
  const required = ["host", "username", "remotePath"]
  required.forEach((key) => {
    if (!cfg[key as keyof DeployConfig])
      throw new Error(`缺少必要字段：${key}`)
  })
  if (!cfg.localPath)
    console.warn("⚠️ 未设置 localPath，默认使用: dist")
}

/**
 * 核心部署逻辑（唯一实现）
 */
async function runDeployCore(
  config: DeployConfig,
  options: {
    shouldBuild: boolean  // deploy: true, vite plugin: false
    ssh: NodeSSH          // 外部传入保持连接可控
  }
) {
  validateConfig(config)

  const ssh = options.ssh

  const localDir = config.localPath || "dist"
  const remoteDir = config.remotePath.replace(/\/$/, "")

  const timestamp = new Date()
    .toISOString()
    .replace(/[-T:\.Z]/g, "")
    .slice(0, 14)

  const backupDir = `${remoteDir}_backup_${timestamp}`
  const BASE_STEPS = 5;
  const steps = BASE_STEPS - (!config.isReloadNginx ? 1 : 0) - (!options.shouldBuild ? 1 : 0)
  let step = 0

  let backupCreated = false

  try {
    // 1️⃣ 本地构建（仅 deploy() 用）
    if (options.shouldBuild) {
      step += 1
      console.log(`🚧 [${step}/${steps}] 本地构建项目 (${localDir})...`)
      execSync(config.buildCommand || "npm run build", {stdio: "inherit"})
    }

    // 连接服务器
    step += 1
    console.log(`🔗 [${step}/${steps}] 连接服务器: ${config.host}...`)
    await ssh.connect({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      privateKey: config.privateKey,
    })

    // 检查远程目录是否存在并备份
    step += 1
    console.log(`🗂 [${step}/${steps}] 检查远程部署目录是否存在...`)
    const check = await ssh.execCommand(
      `if [ -d ${remoteDir} ]; then echo "yes"; fi;`
    )
    const exists = check.stdout.trim() === "yes"

    if (exists) {
      console.log(`📦 发现旧版本，备份到：${backupDir}`)
      await ssh.execCommand(`mv ${remoteDir} ${backupDir}`)
      backupCreated = true

      // 清理备份
      if (config.backupKeep && Number.isInteger(config.backupKeep) && config.backupKeep > 0) {
        console.log(`🗑 检查多余备份，保留最近 ${config.backupKeep} 个备份...`)
        const listRes = await ssh.execCommand(
          `ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`
        )

        if (listRes.stdout) {
          const backups = listRes.stdout.split("\n")
          const toDelete = backups.slice(config.backupKeep)
          if (toDelete.length > 0) {
            console.log(`🗑️ 删除旧备份：\n${toDelete.join('\n')}`)
            await ssh.execCommand(`rm -rf ${toDelete.join(" ")}`)
          } else {
            console.log(`📁 没有多余备份需要删除`)
          }
        }
      }
    } else {
      console.log("📁 远程不存在旧版本，跳过备份")
    }

    // 创建部署目录
    console.log(`📂 创建远程目录 ${remoteDir}...`)
    await ssh.execCommand(`mkdir -p ${remoteDir}`)

    // 上传
    step += 1
    console.log(`📤 [${step}/${steps}] 上传 ${localDir} → ${remoteDir} ...`)
    await ssh.putDirectory(localDir, remoteDir, {
      recursive: true,
      concurrency: 10,
    })

    // nginx reload
    if (config.isReloadNginx) {
      step += 1
      console.log(`🔁 [${step}/${steps}] 重载 nginx...`)
      const reload = await ssh.execCommand("systemctl reload nginx")
      if (reload.stderr) throw new Error("Nginx reload 出错：" + reload.stderr)
    }

    console.log("🎉 部署成功！")
    if (backupCreated) console.log(`📦 旧版本备份位置：${backupDir}`)

  } catch (err: any) {
    console.error("❌ 部署失败:", err.message || err)

    if (!backupCreated) {
      console.log("⚠️ 无备份可回滚")
      throw err
    }

    // 自动回滚
    try {
      console.log("🔄 自动回滚...")
      const listRes = await ssh.execCommand(
        `ls -1d ${remoteDir}_backup_* 2>/dev/null | sort -r`
      )
      const backups = listRes.stdout ? listRes.stdout.split("\n") : []

      if (backups.length === 0) {
        console.log("⚠️ 没有备份可回滚，请手动处理")
      } else {
        const latest = backups[0]
        console.log(`♻️ 回滚到 ${latest} ...`)
        await ssh.execCommand(`rm -rf ${remoteDir}`)
        await ssh.execCommand(`mv ${latest} ${remoteDir}`)

        if (config.isReloadNginx)
          await ssh.execCommand("systemctl reload nginx")

        console.log("✅ 回滚完成")
      }
    } catch (rollbackErr) {
      console.error("❌ 回滚失败:", rollbackErr)
    }

    throw err
  }
}

/**
 * ① 手动调用 deploy()
 */
export async function deploy(config: DeployConfig) {
  const ssh = new NodeSSH()
  try {
    await runDeployCore(config, {shouldBuild: true, ssh})
  } finally {
    ssh.dispose()
  }
}

/**
 * ② Vite 插件（无需构建，只上传）
 */
export default function viteSshDeploy(config: DeployConfig): Plugin {
  return {
    name: "vite-plugin-ssh-deploy",
    apply: "build",

    async closeBundle() {
      const ssh = new NodeSSH()
      try {
        await runDeployCore(config, {shouldBuild: false, ssh})
      } finally {
        ssh.dispose()
      }
    },
  }
}
