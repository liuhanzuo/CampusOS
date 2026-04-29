# THU AI Assistant 待办清单

这份文档用于跟踪 `thu-ai-assistant` 从“能跑的演示”走向“可维护、可执行真实校园操作的 Agent”所需的具体工程工作。

## 当前最需要明确的问题

- [x] 先把“预约能力”主线明确下来：查询能力优先做稳；研读间作为第一个真实预约闭环；体育预约和电费充值暂不强推自动化。
- [ ] 为所有真实动作补统一确认协议和待确认动作缓存，否则 Agent 不能安全执行预约/取消/支付。
- [ ] 体育预约虽然已有 Selenium 路径，但仍缺“记录查询 / 取消预约 / 按用户会话隔离”这三个关键环节。
- [ ] 图书馆研读间预约底层接口已具备，但还没有封装成 `thu-ai-assistant` 的服务层和 Agent 工具。
- [x] 体育查询已切到当前系统接口族，并已验证可返回真实 `sessionVo` 场地/时段和 `canBook` 状态；后续关注接口漂移和预约提交链路。
- [ ] 电费查询暂时降级处理，后续再回到代理链路问题。
- [x] 已补 `GET /api/health`，可用于前端启动检查、进程存活验证和重启确认。
- [ ] `src/services/thu/data-service.ts` 职责过多，随着预约类能力增加，继续堆在一个文件里会明显降低可维护性。
- [ ] 体育 Selenium 目前是单例服务，是否应切换为“按用户会话隔离”的状态管理还没有定。

## Info App 功能迁移计划

目标不是复刻 `thu-info-app` 的页面，而是把原 App 中已有且稳定的能力迁移成 Agent tools。迁移顺序按风险分层：

- [x] P0/P1 第一批稳定查询工具：
  - [x] 体测成绩：`get_physical_exam`
  - [x] 教学评估列表：`get_teaching_assessment_list`
  - [x] 发票列表：`get_invoice_list`
  - [x] 校历图片：`get_school_calendar_image`
  - [x] 新闻详情：`get_news_detail`
  - [x] 图书馆楼层/区域/座位查询：`get_library_floors` / `get_library_sections` / `get_library_seats`
- [ ] P0 查询能力继续打磨：
  - [x] 为所有查询工具统一 `success/status/data/meta/error` 返回结构。
  - [ ] 控制大结果长度，避免课程表、新闻正文、座位列表把 LLM 上下文撑爆。
  - [x] 为第一批新增查询工具增加 mock `InfoHelper` 工具测试：`npm run test:tools`。
  - [x] 继续为原有高频工具增加 mock `InfoHelper` 单元测试。
- [ ] P1 原 App 查询能力补齐：
  - [x] 新闻订阅/收藏查询：`get_news_subscriptions` / `get_news_favorites`。
  - [x] 教参平台详情查询：`get_reserves_library_detail`；章节下载准备仍不直接传大文件给 LLM。
  - [x] 选课搜索/余量查询：`search_course_registration_courses`。
  - [ ] 培养方案详情拆成更细工具。
  - [ ] 教参章节下载准备，不直接传大文件给 LLM。
  - [ ] 发票 PDF 改为结构化前端文件动作，不通过 tool result 返回 base64。
- [ ] 真实链路排查：
  - [x] 已增加真实工具级体检报告：`docs/REAL_FUNCTION_TEST_REPORT.md`，当前真实账号结果为 PASS 35 / FAIL 8 / SKIP 2。
  - [x] 体育余量真实链路已专项验证：真实登录后调用 `get_sports_resources` 可返回羽毛球场真实时段记录，2026-04-29 测得气膜馆 132 条、综体 70 条、西体 48 条场地/时段记录。
  - [ ] 教参平台搜索/详情真实冒烟当前出现 WebVPN tunnel failed，需要排查 `reserves.lib.tsinghua.edu.cn` 路由或上游库 host 映射。
  - [ ] 选课搜索真实冒烟当前出现 `j_acegi_login.do` 404/认证链路失败，需要排查选课系统登录态或上游库 CR 链路。
  - [ ] 电费余额/记录真实冒烟当前仍返回登录页，需排查 `myhome.tsinghua.edu.cn` roaming 后 session 未生效的问题。
  - [ ] 研究生收入真实冒烟当前出现 `roamingurl` 为空，需要排查上游入口页或 HOST_MAP/roam 解析。
  - [ ] 在线设备真实冒烟当前失败，需要排查校园网账号系统登录态或设备接口入口。
- [ ] P2 真实动作闭环：
  - [ ] 研读间预约：保留“查询资源 -> 检查冲突 -> pending action -> 用户确认 -> 提交 -> 记录核验”主线。
  - [ ] 图书馆座位预约/取消：接入 pending action，禁止直接执行。
  - [ ] 校园卡充值：保留 pending action，前端用二维码/支付链接渲染。
  - [ ] 校园网设备登录/登出、宿舍密码重置：只在确认协议和二次确认 UI 完成后开放。
- [ ] 暂不硬做：
  - [ ] 体育自动预约：保留查询、记录和打开真实页面能力；自动预约需要验证码、手机号、支付限制和用户手动确认。
  - [ ] 电费充值：原 App 充值 UI 当前关闭，Agent 先做好余额/记录查询。
  - [ ] 饮水、洗衣、校园地图：依赖第三方服务或纯 UI 流程，先作为能力目录或跳转能力。

## Agent 工具

- [ ] 增加体育预约准备工具，用于标准化场馆、日期、时段参数，并生成确认摘要。
- [ ] 增加体育预约确认工具，在用户明确确认后执行真实预约。
- [ ] 增加体育预约工具，在用户明确确认后执行指定场馆/时段的预约。
- [ ] 增加体育预约记录查询工具。
- [ ] 增加体育预约取消工具，并强制走确认流程。
- [ ] 增加图书馆研读间资源查询工具。
- [ ] 增加图书馆研读间预约准备工具。
- [ ] 增加图书馆研读间预约确认工具，并强制走确认流程。
- [ ] 增加图书馆研读间预约记录查询工具。
- [ ] 增加图书馆研读间取消预约工具，并强制走确认流程。
- [ ] 增加图书馆研读间/座位资源查询工具。
- [ ] 增加图书馆预约工具，并强制走确认流程。
- [ ] 增加图书馆取消预约工具，并强制走确认流程。
- [ ] 增加图书馆座位资源查询工具。
- [ ] 增加图书馆座位预约准备/确认/取消工具。
- [ ] 增加校园卡交易记录查询工具。
- [ ] 评估是否需要加入网络账号、在线设备等工具，以补足校园助手的常用场景。
- [ ] 为预约、取消、支付这类不可逆操作定义统一确认协议。
- [ ] 为每个工具补齐稳定的结果 schema，避免模型面对过长、过散的自由格式输出。

## 服务层

- [ ] 在预约类流程落地后，按领域拆分 `src/services/thu/data-service.ts`：
  - [ ] `schedule.service.ts`
  - [ ] `sports.service.ts`
  - [ ] `card.service.ts`
  - [ ] `library.service.ts`
  - [ ] `classroom.service.ts`
  - [ ] `news.service.ts`
- [ ] 新建 `src/services/sports/booking-service.ts`，把体育预约相关逻辑从查询逻辑中分离出来。
- [ ] 新建 `src/services/library/room-booking-service.ts`，封装研读间查询、预约、记录、取消。
- [ ] 新建 `src/services/library/seat-booking-service.ts`，封装座位查询、预约、记录、取消。
- [ ] 将体育场馆元数据收敛到单一共享来源，避免重复维护列表。
- [x] 当前清华体育前端 API 的查询 payload 已按线上前端补齐 `sameLevel`、`devKind`、`chooseByType` 和 `reserve/current/page` 参数映射。
- [ ] 明确体育预约中 Selenium 路径是主实现，还是仅作为回退方案。
- [ ] 用类型化的服务返回模型替代当前分散的对象字面量拼装。

## LLM 与提示词

- [ ] 抽象出 GLM、DeepSeek，以及未来兼容 OpenAI 协议提供方的统一 provider 层。
- [ ] 将 provider 选择逻辑统一收敛到 `src/config/env.ts`。
- [x] 已支持 `.env` 自动加载，或至少有清晰的 shell 启动路径。
- [ ] 让系统提示词更聚焦行为约束，把工具细节尽量下沉到工具定义说明里。
- [ ] 增加用户意图护栏：查询、准备执行、确认执行、真正执行。
- [ ] 为多轮工具调用失败补一条统一兜底回复，明确告诉用户失败点和建议重试方式。

## API 与会话

- [x] 已增加 `GET /api/health`，用于前端启动检查、开发时活性验证和重启确认。
- [ ] 在 session 中增加 pending action 存储，用于预约/取消/支付确认。
- [ ] 抽出统一的已登录路由守卫，去掉各个 route 文件里重复的 session 检查逻辑。
- [ ] 增加请求参数校验辅助函数。
- [ ] 为 API 错误补齐稳定的结构化返回，例如固定 `code` 和 `message`。
- [ ] 明确体育 Selenium 登录态是否应按用户 session 管理，而不是全局单例。
- [ ] 增加 session 过期、登出、清理相关测试。

## 前端

- [ ] 将 `public/index.html` 拆成 `index.html`、`styles.css` 和 `app.js`。
- [ ] 当页面被 `file://` 直接打开时，给出明确的启动提示，而不是静默失败。
- [ ] 为预约、取消、支付等高风险操作增加确认交互。
- [x] `/api/chat` 返回 `toolResults`，Web 前端已能渲染结构化工具结果卡，而不是只依赖文本拼接。
- [ ] 为课程表、发票、座位、新闻等高频结果分别做领域化结果组件。
- [ ] 在 Agent 流程稳定后，决定是否迁移到一个小型 Vite 前端。

## Android / iOS 准备

- [x] 后端聊天响应增加 `toolResults`，移动端可直接消费结构化工具结果。
- [x] 定义移动端共享的 tool result DTO 文档，明确 `success/status/data/meta/error` 和动作字段：`docs/TOOL_RESULT_DTO.md`。
- [x] 将支付、打开页面、体育验证码等 action marker 从文本标记升级为结构化 `actions` 数组。
- [ ] 将登录、2FA、会话过期、pending action 确认流程整理为移动端状态机。

## 测试与验证

- [ ] 为 `agent/tools/index.ts` 的注册与分发行为补单元测试。
- [x] 增加第一批迁移工具的 mock 冒烟测试：`npm run test:tools`。
- [x] 增加标准测试入口：`npm run test:standard` 串联构建、mock 工具测试、真实 API 冒烟和真实聊天冒烟。
- [x] 增加真实 Agent tool 全功能体检：`npm run smoke:real-tools`，报告输出到 `docs/REAL_FUNCTION_TEST_REPORT.md`。
- [x] 增加真实登录 + HTTP API 冒烟脚本：`npm run smoke:real-api`，覆盖健康检查、鉴权、登录状态、清空历史和安全参数校验。
- [x] 增加真实登录 + HTTP chat 冒烟脚本：`npm run smoke:real-chat`。
- [x] 真实聊天冒烟支持 `SMOKE_EXPECT_TOOLS`，可断言模型确实调用了预期工具。
- [x] 真实聊天冒烟支持 `SMOKE_EXPECT_ACTIONS`，可断言结构化 action 类型。
- [ ] 为相对日期解析补单元测试。
- [x] 为登录状态、聊天鉴权、清空历史等路由补测试。
- [ ] 在可行时基于 `InfoHelper` mock 账号补服务层测试。
- [x] 为 `apps/thu-ai-assistant` 增加一个轻量级 CI 构建检查：`npm run test:ci`。
- [ ] 增加真实环境人工验证文档，覆盖登录、2FA、校园卡充值、体育查询、体育预约。

## 仓库整理

- [ ] 明确 `apps/thu-ai-assistant/dist/` 是否应该继续被跟踪；当前 `.gitignore` 把它视为构建产物。
- [ ] 确保 `.env`、`.cookies`、日志、截图、本地 npm 缓存不进入 git。
- [ ] 补一个最短可用的本地开发说明，覆盖安装、构建、运行。
- [ ] 统一当前混用的 npm / yarn 工作流，并写清推荐命令。
- [ ] 除非确实改了依赖，否则避免提交无意义的 lockfile 抖动。

## 已知风险

- [ ] 清华体育接口可能继续漂移，改行为前必须先对照线上前端验证。
- [ ] 预约、支付、取消这类能力都可能触发真实世界操作，必须要求显式确认。
- [ ] Selenium 自动化对页面结构和登录流程变更较敏感。
- [ ] 在超出本地开发范围前，session 与凭据管理还需要进一步审视。
