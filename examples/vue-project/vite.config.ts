import {defineConfig} from 'vite'
import vue from '@vitejs/plugin-vue'
import vitePluginSshDeploy from "@vensst/vite-plugin-ssh-deploy"
const deployConfig = {
  host: '主机地址',
  username: 'root',
  password: '密码',
  localPath: '本地打包目录，如：dist',
  remotePath: '远程目录，如：/www/web/myApp',
  backupKeep: 3,
}
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vitePluginSshDeploy(deployConfig)
  ],
})
