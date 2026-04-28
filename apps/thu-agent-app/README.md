# Campus Agent App

独立于 `thu-info-app` 的 Agent-first 校园助手移动端 Demo。

## 产品边界

- 这是一个新的 App，不是 `thu-info-app` 的内置页面。
- App 端只负责登录、对话、能力展示和结果渲染。
- 校园能力通过 `apps/thu-ai-assistant` 后端的 Agent tools 暴露。
- `@thu-info/lib` 仍然是校园系统能力的底层来源。

## 本地 Demo

1. 启动 Agent 后端：

   ```bash
   npm run dev --workspace apps/thu-ai-assistant
   ```

2. 检查后端：

   ```bash
   curl http://127.0.0.1:3000/api/health
   curl http://127.0.0.1:3000/api/capabilities
   ```

3. 启动移动端 Metro：

   ```bash
   npm run agent:start
   ```

4. 启动 Android：

   ```bash
   npm run agent:android
   ```

Android 模拟器连接电脑本机后端时，App 内后端地址填：

```text
http://10.0.2.2:3000
```

真机调试时，填电脑的局域网 IP，例如：

```text
http://192.168.1.23:3000
```

## 今天的 MVP 验收

- App 是独立包名：`com.campusos.agent`。
- 第一屏是 Agent 对话，不是传统功能宫格。
- `/api/capabilities` 可无登录展示能力目录。
- 登录后通过 `/api/chat` 调用 Agent tools。
- 可演示 prompt：
  - 你现在支持哪些校园功能？
  - 查一下我的课程表
  - 查一下校园卡余额
  - 查一下宿舍电费
  - 明天羽毛球场有没有空位
  - 查一下最新校内通知

## 当前限制

- 预约、支付、取消、改密、校园网设备登录/登出等真实操作只做参数准备或跳转，不自动执行。
- 体育预约 MVP 以查询和打开真实预约页为主。
- 若本地未安装 React Native 依赖，需要先安装工作区依赖后再运行 Android。
