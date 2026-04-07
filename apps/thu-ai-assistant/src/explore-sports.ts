#!/usr/bin/env node
/**
 * 体育场馆URL探索工具
 * 用于找到正确的清华体育场馆入口
 */

declare global {
  var window: unknown;
}

if (typeof globalThis.window === "undefined") {
    globalThis.window = globalThis;
}

import * as readline from 'readline';
import { Builder, Browser, By, until, Key } from 'selenium-webdriver';
import { Options } from 'selenium-webdriver/chrome';

function createReadline(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer.trim());
        });
    });
}

async function exploreSportsUrls() {
    const rl = createReadline();

    try {
        console.log('\n🔍 清华体育场馆URL探索工具\n');

        const userId = await question(rl, '请输入学号（可选，直接回车跳过）：');
        const password = await question(rl, '请输入密码（可选，直接回车跳过）：');

        const needLogin = userId && password;

        console.log('\n正在启动浏览器...\n');

        const options = new Options()
            .addArguments('--disable-gpu')
            .addArguments('--no-sandbox')
            .addArguments('--disable-dev-shm-usage');

        const driver = await new Builder()
            .forBrowser(Browser.CHROME)
            .setChromeOptions(options as any)
            .build();

        console.log('✅ 浏览器启动成功\n');

        try {
            // 如果需要登录
            if (needLogin) {
                console.log('📝 先进行登录...');
                await driver.get('https://id.tsinghua.edu.cn/');
                await driver.sleep(2000);

                // 输入学号
                try {
                    const userIdInput = await driver.findElement(By.name('i_user'));
                    await userIdInput.clear();
                    await userIdInput.sendKeys(userId);
                    console.log('✅ 学号输入成功');

                    const passwordInput = await driver.findElement(By.name('i_pass'));
                    await passwordInput.clear();
                    await passwordInput.sendKeys(password);
                    console.log('✅ 密码输入成功');

                    // 提交登录
                    const loginButtons = await driver.findElements(By.css('button[type="submit"]'));
                    if (loginButtons.length > 0) {
                        await loginButtons[0].click();
                        console.log('✅ 登录按钮已点击');

                        await driver.sleep(5000);

                        // 检查是否需要2FA
                        const currentUrl = await driver.getCurrentUrl();
                        if (currentUrl.includes('2fa') || currentUrl.includes('totp')) {
                            console.log('🔐 需要二次认证');
                            const code = await question(rl, '请输入验证码：');

                            const codeInputs = await driver.findElements(By.css('input[name="vericode"]'));
                            if (codeInputs.length > 0) {
                                await codeInputs[0].clear();
                                await codeInputs[0].sendKeys(code);

                                const submitBtns = await driver.findElements(By.css('button[type="submit"]'));
                                if (submitBtns.length > 0) {
                                    await submitBtns[0].click();
                                }
                            }
                        }
                    }
                } catch (e: any) {
                    console.log('⚠️  登录过程出现问题:', e.message);
                }
            }

            console.log('\n🔍 开始探索体育场馆URL...\n');

            // 测试多个可能的体育场馆URL
            const sportsUrls = [
                'https://www.sports.tsinghua.edu.cn/',
                'https://www.sports.tsinghua.edu.cn/venue/',
                'https://www.sports.tsinghua.edu.cn/venue/booking.html',
                'https://www.sports.tsinghua.edu.cn/venue/gymnasium',
                'https://www.sports.tsinghua.edu.cn/venue/site/',
                'https://sports.tsinghua.edu.cn/',
                'https://id.tsinghua.edu.cn/f/oauth2/authorize?client_id=sports&redirect_uri=https://www.sports.tsinghua.edu.cn/venue/'
            ];

            for (let i = 0; i < sportsUrls.length; i++) {
                const url = sportsUrls[i];
                console.log(`\n📍 测试URL (${i+1}/${sportsUrls.length}): ${url}`);

                try {
                    await driver.get(url);
                    await driver.sleep(3000);

                    const currentUrl = await driver.getCurrentUrl();
                    const pageTitle = await driver.getTitle();
                    const pageSource = await driver.getPageSource();

                    console.log(`  到达页面: ${currentUrl}`);
                    console.log(`  页面标题: ${pageTitle}`);

                    // 检查页面内容
                    if (pageSource.includes('场馆') || pageSource.includes('预约') || pageSource.includes('预订')) {
                        console.log('  ✅ 包含场馆/预约相关内容');

                        // 查找可能的预约链接
                        const bookingLinks = await driver.findElements(By.css('a[href*="booking"], a[href*="venue"], a:contains("预约"), a:contains("预订")'));
                        console.log(`  找到 ${bookingLinks.length} 个可能的预约链接`);

                        for (let j = 0; j < Math.min(bookingLinks.length, 3); j++) {
                            try {
                                const linkText = await bookingLinks[j].getText();
                                const linkHref = await bookingLinks[j].getAttribute('href');
                                console.log(`    - ${linkText}: ${linkHref}`);
                            } catch (e) {
                                // 忽略无法读取的链接
                            }
                        }
                    } else if (currentUrl.includes('id.tsinghua.edu.cn')) {
                        console.log('  ⚠️  跳转回了认证页面，可能需要特殊处理');
                    } else {
                        console.log('  ❓ 未发现明显的场馆内容');
                    }

                } catch (e: any) {
                    console.log(`  ❌ 访问失败: ${e.message}`);
                }
            }

            console.log('\n\n📋 探索完成！');
            console.log('💡 浏览器将保持打开120秒，供您手动探索...');
            console.log('🔍 建议手动访问这些URL并记录结果：');
            console.log('   1. https://www.sports.tsinghua.edu.cn/');
            console.log('   2. https://www.sports.tsinghua.edu.cn/venue/');
            console.log('   3. 在浏览器开发者工具中查看Network标签\n');

            await driver.sleep(120000);

        } finally {
            await driver.quit();
            console.log('👋 浏览器已关闭');
        }

    } catch (e: any) {
        console.error('\n❌ 错误:', e.message);
    } finally {
        rl.close();
        console.log('\n探索结束\n');
        process.exit(0);
    }
}

// 运行探索
if (require.main === module) {
    exploreSportsUrls();
}

export { exploreSportsUrls };