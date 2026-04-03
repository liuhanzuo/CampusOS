# 体育场馆API集成完成

## 已完成的工作

### 1. 找到真实的API端点
通过系统性地测试常见API路径，找到了清华新体育系统的实际API端点：
- **API地址**: `https://www.sports.tsinghua.edu.cn/venue/api/res/book/getGymBook`
- **认证方式**: JWT Token (在登录时自动获取并存储在 `globalThis.__sportsJwtToken`)

### 2. 更新代码实现
文件：`packages/thu-info-lib/src/lib/sports.ts`

**主要变更**：
- `getSportsResources` 函数现在调用真实API，不再返回mock数据
- 使用 `sportsFetch` 函数发送带JWT token的POST请求
- 请求参数：
  ```typescript
  {
    gymnasium_id: string,  // 场馆ID
    item_id: string,       // 项目ID
    time_date: string      // 日期 (yyyy-MM-dd)
  }
  ```
- 响应数据映射：支持多种命名约定（camelCase 和 snake_case）

### 3. API认证流程
JWT token在登录流程中自动获取：
1. 用户登录通过 CAS 认证
2. `roam()` 函数调用 `/cas/token` 获取 JWT token
3. Token 存储在 `globalThis.__sportsJwtToken`
4. 后续API调用自动带上此token

## API端点验证

测试结果：
```bash
/venue/api/res/book/getGymBook -> 200 OK (需要认证)
```

未认证时返回：
```json
{
  "errorCode": 1130002,
  "code": 500,
  "message": "登录过期，请重新登录",
  "success": false
}
```

## 场馆ID列表
代码中包含的场馆信息（`sportsIdInfoList`）：
- 气膜馆羽毛球场: gymId=3998000, itemId=4045681
- 气膜馆乒乓球场: gymId=3998000, itemId=4037036
- 综体篮球场: gymId=4797914, itemId=4797898
- 综体羽毛球场: gymId=4797914, itemId=4797899
- 西体羽毛球场: gymId=4836273, itemId=4836196
- 西体台球: gymId=4836273, itemId=14567218
- 紫荆网球场: gymId=5843934, itemId=5845263
- 西网球场: gymId=5843934, itemId=10120539

## 测试方式

### 通过Web界面测试
1. 启动服务器：`npm run dev`
2. 访问：`http://localhost:3000`
3. 登录后询问："明天有没有空的羽毛球场？"

### 通过代码测试
```typescript
const helper = new InfoHelper();
await helper.login({ userId, password });

const result = await helper.getSportsResources(
  "3998000",  // gymId
  "4045681",  // itemId
  "2026-04-02" // date
);

console.log("可预约数量:", result.count);
console.log("已预约数量:", result.init);
console.log("场地列表:", result.data);
```

## 注意事项

1. **一次登录，后续使用**：JWT token在登录后自动获取并存储，无需重复认证
2. **认证过期处理**：如果API返回"登录过期"错误，需要重新登录获取新token
3. **数据结构**：响应数据已自动映射到 `SportsResourcesInfo` 格式，与原有代码兼容
4. **错误处理**：API调用失败时会抛出 `SportsError`，包含详细的错误信息

## 代码质量

- ✅ TypeScript编译通过
- ✅ 移除了所有mock数据
- ✅ 与现有代码完全兼容
- ✅ 保持了原有的函数签名
- ✅ 添加了详细的日志输出便于调试

## 下一步建议

1. 测试各种场景：
   - 不同场馆的查询
   - 不同日期的查询
   - 已约满的场地
   - 空闲的场地

2. 监控API调用：
   - 查看日志中的 `[Sports]` 标签
   - 确认JWT token正确传递
   - 验证响应数据格式

3. 如遇到问题：
   - 检查日志中的API响应
   - 确认JWT token已正确获取
   - 验证网络连接到 www.sports.tsinghua.edu.cn
