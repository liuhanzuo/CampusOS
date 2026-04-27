# THU AI Assistant 预约能力实现方案

这份文档聚焦 `thu-ai-assistant` 里“可执行预约”相关能力，优先关注：

1. 体育场馆预约
2. 图书馆研读间预约
3. 图书馆座位预约

电费等非预约类问题先降级，不放在这一轮主线里。

## 当前结论

### 1. 体育预约不是从零开始，但还不能直接作为 Agent 能力上线

当前仓库里已经有两层体育能力：

- 查询类：
  - `apps/thu-ai-assistant/src/agent/tools/sports-resources.tool.ts`
  - `apps/thu-ai-assistant/src/services/thu/data-service.ts`
  - `packages/thu-info-lib/src/lib/sports.ts`
- Selenium 执行类：
  - `apps/thu-ai-assistant/src/services/sports-selenium/sports-selenium-service.ts`
  - `apps/thu-ai-assistant/src/routes/sports.routes.ts`

这意味着：

- “查空位”已经接近 Agent 工具化。
- “真正下单预约”已经有独立 Selenium 路径，但还没有整理成稳定的 Agent 动作能力。

当前体育预约仍有几个明显缺口：

- Selenium 登录态是全局单例，不是按用户 session 隔离。
- `bookVenue()` 主要依赖页面按钮和文案选择器，稳定性一般。
- 还没有“预约记录查询 / 取消预约 / 支付状态处理”的 Selenium 服务层闭环。
- 还没有统一的确认协议，Agent 不能安全地直接执行预约。
- 当前体育 Agent 工具仍以“查询”为主，没有正式的“准备预约 -> 用户确认 -> 执行预约”链路。

### 2. 图书馆研读间预约的底层能力其实已经基本齐了

`@thu-info/lib` 已经有完整的图书馆研读间预约相关接口：

- 登录与账号准备：
  - `loginLibraryRoomBooking()`
  - `getLibraryRoomAccNo()`
- 查询：
  - `getLibraryRoomBookingInfoList()`
  - `getLibraryRoomBookingResourceList(date, kindId)`
  - `getLibraryRoomBookingRecord()`
- 执行：
  - `bookLibraryRoom(roomRes, start, end, memberList)`
  - `cancelLibraryRoomBooking(uuid)`
  - `updateLibraryRoomEmail(email)`

从实现角度看，研读间这条线最大的工作量不在底层接口，而在：

- 如何把查询结果压缩成适合模型理解和选择的 schema；
- 如何让用户补齐开始时间、结束时间、参与成员等参数；
- 如何在执行前强制确认。

### 3. 图书馆座位预约也有底层 API，但更适合做成“第二阶段”

`@thu-info/lib` 里已有座位预约相关接口：

- `getLibraryList()`
- `getLibraryFloorList()`
- `getLibrarySectionList()`
- `getLibrarySeatList()`
- `bookLibrarySeat(librarySeat, section, dateChoice)`
- `getBookingRecords()`
- `cancelBooking(id)`

不过座位预约的交互复杂度比研读间更高，因为它需要多级选择：

- 图书馆
- 楼层
- 区域
- 座位
- 日期

所以从产品和工程收益看，建议排在“研读间预约”之后，而不是一开始就做。

## 建议的实现顺序

### 第一优先级：体育预约闭环

目标：让用户能通过一句话完成“查询体育空位 -> 指定场馆/日期/时间 -> 确认 -> 执行预约”。

推荐拆成 4 个工具：

1. `get_sports_resources`
2. `get_sports_booking_records`
3. `prepare_sports_booking`
4. `confirm_sports_booking`

其中：

- `get_sports_resources`：只负责查。
- `prepare_sports_booking`：只做参数校验和“候选时段确认”，不真正下单。
- `confirm_sports_booking`：只有在用户明确确认后才调用 Selenium 执行。
- `get_sports_booking_records`：用于后续取消预约或追踪状态。

如果体育取消也要接入，则继续补：

5. `cancel_sports_booking`

推荐实现策略：

- 查询仍可优先走当前新体育 API / 旧接口回退逻辑。
- 真正执行预约先继续走 Selenium，因为当前仓库里只有这条线已经接近可用。
- 先不要把“支付”纳入首轮 Agent 动作，除非已经确认体育预约流程里存在必须支付且可稳定提取支付链接。

### 第二优先级：图书馆研读间预约

目标：支持“查询研读间资源 -> 选择时间段和房间 -> 确认 -> 预约 -> 查询记录 -> 取消”。

推荐工具：

1. `get_library_room_resources`
2. `prepare_library_room_booking`
3. `confirm_library_room_booking`
4. `get_library_room_booking_records`
5. `cancel_library_room_booking`

这条线建议直接走 `@thu-info/lib`，不要重新发明 Selenium。

最小落地路径：

- 查询房间类型和可预约资源：
  - `getLibraryRoomBookingInfoList()`
  - `getLibraryRoomBookingResourceList(date, kindId)`
- 执行预约：
  - `bookLibraryRoom(roomRes, start, end, memberList)`
- 查询记录：
  - `getLibraryRoomBookingRecord()`
- 取消：
  - `cancelLibraryRoomBooking(uuid)`

需要额外设计的部分：

- 时间输入标准化：统一转换为 `yyyy-MM-dd HH:mm`。
- 成员列表策略：
  - 单人预约允许 `memberList = []`
  - 多人预约时再引导用户补齐成员
- 冲突展示：把 `LibRoomRes.usage` 压缩成模型可读的已占用时段摘要。

### 第三优先级：图书馆座位预约

目标：支持单人快速预约座位，并能查看和取消。

推荐工具：

1. `get_library_seat_resources`
2. `prepare_library_seat_booking`
3. `confirm_library_seat_booking`
4. `get_library_seat_booking_records`
5. `cancel_library_seat_booking`

这条线之所以排第三，不是因为底层接口弱，而是因为交互路径更长，Agent 更容易在多级选择里迷失。

比较合理的收口方式：

- 不直接让模型自由搜索所有座位。
- 先让工具返回“图书馆 -> 楼层 -> 区域”的分层结果。
- 再让模型在用户补充偏好后调用第二步工具缩小范围。

## Agent 层需要补的共性机制

无论是体育、研读间还是座位预约，Agent 层都需要同一套执行协议。

### 1. 统一确认协议

建议所有真实动作都分成两步：

- 第一步：`prepare_*`
  - 校验参数
  - 返回标准化后的执行摘要
  - 不做真实操作
- 第二步：`confirm_*`
  - 输入必须包含 `confirmation_token`
  - 只有拿到明确确认才真正执行

建议标准输出结构至少包含：

- `action_type`
- `summary`
- `confirmation_token`
- `expires_at`
- `risk`

### 2. 待确认动作缓存

当前 `session` 里只有登录态和聊天历史，还没有“待确认动作”的状态。

建议新增会话内 pending action 存储，至少记录：

- 动作类型
- 标准化参数
- 创建时间
- 发起用户
- 是否已确认

否则模型在“你确认吗？”之后无法安全恢复到具体执行参数。

### 3. 工具输出 schema 收紧

当前很多服务层返回值还比较自由。预约类工具需要更稳定的 schema，否则模型很难稳定进行下一步动作选择。

尤其是：

- 体育场地字段列表
- 研读间占用时段
- 座位区域/楼层列表
- 预约记录摘要

## 建议的代码落点

### 体育

- 服务层：
  - 新建 `src/services/sports/booking-service.ts`
  - 把 Selenium 的查询、预约、记录、取消逐步从 `sports-selenium-service.ts` 中收口成更稳定的服务接口
- Agent 工具：
  - `sports-booking-records.tool.ts`
  - `sports-booking-prepare.tool.ts`
  - `sports-booking-confirm.tool.ts`
  - `sports-booking-cancel.tool.ts`

### 图书馆研读间

- 服务层：
  - 新建 `src/services/library/room-booking-service.ts`
- Agent 工具：
  - `library-room-resources.tool.ts`
  - `library-room-booking-prepare.tool.ts`
  - `library-room-booking-confirm.tool.ts`
  - `library-room-booking-records.tool.ts`
  - `library-room-booking-cancel.tool.ts`

### 图书馆座位

- 服务层：
  - 新建 `src/services/library/seat-booking-service.ts`
- Agent 工具：
  - `library-seat-resources.tool.ts`
  - `library-seat-booking-prepare.tool.ts`
  - `library-seat-booking-confirm.tool.ts`
  - `library-seat-booking-records.tool.ts`
  - `library-seat-booking-cancel.tool.ts`

## 最推荐的下一步

如果只做一条主线，我建议先做：

1. 体育预约确认协议
2. 体育预约 Agent 工具接入
3. 图书馆研读间查询 / 预约 / 取消工具

原因很简单：

- 体育预约是用户最直观、最想要的动作能力之一；
- 研读间底层接口已经比较成熟，工程上更容易尽快出效果；
- 座位预约比研读间更碎，适合放在后面补。
