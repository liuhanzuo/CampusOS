# THU AI Assistant 架构说明

`thu-ai-assistant` 是一个小型 Web 服务，目标是把清华校内系统能力封装成可由大模型调用的工具，并通过对话接口统一暴露出来。

## 运行链路

1. `src/server.ts` 启动 Express，注册中间件，并托管 `public/index.html`。
2. `src/routes/*` 负责各类 HTTP 接口，例如登录、聊天、校园卡、体育相关接口。
3. `src/session/session-manager.ts` 负责用户会话、登录状态、2FA 流程，以及已认证 `InfoHelper` 实例的复用。
4. `src/agent/ai-service.ts` 负责对话主循环，把用户消息、系统提示词和工具调用串起来。
5. `src/agent/llm-client.ts` 负责向大模型提供方发送消息、工具定义，并接收回复。
6. `src/agent/tools/*` 定义每一个可被模型调用的工具，并把调用转发到具体校园服务。
7. `src/services/thu/data-service.ts` 基于 `@thu-info/lib` 封装查询逻辑，返回更适合 JSON 输出的结果。
8. `src/services/sports-selenium/sports-selenium-service.ts` 提供体育系统的 Selenium 自动化路径，主要用于查询和预约。

## 目录边界

- `agent/`：提示词、模型调用、工具循环、工具注册。
- `agent/tools/`：每个模型工具一个文件，负责定义输入输出和执行逻辑。
- `config/`：环境变量与运行时配置。
- `routes/`：按功能划分的 HTTP API。
- `session/`：登录会话和认证态生命周期管理。
- `services/`：与清华系统或浏览器自动化直接交互的服务层。
- `public/`：当前静态演示前端。

## 当前结构上的重点

- 主链路是 `server -> routes -> session -> agent -> services -> @thu-info/lib`。
- Agent 层当前已经具备“模型选择工具 -> 执行工具 -> 再次回到模型”的闭环。
- 体育能力目前分成两条路径：
  - `agent/tools/` + `services/thu/data-service.ts`：面向查询类能力。
  - `services/sports-selenium/` + `routes/sports.routes.ts`：面向 Selenium 查询/预约接口。
- `src/services/thu/data-service.ts` 目前仍是一个偏大的聚合文件，后续适合按领域拆分。

## 新增一个工具时怎么接入

1. 如果 `services/` 里还没有对应校园能力，先补服务实现。
2. 在 `agent/tools/` 下新增一个 `*.tool.ts` 文件。
3. 导出一个包含 `definition` 和 `run` 的 `AgentTool`。
4. 在 `agent/tools/index.ts` 里注册该工具。
5. 只有在模型确实需要额外高层行为约束时，才修改 `agent/prompt.ts`。
