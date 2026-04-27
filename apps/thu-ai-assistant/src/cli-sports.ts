#!/usr/bin/env node
/**
 * 体育场馆预约命令行工具
 * 可以在终端中完成登录、查询、预约等操作
 */

import * as readline from 'readline';

if (typeof globalThis.window === "undefined") {
    (globalThis as any).window = globalThis;
}
import { sportsSeleniumService } from './services/sports-selenium/sports-selenium-service';
import {
    createReadlineInterface,
    createLoginCallbacks,
    showWelcome,
    showUsage,
    showMainMenu,
    getCredentials,
    getQueryParams,
    displayQueryResults,
    getBookingParams,
    displayBookingResult,
    displayVenueList,
    confirmExit,
    closeReadline,
    promptContinue,
    clearScreen
} from './terminal-login';

/**
 * 主函数
 */
async function main() {
    const rl = createReadlineInterface();

    try {
        clearScreen();
        showWelcome();
        showUsage();

        // 获取用户凭据
        const { userId, password } = await getCredentials(rl);

        if (!userId || !password) {
            console.error('❌ 学号和密码不能为空');
            closeReadline(rl);
            process.exit(1);
        }

        // 创建登录回调
        const callbacks = createLoginCallbacks(rl);

        // 登录体育系统
        clearScreen();
        showWelcome();
        console.log('正在登录体育系统...\n');

        const loginSuccess = await sportsSeleniumService.login(
            userId,
            password,
            callbacks,
            false // 不使用无头模式，让用户看到登录过程
        );

        if (!loginSuccess) {
            console.error('❌ 登录失败，请检查您的凭据');
            closeReadline(rl);
            process.exit(1);
        }

        // 主循环
        let running = true;
        while (running) {
            const choice = await showMainMenu(rl);

            switch (choice.trim()) {
                case '1': // 查询场馆
                    {
                        const queryParams = await getQueryParams(rl);
                        try {
                            const result = await sportsSeleniumService.queryVenue(
                                queryParams.venueName,
                                queryParams.date,
                                userId, password, callbacks  // 传递凭据以处理登录过期
                            );
                            displayQueryResults(result);
                        } catch (e: any) {
                            console.error(`❌ 查询失败: ${e.message}`);
                        }
                        await promptContinue(rl);
                    }
                    break;

                case '2': // 预约场地
                    {
                        const bookingParams = await getBookingParams(rl);
                        try {
                            const result = await sportsSeleniumService.bookVenue(
                                bookingParams.venueName,
                                bookingParams.date,
                                bookingParams.timeSlot,
                                userId, password, callbacks  // 传递凭据以处理登录过期
                            );
                            displayBookingResult(result);
                        } catch (e: any) {
                            console.error(`❌ 预约失败: ${e.message}`);
                        }
                        await promptContinue(rl);
                    }
                    break;

                case '3': // 查看场馆列表
                    {
                        const venues = sportsSeleniumService.getVenues();
                        displayVenueList(venues);
                        await promptContinue(rl);
                    }
                    break;

                case '4': // 重新登录
                    {
                        const newCredentials = await getCredentials(rl);
                        try {
                            clearScreen();
                            showWelcome();
                            console.log('正在重新登录...\n');

                            const newLoginSuccess = await sportsSeleniumService.login(
                                newCredentials.userId,
                                newCredentials.password,
                                callbacks,
                                false
                            );

                            if (newLoginSuccess) {
                                console.log('✅ 重新登录成功！');
                            } else {
                                console.error('❌ 重新登录失败');
                            }
                        } catch (e: any) {
                            console.error(`❌ 重新登录失败: ${e.message}`);
                        }
                        await promptContinue(rl);
                    }
                    break;

                case '5': // 退出
                    {
                        const shouldExit = await confirmExit(rl);
                        if (shouldExit) {
                            running = false;
                        }
                    }
                    break;

                default:
                    console.log('❌ 无效的选项，请重新选择');
                    await promptContinue(rl);
                    break;
            }

            clearScreen();
            showWelcome();
        }

        // 关闭浏览器
        await sportsSeleniumService.close();
        console.log('👋 感谢使用，再见！\n');

    } catch (e: any) {
        console.error('\n❌ 程序异常退出:', e.message);
        if (e.stack) {
            console.error('\n堆栈信息:');
            console.error(e.stack);
        }
    } finally {
        closeReadline(rl);
        process.exit(0);
    }
}

// 处理未捕获的异常
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// 信号处理
process.on('SIGINT', () => {
    console.log('\n\n收到退出信号，正在清理...');
    sportsSeleniumService.close().then(() => {
        console.log('👋 再见！\n');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n\n收到退出信号，正在清理...');
    sportsSeleniumService.close().then(() => {
        console.log('👋 再见！\n');
        process.exit(0);
    });
});

// 启动程序
if (require.main === module) {
    main();
}

export { main };
