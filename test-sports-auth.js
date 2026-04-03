// 测试体育API认证和调用
const { InfoHelper } = require('./packages/thu-info-lib/src/index');

async function testSportsAuth() {
    const userId = "2024011303";
    const password = "Lhz135748";

    console.log('=== 体育API认证测试 ===\n');

    const helper = new InfoHelper();
    helper.userId = userId;
    helper.password = password;
    helper.fingerprint = "test-fingerprint";

    // 设置2FA
    let twoFactorCode = "209651";
    let twoFactorMethod = "wechat";

    helper.twoFactorMethodHook = async () => twoFactorMethod;
    helper.twoFactorAuthHook = async () => twoFactorCode;

    try {
        console.log('1. 登录中...');
        await helper.login({ userId, password });
        console.log('   ✅ 登录成功!\n');

        // 检查JWT token
        const jwtToken = globalThis.__sportsJwtToken;
        if (jwtToken) {
            console.log('2. JWT Token已获取:');
            console.log(`   ${jwtToken.substring(0, 50)}...\n`);
        } else {
            console.log('   ⚠️  未找到JWT Token\n');
        }

        console.log('3. 查询体育场馆...');
        const result = await helper.getSportsResources(
            "3998000", // 气膜馆羽毛球场
            "4045681",
            "2026-04-03"
        );

        console.log('\n✅ 查询成功!');
        console.log('可预约数量:', result.count);
        console.log('已预约数量:', result.init);
        console.log('场地数量:', result.data.length);

        if (result.data.length > 0) {
            console.log('\n前3个场地:');
            result.data.slice(0, 3).forEach((field, i) => {
                console.log(`  ${i+1}. ${field.fieldName} (${field.timeSession}) - ${field.cost}元`);
            });
        }

    } catch (e) {
        console.error('\n❌ 错误:', e.message);
        if (e.stack) {
            console.error('\n堆栈信息:', e.stack.split('\n').slice(0, 5).join('\n'));
        }
    }
}

testSportsAuth();
