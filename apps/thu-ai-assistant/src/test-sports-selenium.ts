#!/usr/bin/env node
/**
 * 体育场馆Selenium服务测试文件
 * 用于验证基本功能是否正常工作
 */

// Node.js 环境 polyfill
if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = globalThis;
}

import { sportsSeleniumService } from './services/sports-selenium/sports-selenium-service';
import * as readline from 'readline';

/**
 * 创建简单的readline接口
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
 * 测试登录功能
 */
async function testLogin() {
    console.log('\n🧪 测试登录功能...\n');

    const rl = createReadline();

    try {
        const userId = await question(rl, '请输入学号：');
        const password = await question(rl, '请输入密码：');

        console.log('\n开始登录测试...\n');

        const callbacks = {
            onProgress: (msg: string) => console.log(`[进度] ${msg}`),
            onError: (err: string) => console.error(`[错误] ${err}`),
            onSuccess: () => console.log('[成功] 登录成功！'),
            onNeed2FAMethod: async (methods: string[]) => {
                console.log(`\n需要2FA验证，可用方法：${methods.join(', ')}`);
                return methods[0]; // 默认选择第一个方法
            },
            onNeed2FACode: async (method: string) => {
                console.log(`\n使用 ${method} 验证，请查看您的企业微信/手机获取验证码`);
                const code = await question(rl, '请输入验证码：');
                return code;
            },
            onNeedTrustDevice: async () => {
                const answer = await question(rl, '是否信任此设备？(y/n，默认y)：');
                return !answer || answer.toLowerCase() === 'y';
            }
        };

        const success = await sportsSeleniumService.login(
            userId,
            password,
            callbacks,
            false // 不使用无头模式，方便调试
        );

        if (success) {
            console.log('\n✅ 登录测试通过！');
        } else {
            console.log('\n❌ 登录测试失败！');
        }

        return success;
    } catch (e: any) {
        console.error('\n❌ 登录测试异常：', e.message);
        return false;
    } finally {
        rl.close();
    }
}

/**
 * 测试场馆列表功能
 */
async function testGetVenues() {
    console.log('\n🧪 测试获取场馆列表...\n');

    try {
        const venues = sportsSeleniumService.getVenues();
        console.log(`✅ 找到 ${venues.length} 个场馆：`);
        venues.forEach((venue, index) => {
            console.log(`  ${index + 1}. ${venue.name} (gymId: ${venue.gymId}, itemId: ${venue.itemId})`);
        });

        return true;
    } catch (e: any) {
        console.error('\n❌ 获取场馆列表失败：', e.message);
        return false;
    }
}

/**
 * 测试查询功能
 */
async function testQuery() {
    console.log('\n🧪 测试查询场馆功能...\n');

    const rl = createReadline();

    try {
        const venueName = await question(rl, '请输入场馆名称（如：羽毛球）：');
        const date = await question(rl, '请输入日期（如：2026-04-06，直接回车使用今天）：');

        const queryDate = date || new Date().toISOString().split('T')[0];

        console.log(`\n查询 ${venueName} 在 ${queryDate} 的可用时段...\n`);

        const result = await sportsSeleniumService.queryVenue(venueName, queryDate);

        console.log(`\n✅ 查询成功！`);
        console.log(`场馆：${result.venueName}`);
        console.log(`日期：${result.date}`);
        console.log(`最多可预约：${result.maxBookable} 个场地`);
        console.log(`已预约：${result.currentBooked} 个场地`);
        console.log(`联系电话：${result.phone || '暂无'}`);

        if (result.slots.length > 0) {
            console.log(`\n找到 ${result.slots.length} 个时间段：`);
            const availableSlots = result.slots.filter(s => s.available);
            console.log(`其中可用：${availableSlots.length} 个`);

            availableSlots.slice(0, 5).forEach((slot, index) => {
                console.log(`  ${index + 1}. ${slot.time} - ${slot.field} (${slot.price}元)`);
            });

            if (availableSlots.length > 5) {
                console.log(`  ... 还有 ${availableSlots.length - 5} 个可用时段`);
            }
        } else {
            console.log('\n暂无可用时段');
        }

        return true;
    } catch (e: any) {
        console.error('\n❌ 查询失败：', e.message);
        return false;
    } finally {
        rl.close();
    }
}

/**
 * 主测试函数
 */
async function runTests() {
    console.log('\n' + '='.repeat(60));
    console.log('🧪 体育场馆Selenium服务测试');
    console.log('='.repeat(60));

    const rl = createReadline();

    try {
        console.log('\n请选择要测试的功能：');
        console.log('  1. 测试登录');
        console.log('  2. 测试获取场馆列表');
        console.log('  3. 测试查询功能（需要先登录）');
        console.log('  4. 运行所有测试');
        console.log('  5. 退出');

        const choice = await question(rl, '\n请输入选项（1-5）：');

        switch (choice.trim()) {
            case '1':
                await testLogin();
                break;
            case '2':
                await testGetVenues();
                break;
            case '3':
                await testLogin(); // 先确保登录
                await testQuery(); // 然后测试查询
                break;
            case '4':
                console.log('\n运行所有测试...\n');

                // 测试1：获取场馆列表（无需登录）
                console.log('\n' + '-'.repeat(60));
                const test1 = await testGetVenues();

                // 测试2：登录
                console.log('\n' + '-'.repeat(60));
                const test2 = await testLogin();

                // 测试3：查询（需要登录成功）
                console.log('\n' + '-'.repeat(60));
                let test3 = false;
                if (test2) {
                    test3 = await testQuery();
                } else {
                    console.log('\n⏭️  跳过查询测试（登录失败）');
                }

                // 总结
                console.log('\n' + '='.repeat(60));
                console.log('测试结果总结：');
                console.log(`  获取场馆列表：${test1 ? '✅ 通过' : '❌ 失败'}`);
                console.log(`  登录功能：${test2 ? '✅ 通过' : '❌ 失败'}`);
                console.log(`  查询功能：${test3 ? '✅ 通过' : '❌ 失败'}`);
                console.log('='.repeat(60));
                break;
            case '5':
                console.log('\n👋 退出测试');
                break;
            default:
                console.log('\n❌ 无效的选项');
                break;
        }

    } catch (e: any) {
        console.error('\n❌ 测试异常：', e.message);
        if (e.stack) {
            console.error('\n堆栈信息：');
            console.error(e.stack);
        }
    } finally {
        rl.close();

        // 清理资源
        console.log('\n清理资源...');
        await sportsSeleniumService.close();
        console.log('✅ 清理完成');

        console.log('\n测试结束！\n');
        process.exit(0);
    }
}

// 处理异常和信号
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    sportsSeleniumService.close().then(() => process.exit(1));
});

process.on('SIGINT', () => {
    console.log('\n\n收到退出信号，正在清理...');
    sportsSeleniumService.close().then(() => {
        console.log('👋 再见！\n');
        process.exit(0);
    });
});

// 运行测试
if (require.main === module) {
    runTests();
}

export { runTests };
