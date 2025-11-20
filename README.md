# @vensst/vite-plugin-ssh-deploy

A Vite plugin for **automated remote deployment**, with:

- 🔐 SSH upload
- 🗂 Automatic backup
- ♻️ Automatic rollback on failure
- 🔁 Optional nginx reload
- 🚀 Zero-config usage

---

## 📦 Install

```bash
npm i @vensst/vite-plugin-ssh-deploy -D
```

---

## ⚙️ Usage

### Vite config  plugin

```js
// vite.config.js
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

```

### Standalone deploy script

```js
// deploy.js
//  package.json has "type": "module"
import {deploy} from '@vensst/vite-plugin-ssh-deploy'
// package.json without "type": "module"
// const {deploy} = require('@vensst/vite-plugin-ssh-deploy')

deploy({
  host: '主机地址',
  username: 'root',
  password: '密码',
  localPath: '本地打包目录，如：dist',
  remotePath: '远程目录，如：/www/web/myApp',
  backupKeep: 3,
})

```

```text
// package.json
{
  "scripts": {
    "deploy": "node deploy.js"
  }
}
```

---

## 🔧 Options

| Field         | Type    | Required | Description                                      |
|---------------|---------|----------|--------------------------------------------------|
| host          | string  | ✔        | SSH server host                                  |
| port          | number  | ✖        | SSH server port. Default: `22`                   |
| username      | string  | ✔        | SSH username                                     |
| password      | string  | ✔        | SSH password                                     |
| remotePath    | string  | ✔        | Target deploy directory                          |
| localPath     | string  | ✖        | Default: `dist`                                  |
| backupKeep    | number  | ✖        | Keep last N backups                              |
| buildCommand  | string  | ✖        | Optional build command. Default: `npm run build` |
| isReloadNginx | boolean | ✖        | Reload nginx on deploy. Default: `false`         |

---

## 📁 Auto Backup & Rollback

The plugin:

- Backs up the previous version automatically
- Cleans old backups
- Rolls back automatically if upload or nginx reload fails

---

## 📜 License

MIT
