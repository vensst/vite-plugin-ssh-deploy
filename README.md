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

```js
import deploy from '@vensst/vite-plugin-ssh-deploy'

export default {
  plugins: [
    deploy({
      host: '1.2.3.4',
      username: 'root',
      password: 'yourpass',
      remotePath: '/www/wwwroot/myapp',
      localPath: 'dist',
      backupKeep: 3,
      isReloadNginx: true
    })
  ]
}
```

---

## 🔧 Options

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| host | string | ✔ | SSH server host |
| username | string | ✔ | SSH username |
| password | string | ✖ | SSH password |
| remotePath | string | ✔ | Target deploy directory |
| localPath | string | ✖ | Default: `dist` |
| backupKeep | number | ✖ | Keep last N backups |
| buildCommand | string | ✖ | Optional build command |
| isReloadNginx | boolean | ✖ | Reload nginx on deploy |

---

## 📁 Auto Backup & Rollback

The plugin:

- Backs up the previous version automatically
- Cleans old backups
- Rolls back automatically if upload or nginx reload fails

---

## 📜 License

MIT
