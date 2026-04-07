#!/usr/bin/env node
/**
 * 简化版登录测试工具
 * 用于调试登录问题
 */

// Node.js 环境 polyfill
declare global {
  var window: unknown;
}

if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
}

import * as readline from 'readline';
import { Builder, Browser, By, until, Key } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';

/**
 * 创建readline接口
 */
function createReadline(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * 提问函数
 */
function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer.trim());
        });
    });
}

/**
 * 简化版登录测试
 */
async function simpleLoginTest() {
    const rl = createReadline();

    try {
        console.log('\n🧪 简化版登录测试工具\n');

        const userId = await question(rl, '请输入学号：');
        const password = await question(rl, '请输入密码：');

        console.log('\n正在启动浏览器...\n');

        // 启动浏览器
        const options = new Options()
            .addArguments('--disable-gpu')
            .addArguments('--no-sandbox')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--disable-blink-features=AutomationControlled');

        const driver = await new Builder()
            .forBrowser(Browser.CHROME)
            .setChromeOptions(options as any)
            .build();

        console.log('✅ 浏览器启动成功\n');

        try {
            // 尝试多个可能的认证地址
            const authUrls = [
                'https://id.tsinghua.edu.cn/',
                'https://oauth.tsinghua.edu.cn/',
                'https://webvpn.tsinghua.edu.cn/',
                'https://www.sports.tsinghua.edu.cn/venue/login.html'
            ];

            let success = false;
            let workingUrl = '';

            console.log('📝 尝试访问认证页面...\n');

            for (let i = 0; i < authUrls.length; i++) {
                try {
                    const url = authUrls[i];
                    console.log(`尝试 ${i + 1}/${authUrls.length}: ${url}`);

                    await driver.get(url);
                    await driver.sleep(3000);

                    const currentUrl = await driver.getCurrentUrl();
                    console.log(`✅ 成功！当前页面: ${currentUrl}\n`);

                    success = true;
                    workingUrl = currentUrl;
                    break;

                } catch (e: any) {
                    console.log(`❌ 失败: ${e.message}\n`);

                    if (i === authUrls.length - 1) {
                        throw new Error(`无法访问任何认证服务器，请检查网络连接或VPN设置`);
                    }
                }
            }

            if (!success) {
                throw new Error('所有认证地址都无法访问');
            }

            const currentUrl = await driver.getCurrentUrl();
            console.log(`📍 当前页面: ${currentUrl}`);
            console.log(`📍 正在查找登录表单...\n`);

            // 检查是否需要手动导航到登录页
            if (!currentUrl.includes('id.tsinghua.edu.cn') &&
                !currentUrl.includes('oauth.tsinghua.edu.cn') &&
                !currentUrl.includes('webvpn')) {

                console.log('⚠️  未在认证页面，尝试查找登录链接...');

                // 查找页面上的登录链接
                try {
                    const loginLinks = await driver.findElements(By.css('a[href*="login"], a:contains("登录")'));
                    if (loginLinks.length > 0) {
                        console.log('✅ 找到登录链接，点击跳转...');
                        await loginLinks[0].click();
                        await driver.sleep(3000);
                    }
                } catch (e) {
                    console.log('⚠️  未找到登录链接，直接导航到认证页面');
                    await driver.get('https://id.tsinghua.edu.cn/');
                    await driver.sleep(3000);
                }
            }

            // 重新获取当前URL
            const updatedUrl = await driver.getCurrentUrl();
            console.log(`📍 更新后页面: ${updatedUrl}\n`);

            // 查找并输入学号
            console.log('🔍 查找学号输入框...');
            const userIdInputs = await driver.findElements(By.name('i_user'));
            const userIdInput = userIdInputs.length > 0 ? userIdInputs[0] :
                              await driver.findElement(By.css('input[type="text"]'));

            await userIdInput.clear();
            await userIdInput.sendKeys(userId);
            console.log('✅ 学号输入成功');

            // 查找并输入密码
            console.log('🔍 查找密码输入框...');
            const passwordInputs = await driver.findElements(By.name('i_pass'));
            const passwordInput = passwordInputs.length > 0 ? passwordInputs[0] :
                                await driver.findElement(By.css('input[type="password"]'));

            await passwordInput.clear();
            await passwordInput.sendKeys(password);
            console.log('✅ 密码输入成功');

            // 查找并点击登录按钮
            console.log('🔍 查找登录按钮...');
            const loginButtons = await driver.findElements(By.css('button[type="submit"], input[type="submit"]'));

            if (loginButtons.length > 0) {
                console.log('✅ 找到登录按钮，准备点击...');
                await loginButtons[0].click();
                console.log('✅ 登录按钮已点击');
            } else {
                console.log('⚠️  未找到登录按钮，尝试按回车...');
                await passwordInput.sendKeys(Key.ENTER);
            }

            // 等待页面跳转
            console.log('⏳ 等待页面跳转...');
            await driver.sleep(5000);

            const newUrl = await driver.getCurrentUrl();
            console.log(`📍 跳转后页面: ${newUrl}`);

            // 检查是否需要2FA
            if (newUrl.includes('2fa') || newUrl.includes('totp') || newUrl.includes('verify') || newUrl.includes('双重')) {
                console.log('\n🔐 需要二次认证');

                try {
                    const code = await question(rl, '请输入验证码：');

                    console.log('📝 输入验证码...');
                    const codeInputs = await driver.findElements(By.css('input[name="vericode"], input[name="code"], input[type="text"]'));

                    if (codeInputs.length > 0) {
                        await codeInputs[0].clear();
                        await codeInputs[0].sendKeys(code);
                        console.log('✅ 验证码输入成功');

                        // 提交验证码
                        const submitBtns = await driver.findElements(By.css('button[type="submit"], input[type="submit"]'));
                        if (submitBtns.length > 0) {
                            await submitBtns[0].click();
                            console.log('✅ 验证码已提交');
                        }

                        await driver.sleep(3000);
                    } else {
                        console.log('⚠️  未找到验证码输入框');
                    }
                } catch (e: any) {
                    console.log('⚠️  验证码处理失败:', e.message);
                }
            }

            // 最终等待
            console.log('⏳ 等待登录完成...');
            await driver.sleep(5000);

            const finalUrl = await driver.getCurrentUrl();
            console.log(`\n🎉 最终页面: ${finalUrl}`);

            if (finalUrl.includes('sports.tsinghua.edu.cn') || finalUrl.includes('success')) {
                console.log('✅ 登录成功！');
            } else {
                console.log('⚠️  登录状态未知，请检查浏览器');
            }

            // 保持浏览器打开，让用户可以看到结果
            console.log('\n💡 浏览器将保持打开30秒，供您检查...');
            console.log('📸 您可以手动截图或检查页面状态\n');

            await driver.sleep(30000);

        } finally {
            await driver.quit();
            console.log('👋 浏览器已关闭');
        }

    } catch (e: any) {
        console.error('\n❌ 错误:', e.message);
        if (e.stack) {
            console.error('\n堆栈信息:');
            console.error(e.stack);
        }
    } finally {
        rl.close();
        console.log('\n测试结束\n');
        process.exit(0);
    }
}

// 处理错误
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    process.exit(1);
});

// 运行测试
if (require.main === module) {
    simpleLoginTest();
}

export { simpleLoginTest };