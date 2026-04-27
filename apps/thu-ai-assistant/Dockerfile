# syntax=docker/dockerfile:1.6
# ==========================================================================
# thu-ai-assistant 多阶段构建
# ------------------------------------------------------------------------
# 构建上下文必须为仓库根（monorepo），示例：
#   docker build -f apps/thu-ai-assistant/Dockerfile -t thu-ai-assistant:local .
# ==========================================================================

# --------------------------------------------------------------------------
# 1) deps: 解析并缓存 workspace 依赖（仅当 manifest 变化时失效）
# --------------------------------------------------------------------------
FROM node:24-bookworm-slim AS deps
WORKDIR /workspace

# 先只拷贝 manifest / lockfile，最大化 Docker 层缓存命中
COPY package.json yarn.lock lerna.json ./
COPY apps/thu-ai-assistant/package.json ./apps/thu-ai-assistant/
COPY packages ./packages

# monorepo 下 thu-ai-assistant 依赖 @thu-info/lib，其他 app 不需要
# 这里安装全量 workspace 依赖（含 @thu-info/lib 源码），后续由构建阶段 tsc 打包
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    corepack enable && \
    yarn install --frozen-lockfile --network-timeout 600000

# --------------------------------------------------------------------------
# 2) builder: 拷入应用源码并编译 TS → JS
# --------------------------------------------------------------------------
FROM deps AS builder
WORKDIR /workspace

# 再拷应用源码（改 src 时才会使该层失效，deps 层可复用）
COPY apps/thu-ai-assistant ./apps/thu-ai-assistant

# 构建 @thu-info/lib（thu-ai-assistant 依赖它）+ thu-ai-assistant 自己
RUN yarn workspace @thu-info/lib build || true && \
    yarn workspace thu-ai-assistant build

# 裁剪出生产依赖（用于运行时镜像）
RUN --mount=type=cache,target=/usr/local/share/.cache/yarn \
    yarn install --frozen-lockfile --production --network-timeout 600000 --ignore-scripts

# --------------------------------------------------------------------------
# 3) runner: 轻量运行镜像，内置 Chromium + Chromedriver
# --------------------------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    CHROME_BIN=/usr/bin/chromium \
    CHROMEDRIVER_PATH=/usr/bin/chromedriver \
    # Selenium 在容器内必须用 no-sandbox（参见 Dockerfile 下方启动参数）
    SELENIUM_HEADLESS=true

# 安装 Chromium + 驱动 + 常用字体（中文字形靠 fonts-noto-cjk 保证不乱码）
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        chromium \
        chromium-driver \
        ca-certificates \
        dumb-init \
        fonts-liberation \
        fonts-noto-cjk \
        tini \
        tzdata \
    && rm -rf /var/lib/apt/lists/* \
    # 兼容 chrome-path npm 包的默认探测路径（它按 google-chrome / chromium 顺序查找）
    && ln -sf /usr/bin/chromium /usr/bin/google-chrome \
    && ln -sf /usr/bin/chromium /usr/bin/google-chrome-stable

# 以非 root 用户运行（node 镜像自带的 node 用户即可）
RUN mkdir -p /app/screenshots && chown -R node:node /app

USER node

# 从 builder 拷入生产依赖 + 编译产物 + 运行期必需的静态资源
# 注意：server.ts 默认会读取 public/index.html（前端 SPA 面板），所以要一并带上
COPY --from=builder --chown=node:node /workspace/node_modules ./node_modules
COPY --from=builder --chown=node:node /workspace/apps/thu-ai-assistant/dist ./dist
COPY --from=builder --chown=node:node /workspace/apps/thu-ai-assistant/package.json ./package.json
COPY --from=builder --chown=node:node /workspace/apps/thu-ai-assistant/public ./public
COPY --from=builder --chown=node:node /workspace/packages ./packages

EXPOSE 3000

# 用 tini 做 PID 1，正确转发信号、回收 Chromium 僵尸进程
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]
