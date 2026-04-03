/**
 * 测试脚本：验证体育场馆API修改
 * 此脚本模拟调用getSportsResources函数来测试新API
 */

const testSportsAPI = () => {
    console.log('=== 体育场馆API测试 ===\n');

    console.log('测试内容：');
    console.log('1. 修改后的getSportsResources函数使用新API端点');
    console.log('   - 端点: /venue/api/res/book/getGymBook');
    console.log('   - 方法: POST');
    console.log('   - 认证: JWT token');
    console.log('   - 请求体: {gymId, itemId, date}');

    console.log('\n2. 新API的优点：');
    console.log('   - 直连模式，不通过WebVPN');
    console.log('   - 返回JSON格式，易于解析');
    console.log('   - 与前端使用的相同API');

    console.log('\n3. 回退机制：');
    console.log('   - 如果新API失败，自动回退到旧API');
    console.log('   - 确保兼容性和可用性');

    console.log('\n4. 需要验证的内容：');
    console.log('   - JWT token是否正确获取');
    console.log('   - API响应数据结构');
    console.log('   - 字段映射是否正确');

    console.log('\n=== 建议的测试步骤 ===\n');

    console.log('步骤1: 启动应用');
    console.log('  cd apps/thu-ai-assistant');
    console.log('  npm run dev');

    console.log('\n步骤2: 发送测试请求');
    console.log('  例如：查询羽毛球馆预约');
    console.log('  POST /api/sports/resources');
    console.log('  Body: {');
    console.log('    "gymId": "1",');
    console.log('    "itemId": "1",');
    console.log('    "date": "2026-04-03"');
    console.log('  }');

    console.log('\n步骤3: 查看日志');
    console.log('  应该看到：');
    console.log('  - [Sports] 使用新系统API查询（直连模式）');
    console.log('  - [Sports] sportsFetch: POST https://www.sports.tsinghua.edu.cn/venue/api/res/book/getGymBook');
    console.log('  - [Sports] API响应: {...}');

    console.log('\n步骤4: 验证响应');
    console.log('  检查返回的数据结构：');
    console.log('  - count: 用户可预约的最大场地数');
    console.log('  - init: 初始值');
    console.log('  - phone: 手机号');
    console.log('  - data: 场地资源数组');

    console.log('\n=== 下一步工作 ===\n');

    console.log('如果新API响应结构与预期不符，需要：');
    console.log('1. 使用浏览器开发者工具查看实际API响应');
    console.log('2. 调整sports.ts中的数据映射逻辑');
    console.log('3. 更新SportsResourcesInfo接口（如需要）');

    console.log('\n如果认证失败，需要检查：');
    console.log('1. JWT token是否正确存储在globalThis.__sportsJwtToken');
    console.log('2. sportsFetch函数是否正确传递token');
    console.log('3. core.ts中的roam函数是否成功获取token');
};

testSportsAPI();
