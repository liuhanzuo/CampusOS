# thu-ai-assistant · Docker & CI/CD 指南

本文档面向需要本地跑镜像或参与发版的开发者，介绍：

1. 如何在本机构建和运行 Docker 镜像
2. 在 GitHub 仓库需要配置哪些 Secret 才能让 CI 推送镜像
3. Git Tag 发版的完整流程

---

## 1. 本地构建与运行

构建上下文 **必须是仓库根**（monorepo 里 yarn workspace 需要看到根 `package.json` / `yarn.lock`）。

```bash
# 在仓库根执行
docker build \
  -f apps/thu-ai-assistant/Dockerfile \
  -t thu-ai-assistant:local \
  .
```

复制一份本地环境变量再运行：

```bash
cp apps/thu-ai-assistant/.env.example apps/thu-ai-assistant/.env.local
# 按需填写 GLM_API_KEY 等

docker run --rm -it \
  -p 3000:3000 \
  --env-file apps/thu-ai-assistant/.env.local \
  --name thu-ai-assistant \
  thu-ai-assistant:local
```

打开浏览器访问 `http://localhost:3000` 即可。

### 镜像包含什么

- `node:24-bookworm-slim` + `chromium` + `chromium-driver`（Selenium 运行时）
- `tini` 做 PID 1，正确回收 Chromium 的僵尸进程
- 以 `node` 非 root 用户运行
- 默认 `PORT=3000`、`CHROME_BIN=/usr/bin/chromium`、`SELENIUM_HEADLESS=true`

---

## 2. CI/CD 镜像仓库（GHCR，零配置）

本项目使用 **GitHub Container Registry (`ghcr.io`)** 托管镜像，**无需任何额外 Secret 配置**：
workflow 已使用 GitHub Actions 自动注入的 `GITHUB_TOKEN` 完成登录与推送。

镜像地址规则：

```
ghcr.io/<github-owner>/thu-ai-assistant:<tag>
```

例如对仓库 `liuhanzuo/CampusOS`，镜像即为：

```
ghcr.io/liuhanzuo/thu-ai-assistant:latest
ghcr.io/liuhanzuo/thu-ai-assistant:<commit-sha7>
ghcr.io/liuhanzuo/thu-ai-assistant:1.2.3   # 由 git tag 触发的版本镜像
```

### 镜像可见性

首次推送后，镜像默认是 **私有**。如需公开拉取：

1. 打开 `https://github.com/users/<owner>/packages/container/thu-ai-assistant/settings`
2. 滚到底部 **Danger Zone → Change visibility → Public**

### 拉取私有镜像

```bash
echo "<your-PAT-with-read:packages>" | docker login ghcr.io -u <your-github-user> --password-stdin
docker pull ghcr.io/<owner>/thu-ai-assistant:latest
```

---

## 3. 触发反馈闭环

流水线文件位于 `.github/workflows/thu-ai-assistant-*.yml`：

| 触发条件 | Workflow | 产物 |
|---|---|---|
| 对 `master` 发 PR | `thu-ai-assistant-ci.yml` | 构建 + tsc 类型检查（不推送镜像） |
| 合并/推送到 `master` | `thu-ai-assistant-build.yml` | 镜像 `:latest` + `:<sha7>` |
| 推送形如 `thu-ai-assistant-v*` 的 Tag | `thu-ai-assistant-release.yml` | 镜像 `:<version>` + `:<sha7>` + `:latest`，并创建 GitHub Release |

### 发版流程

```bash
# 更新版本号（可选，也可在 package.json 里单独改）
git switch master
git pull

# 打 tag 并推送，workflow 自动完成构建 + 推镜像 + 发 Release
git tag thu-ai-assistant-v1.2.3
git push origin thu-ai-assistant-v1.2.3
```

等待 Actions 跑完后，GitHub → Releases 页面会出现 `thu-ai-assistant 1.2.3`，其中包含自动生成的 changelog 和：

```bash
docker pull ghcr.io/<owner>/thu-ai-assistant:1.2.3
```

### 回滚

直接拉取之前的版本 tag 镜像即可：

```bash
docker pull ghcr.io/<owner>/thu-ai-assistant:1.2.2
```

---

## 4. 常见问题

**Q: 本地 `docker build` 为什么这么慢？**
monorepo 根下的 `node_modules` 很大（>1GB）。仓库已在 `apps/thu-ai-assistant/Dockerfile.dockerignore` 里排除了它；Docker 20.10+ 会自动识别该文件。若本地 Docker 版本过旧，升级到 20.10+ 即可。

**Q: 容器里 Selenium 报错 `no sandbox`？**
代码里已经处理了 `SELENIUM_HEADLESS=true` 的 Chrome 启动参数（`--no-sandbox --disable-dev-shm-usage`）。如仍报错，检查是否挂载了足够的 `/dev/shm`：

```bash
docker run --shm-size=1g …
```

**Q: CI 能跑单测吗？**
当前 `apps/thu-ai-assistant/package.json` 未定义 `test` 脚本，`thu-ai-assistant-ci.yml` 只跑 `yarn workspace thu-ai-assistant build`。补齐 `test` 脚本后，可在 CI workflow 里加一步 `yarn workspace thu-ai-assistant test`。
