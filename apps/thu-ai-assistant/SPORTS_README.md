# 清华体育场馆预约系统 - Selenium自动化工具

## 🎯 功能介绍

这是一个基于Selenium WebDriver的清华大学体育场馆预约自动化工具，支持：

- ✅ **自动登录**：支持清华统一认证登录，包括2FA二次验证
- ✅ **场馆查询**：查询各体育场馆的可用时段
- ✅ **场地预约**：自动预约指定场馆和时间段
- ✅ **Cookie持久化**：保存登录状态，避免重复登录
- ✅ **终端交互**：友好的命令行界面，支持实时输入验证码

## 📦 安装依赖

```bash
cd apps/thu-ai-assistant
npm install selenium-webdriver
npm install --save-dev @types/selenium-webdriver
```

## 🚀 使用方法

### 方式一：命令行工具（推荐）

直接运行命令行工具进行交互式操作：

```bash
npm run sports
```

或者使用编译后的版本：

```bash
npm run build
node dist/cli-sports.js
```

**命令行工具使用流程：**

1. **启动程序**：运行 `npm run sports`
2. **输入凭据**：输入清华学号和密码
3. **二次认证**：如果启用了2FA，选择验证方式（企业微信/手机/TOTP）
4. **输入验证码**：查看企业微信/手机获取验证码并输入
5. **选择操作**：
   - 查询场馆：查看指定日期的可用时段
   - 预约场地：预约指定的时间段
   - 查看场馆列表：显示所有支持的场馆
   - 重新登录：使用不同的账号登录

### 方式二：HTTP API

启动Express服务器后，可以通过HTTP API调用：

```bash
# 启动服务器
npm run dev

# 在另一个终端中使用API
```

**API端点：**

```bash
# 1. 获取场馆列表
GET http://localhost:3000/api/sports/venues

# 2. 登录体育系统（需要先登录主系统）
POST http://localhost:3000/api/sports/login

# 3. 查询场馆可用时段
POST http://localhost:3000/api/sports/query
Body: {
  "venueName": "羽毛球",
  "date": "2026-04-06"
}

# 4. 预约场地
POST http://localhost:3000/api/sports/book
Body: {
  "venueName": "气膜馆羽毛球场",
  "date": "2026-04-06",
  "timeSlot": "18:00"
}

# 5. 登出体育系统
POST http://localhost:3000/api/sports/logout
```

## 🏟️ 支持的场馆

- 气膜馆羽毛球场
- 气膜馆乒乓球场
- 综体篮球场
- 综体羽毛球场
- 西体羽毛球场
- 西体台球
- 紫荆网球场
- 西网球场

## 💡 使用技巧

### 1. 模糊搜索场馆

可以使用关键词搜索场馆：
- `羽毛球` → 匹配所有羽毛球场
- `篮球` → 匹配篮球场
- `乒乓球` → 匹配乒乓球场

### 2. 日期格式

- 标准格式：`YYYY-MM-DD`（如：`2026-04-06`）
- 直接回车：使用今天的日期

### 3. 时间段格式

- 24小时制：`HH:MM`（如：`18:00`）
- 支持部分匹配：`18` 可以匹配 `18:00`

### 4. Cookie管理

- 登录成功后，Cookie会自动保存到 `.cookies/sports-cookies.json`
- 下次启动时会自动加载Cookie，无需重新登录
- 如需重新登录，删除Cookie文件或选择"重新登录"选项

## 🔧 配置选项

### 无头模式

在开发时，可以关闭无头模式查看浏览器操作：

```typescript
// 在 sports-selenium-service.ts 中
await sportsSeleniumService.login(userId, password, callbacks, false); // false = 显示浏览器
```

在生产环境中，建议开启无头模式：

```typescript
await sportsSeleniumService.login(userId, password, callbacks, true); // true = 无头模式
```

### ChromeDriver

确保系统已安装Chrome浏览器：
- Windows: 自动使用系统安装的Chrome
- Linux: 可能需要安装ChromeDriver

## ⚠️ 注意事项

1. **2FA验证码**：
   - 企业微信验证码通常6位数字
   - 验证码有效期较短，请及时输入
   - 可以选择信任设备，30天内无需二次验证

2. **网络连接**：
   - 确保能够访问清华体育系统
   - 如遇到网络问题，程序会自动重试

3. **浏览器驱动**：
   - 首次运行会自动下载ChromeDriver
   - 如遇到驱动问题，请手动安装对应版本的ChromeDriver

4. **Cookie过期**：
   - Cookie有效期通常为数天
   - 如认证失败，请删除`.cookies`目录重新登录

## 🐛 故障排除

### 1. 登录失败

**问题**：输入正确的账号密码仍无法登录

**解决方案**：
- 检查网络连接
- 删除`.cookies`目录重新登录
- 确认账号密码正确

### 2. 2FA验证失败

**问题**：输入验证码后仍提示错误

**解决方案**：
- 确认验证码输入正确（注意数字和字母）
- 检查验证码是否过期
- 尝试重新获取验证码

### 3. ChromeDriver错误

**问题**：提示ChromeDriver版本不匹配

**解决方案**：
- 更新Chrome浏览器到最新版本
- 或手动下载对应版本的ChromeDriver

### 4. 无法找到场地信息

**问题**：查询结果显示"未找到场地信息"

**解决方案**：
- 检查场馆名称是否正确
- 确认该场馆在指定日期开放
- 尝试使用不同的关键词搜索

## 📝 开发说明

### 文件结构

```
apps/thu-ai-assistant/src/
├── sports-selenium-service.ts  # Selenium服务核心类
├── terminal-login.ts            # 终端交互工具
├── cli-sports.ts               # 命令行工具主程序
└── server.ts                   # Express服务器（包含API端点）
```

### 扩展功能

如需添加新功能：

1. 在 `sports-selenium-service.ts` 中添加新方法
2. 在 `cli-sports.ts` 中添加菜单选项
3. 在 `server.ts` 中添加对应的API端点

### 调试技巧

启用详细日志：

```typescript
// 在 sports-selenium-service.ts 中
this.log('调试信息'); // 使用this.log输出日志
```

截图调试：

```typescript
await sportsSeleniumService.screenshot('debug.png');
```

## 🤝 贡献

欢迎提交Issue和Pull Request！

## 📄 许可

本工具遵循清华信息助手项目的许可证。

---

**注意**：本工具仅用于学习和研究目的，请遵守清华大学的体育场馆预约规定。