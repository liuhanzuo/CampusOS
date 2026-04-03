// Node.js 环境 polyfill - 必须在 import 之前
if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = globalThis;
}

import { InfoHelper } from "@thu-info/lib";

async function testSports() {
    const userId = "2024011303";
    const password = "Lhz135748";

    console.log(`开始登录 ${userId}...`);

    const helper = new InfoHelper();
    helper.userId = userId;
    helper.password = password;
    helper.fingerprint = "test-fingerprint-12345";

    // 禁用自动2FA，手动控制
    let twoFactorCode = "209651"; // 使用你最新的验证码
    let twoFactorMethod: "wechat" | "mobile" | "totp" | undefined = "wechat";

    helper.twoFactorMethodHook = async (hasWeChat, phone, hasTotp) => {
        console.log(`2FA方法选择被拦截，返回: ${twoFactorMethod}`);
        return twoFactorMethod;
    };

    helper.twoFactorAuthHook = async () => {
        console.log(`2FA验证码被拦截，返回: ${twoFactorCode}`);
        return twoFactorCode;
    };

    try {
        // 登录
        await helper.login({ userId, password });
        console.log("\n✅ 登录成功！");

        // 测试查询体育场馆
        console.log("\n开始查询气膜馆羽毛球场（2026-04-02）...");

        const result = await helper.getSportsResources(
            "3998000", // gymId
            "4045681", // itemId
            "2026-04-02", // date
        );

        console.log("\n✅ 查询成功！");
        console.log("可预约数量:", result.count);
        console.log("已预约数量:", result.init);
        console.log("联系电话:", result.phone);
        console.log("场地数量:", result.data.length);

        // 打印前3个场地的详细信息
        if (result.data.length > 0) {
            console.log("\n前3个场地详情:");
            result.data.slice(0, 3).forEach((field, index) => {
                console.log(`\n场地 ${index + 1}:`);
                console.log("  名称:", field.fieldName);
                console.log("  时间:", field.timeSession);
                console.log("  费用:", field.cost);
                console.log("  可预约:", field.canNetBook);
                console.log("  已预约:", field.bookId ? "是" : "否");
            });
        } else {
            console.log("\n⚠️ 没有返回场地数据");
            console.log("这可能意味着:");
            console.log("  1. API路径不正确");
            console.log("  2. 需要不同的认证方式");
            console.log("  3. 该日期没有可用场地");
        }

    } catch (e: any) {
        console.error("\n❌ 错误:", e.message);
        console.error("完整错误信息:", e);
    }
}

testSports();
