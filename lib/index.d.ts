declare module "@vensst/vite-plugin-ssh-deploy" {
  interface DeployOptions {
    host: string
    port?: number
    username: string
    password?: string
    localPath?: string
    remotePath: string
    isReloadNginx?: boolean
    backupKeep?: number
    buildCommand?: string | null
  }

  export default function viteDeployPlugin(
    options: DeployOptions
  ): any
}
