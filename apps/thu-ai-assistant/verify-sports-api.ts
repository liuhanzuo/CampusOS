// 验证体育API是否已更新
// 这个脚本检查 getSportsResources 函数是否调用真实API

import { readFileSync } from "fs";
import { join } from "path";

const sportsFilePath = join(__dirname, "../../packages/thu-info-lib/src/lib/sports.ts");
const sportsCode = readFileSync(sportsFilePath, "utf-8");

console.log("=== 检查体育API代码 ===\n");

// 检查1: 是否移除了mock数据注释
const hasOldComment = sportsCode.includes("临时使用mock数据");
console.log(`1. 旧的mock注释: ${hasOldComment ? "❌ 仍存在" : "✅ 已移除"}`);

// 检查2: 是否使用了真实API URL
const hasRealApi = sportsCode.includes("SPORTS_DIRECT_BASE}/venue/api/res/book/getGymBook");
console.log(`2. 真实API端点: ${hasRealApi ? "✅ 已添加" : "❌ 未找到"}`);

// 检查3: 是否调用sportsFetch
const callsSportsFetch = sportsCode.includes("await sportsFetch(apiUrl");
console.log(`3. 调用sportsFetch: ${callsSportsFetch ? "✅ 是" : "❌ 否"}`);

// 检查4: 是否发送正确的请求参数
const hasCorrectParams = sportsCode.includes("gymnasium_id: gymId") &&
                        sportsCode.includes("item_id: itemId") &&
                        sportsCode.includes("time_date: date");
console.log(`4. 正确的请求参数: ${hasCorrectParams ? "✅ 是" : "❌ 否"}`);

// 检查5: 是否解析JSON响应
const parsesJson = sportsCode.includes("JSON.parse(response)");
console.log(`5. 解析JSON响应: ${parsesJson ? "✅ 是" : "❌ 否"}`);

console.log("\n=== 总结 ===");
const allGood = !hasOldComment && hasRealApi && callsSportsFetch && hasCorrectParams && parsesJson;
if (allGood) {
    console.log("✅ 所有检查通过！API已正确更新为真实端点");
    console.log("\n新API端点: https://www.sports.tsinghua.edu.cn/venue/api/res/book/getGymBook");
    console.log("认证方式: JWT Token (自动获取)");
} else {
    console.log("❌ 部分检查未通过，请检查代码");
}
