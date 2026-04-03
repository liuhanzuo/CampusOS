// 获取体育系统JWT token
const { InfoHelper } = require('./packages/thu-info-lib/src/index');

async function getToken() {
    const helper = new InfoHelper();
    helper.userId = "2024011303";
    helper.password = "Lhz135748";
    helper.fingerprint = "test-fingerprint";

    // 设置2FA
    let twoFactorCode = "209651";
    let twoFactorMethod = "wechat";

    helper.twoFactorMethodHook = async () => twoFactorMethod;
    helper.twoFactorAuthHook = async () => twoFactorCode;

    try {
        console.log('正在登录...');
        await helper.login({ userId: "2024011303", password: "Lhz135748" });

        const token = globalThis.__sportsJwtToken;
        if (token) {
            console.log('\n✅ JWT Token:');
            console.log(token);
        } else {
            console.log('\n❌ 未获取到token');
        }
    } catch (e) {
        console.error('❌ 错误:', e.message);
    }

    process.exit(0);
}

getToken();
