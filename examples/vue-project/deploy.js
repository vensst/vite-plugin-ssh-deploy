import { deploy } from '@vensst/vite-plugin-ssh-deploy'

deploy({
  host: '主机地址',
  username: 'root',
  password: '密码',
  localPath: '本地打包目录，如：dist',
  remotePath: '远程目录，如：/www/web/myApp',
  backupKeep: 3,
})
