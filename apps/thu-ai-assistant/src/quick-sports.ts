#!/usr/bin/env node
/**
 * 快速版体育场馆登录工具
 * 直接访问清华统一认证，跳过复杂的页面查找
 */

// Node.js 环境 polyfill
declare global {
  var window: unknown;
}

if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
}

import * as readline from 'readline';
import { Builder, Browser, By, until, WebDriver, WebElement, Key } from 'selenium-webdriver';
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
 * 快速登录测试
 */
async function quickLoginTest() {
    const rl = createReadline();

    try {
        console.log('\n🚀 快速版清华体育场馆登录工具\n');

        const userId = await question(rl, '请输入学号：');
        const password = await question(rl, '请输入密码：');

        console.log('\n正在启动浏览器...\n');

        // 启动浏览器（不使用无头模式，方便观察）
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
            // 直接访问清华统一认证页面
            console.log('📝 直接访问清华统一认证页面...');
            await driver.get('https://id.tsinghua.edu.cn/');
            await driver.sleep(3000);

            const currentUrl = await driver.getCurrentUrl();
            console.log(`📍 当前页面: ${currentUrl}\n`);

            // 查找学号输入框
            console.log('🔍 查找学号输入框...');
            let userIdInput = await driver.findElements(By.name('i_user'));
            if (userIdInput.length === 0) {
                userIdInput = await driver.findElements(By.css('input[type="text"]'));
            }

            if (userIdInput.length === 0) {
                throw new Error('无法找到学号输入框');
            }

            await userIdInput[0].clear();
            await userIdInput[0].sendKeys(userId);
            console.log('✅ 学号输入成功\n');

            // 查找密码输入框
            console.log('🔍 查找密码输入框...');
            let passwordInput = await driver.findElements(By.name('i_pass'));
            if (passwordInput.length === 0) {
                passwordInput = await driver.findElements(By.css('input[type="password"]'));
            }

            if (passwordInput.length === 0) {
                throw new Error('无法找到密码输入框');
            }

            await passwordInput[0].clear();
            await passwordInput[0].sendKeys(password);
            console.log('✅ 密码输入成功\n');

            // 查找并点击登录按钮
            console.log('🔍 查找登录按钮...');
            const loginButtons = await driver.findElements(By.css('button[type="submit"], input[type="submit"]'));

            if (loginButtons.length > 0) {
                console.log('✅ 找到登录按钮，点击登录...');
                await loginButtons[0].click();
            } else {
                console.log('⚠️  未找到登录按钮，尝试按回车...');
                await passwordInput[0].sendKeys(Key.ENTER);
            }

            // 等待页面跳转
            console.log('\n⏳ 等待登录处理...');
            await driver.sleep(5000);

            const newUrl = await driver.getCurrentUrl();
            console.log(`📍 登录后页面: ${newUrl}\n`);

            // 检查是否需要2FA
            if (newUrl.includes('2fa') || newUrl.includes('totp') || newUrl.includes('verify') || newUrl.includes('双重')) {
                console.log('🔐 需要二次认证\n');

                const code = await question(rl, '请输入验证码：');

                console.log('📝 输入验证码...');
                const codeInputs = await driver.findElements(By.css('input[name="vericode"], input[name="code"], input[type="text"]'));

                if (codeInputs.length > 0) {
                    await codeInputs[0].clear();
                    await codeInputs[0].sendKeys(code);
                    console.log('✅ 验证码输入成功');

                    // 提交验证码
                    const submitBtns = await driver.findElements(By.css('button[type="submit"]'));
                    if (submitBtns.length > 0) {
                        await submitBtns[0].click();
                        console.log('✅ 验证码已提交');
                    }

                    await driver.sleep(3000);
                }
            }

            // 最终检查
            console.log('\n⏳ 最终检查登录状态...');
            await driver.sleep(3000);

            const finalUrl = await driver.getCurrentUrl();
            console.log(`📍 最终页面: ${finalUrl}\n`);

            if (finalUrl.includes('id.tsinghua.edu.cn')) {
                console.log('🎉 统一认证成功！现在跳转到体育场馆系统...\n');

                // 尝试多个可能的体育场馆URL
                const sportsUrls = [
                    'https://www.sports.tsinghua.edu.cn/',
                    'https://www.sports.tsinghua.edu.cn/venue/',
                    'https://www.sports.tsinghua.edu.cn/venue/booking.html',
                    'https://sports.tsinghua.edu.cn/',
                    'https://id.tsinghua.edu.cn/f/oauth2/authorize?client_id=sports'
                ];

                let sportsSuccess = false;
                for (let i = 0; i < sportsUrls.length; i++) {
                    try {
                        const url = sportsUrls[i];
                        console.log(`🏸 尝试体育场馆地址 (${i+1}/${sportsUrls.length}): ${url}`);

                        await driver.get(url);
                        await driver.sleep(3000);

                        const sportsUrl = await driver.getCurrentUrl();
                        console.log(`📍 到达页面: ${sportsUrl}`);

                        // 检查是否成功到达体育场馆系统
                        if (sportsUrl.includes('sports.tsinghua.edu.cn')) {
                            console.log('\n✅ 成功到达清华体育场馆系统！');

                            // 尝试进一步跳转到预约页面
                            console.log('📝 尝试访问预约页面...');
                            await driver.get('https://www.sports.tsinghua.edu.cn/venue/');
                            await driver.sleep(2000);

                            const venueUrl = await driver.getCurrentUrl();
                            console.log(`📍 预约页面: ${venueUrl}\n`);

                            sportsSuccess = true;
                            break;
                        }
                    } catch (e: any) {
                        console.log(`❌ 访问失败: ${e.message}`);
                    }
                }

                if (!sportsSuccess) {
                    console.log('\n⚠️  所有体育场馆地址都无法访问，请手动检查浏览器');
                }

            } else {
                console.log('⚠️  登录状态不确定，请检查浏览器页面');
            }

            // 保持浏览器打开，让用户可以继续操作
            console.log('💡 浏览器将保持打开90秒，供您手动探索...');
            console.log('📱 请手动访问: https://www.sports.tsinghua.edu.cn/');
            console.log('🔍 并查找场馆预约入口\n');

            await driver.sleep(90000);

        } finally {
            await driver.quit();
            console.log('👋 浏览器已关闭');
        }

    } catch (e: any) {
        console.error('\n❌ 错误:', e.message);
        if (e.stack) {
            console.error('\n堆栈信息:');
            console.error(e.stack.split('\n').slice(0, 10).join('\n'));
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
    quickLoginTest();
}

export { quickLoginTest };