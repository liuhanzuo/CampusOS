/**
 * 终端登录交互工具
 * 处理用户在终端中的输入，包括2FA验证码
 */

import * as readline from 'readline';
import { LoginCallback } from './sports-selenium-service';

/**
 * 创建readline接口
 */
export function createReadlineInterface(): readline.Interface {
    return readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
}

/**
 * 提问并获取用户输入
 */
function question(rl: readline.Interface, query: string): Promise<string> {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer.trim());
        });
    });
}

/**
 * 显示欢迎信息
 */
export function showWelcome(): void {
    console.log('\n' + '='.repeat(60));
    console.log('🎓 清华大学体育场馆预约系统 - 终端登录工具');
    console.log('='.repeat(60));
    console.log();
}

/**
 * 显示进度信息
 */
export function showProgress(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
}

/**
 * 显示错误信息
 */
export function showError(message: string): void {
    console.error(`\n❌ 错误: ${message}\n`);
}

/**
 * 显示成功信息
 */
export function showSuccess(message: string): void {
    console.log(`\n✅ ${message}\n`);
}

/**
 * 创建登录回调函数
 */
export function createLoginCallbacks(rl: readline.Interface): LoginCallback {
    return {
        onProgress: (message: string) => {
            showProgress(message);
        },

        onError: (error: string) => {
            showError(error);
        },

        onSuccess: () => {
            showSuccess('登录成功！已保存登录状态。');
        },

        onNeed2FAMethod: async (methods: string[]): Promise<string> => {
            console.log('\n📱 需要二次认证，请选择验证方式：');
            console.log('可用的验证方式：');

            const methodMap: Record<string, string> = {
                'wechat': '企业微信',
                'mobile': '手机短信',
                'totp': 'TOTP验证器'
            };

            methods.forEach((method, index) => {
                const methodName = methodMap[method] || method;
                console.log(`  ${index + 1}. ${methodName}`);
            });

            console.log();
            const answer = await question(rl, '请输入选项编号（直接回车默认使用企业微信）：');
            const choice = parseInt(answer) || 1;
            return methods[Math.min(choice - 1, methods.length - 1)];
        },

        onNeed2FACode: async (method: string): Promise<string> => {
            const methodMap: Record<string, string> = {
                'wechat': '企业微信',
                'mobile': '手机短信',
                'totp': 'TOTP验证器'
            };

            const methodName = methodMap[method] || method;

            console.log(`\n🔐 正在使用 ${methodName} 进行验证`);
            console.log('提示：请查看您的企业微信/手机/验证器获取验证码');
            console.log();

            const code = await question(rl, '请输入验证码：');
            return code;
        },

        onNeedTrustDevice: async (): Promise<boolean> => {
            console.log('\n💡 是否信任此设备？');
            console.log('  信任后30天内无需二次验证');
            console.log();

            const answer = await question(rl, '是否信任此设备？(y/n，默认y)：');
            return !answer || answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
        }
    };
}

/**
 * 获取用户凭据
 */
export async function getCredentials(rl: readline.Interface): Promise<{ userId: string; password: string }> {
    console.log('请输入您的清华账号信息：');
    console.log();

    const userId = await question(rl, '学号：');
    const password = await question(rl, '密码：');

    console.log();

    return { userId, password };
}

/**
 * 显示主菜单
 */
export async function showMainMenu(rl: readline.Interface): Promise<string> {
    console.log('\n📋 主菜单：');
    console.log('  1. 查询场馆');
    console.log('  2. 预约场地');
    console.log('  3. 查看场馆列表');
    console.log('  4. 重新登录');
    console.log('  5. 退出');
    console.log();

    const choice = await question(rl, '请选择操作（输入数字）：');
    return choice;
}

/**
 * 获取查询参数
 */
export async function getQueryParams(rl: readline.Interface): Promise<{ venueName: string; date: string }> {
    console.log('\n🔍 查询场地');
    console.log();

    const venueName = await question(rl, '场馆名称（如：羽毛球）：');
    const date = await question(rl, '日期（如：2026-04-06，直接回车使用今天）：');

    const queryDate = date || new Date().toISOString().split('T')[0];

    console.log();
    return { venueName, date: queryDate };
}

/**
 * 显示查询结果
 */
export function displayQueryResults(result: any): void {
    console.log('\n📊 查询结果：');
    console.log(`  场馆：${result.venueName}`);
    console.log(`  日期：${result.date}`);
    console.log(`  可预约数量：${result.maxBookable}`);
    console.log(`  已预约数量：${result.currentBooked}`);
    console.log();

    if (result.slots && result.slots.length > 0) {
        console.log('  可用时段：');
        console.log('  ' + '-'.repeat(50));

        const availableSlots = result.slots.filter((s: any) => s.available);

        if (availableSlots.length === 0) {
            console.log('  暂无可用时段');
        } else {
            availableSlots.forEach((slot: any, index: number) => {
                console.log(`  ${index + 1}. ${slot.time} - ${slot.field}`);
                console.log(`     价格：${slot.price}元`);
            });
        }

        console.log('  ' + '-'.repeat(50));
    } else {
        console.log('  未找到场地信息');
    }

    console.log();
}

/**
 * 获取预约参数
 */
export async function getBookingParams(rl: readline.Interface): Promise<{ venueName: string; date: string; timeSlot: string }> {
    console.log('\n📝 预约场地');
    console.log();

    const venueName = await question(rl, '场馆名称（如：羽毛球）：');
    const date = await question(rl, '日期（如：2026-04-06，直接回车使用今天）：');
    const timeSlot = await question(rl, '时间段（如：18:00）：');

    const bookingDate = date || new Date().toISOString().split('T')[0];

    console.log();
    return { venueName, date: bookingDate, timeSlot };
}

/**
 * 显示预约结果
 */
export function displayBookingResult(result: any): void {
    if (result.success) {
        showSuccess(`预约成功！订单号：${result.orderId}`);
        if (result.paymentUrl) {
            console.log(`💳 支付链接：${result.paymentUrl}`);
            console.log();
        }
    } else {
        showError(result.message || '预约失败');
    }
}

/**
 * 显示场馆列表
 */
export function displayVenueList(venues: any[]): void {
    console.log('\n🏟️  体育场馆列表：');
    console.log();

    venues.forEach((venue, index) => {
        console.log(`  ${index + 1}. ${venue.name}`);
        console.log(`     场馆ID：${venue.gymId}`);
        console.log(`     项目ID：${venue.itemId}`);
        console.log();
    });
}

/**
 * 确认退出
 */
export async function confirmExit(rl: readline.Interface): Promise<boolean> {
    console.log();
    const answer = await question(rl, '确认退出？(y/n)：');
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

/**
 * 关闭readline接口
 */
export function closeReadline(rl: readline.Interface): void {
    rl.close();
}

/**
 * 继续提示
 */
export async function promptContinue(rl: readline.Interface): Promise<void> {
    console.log();
    await question(rl, '按回车键继续...');
}

/**
 * 显示使用说明
 */
export function showUsage(): void {
    console.log(`
📖 使用说明：

1. 登录：输入您的清华学号和密码
2. 二次认证：如果启用了二次认证，会提示您输入验证码
   - 企业微信：查看您的企业微信获取验证码
   - 手机短信：查看您的手机短信
   - TOTP：使用您的验证器应用（如Google Authenticator）

3. 查询场地：选择场馆和日期查看可用时段
4. 预约场地：选择合适的时间段进行预约

⚠️  注意事项：
   - 首次登录需要完成二次认证
   - 可以选择信任设备，30天内无需二次验证
   - 登录状态会保存，下次使用无需重新登录
   - 如需重新登录，请选择"重新登录"选项

💡 提示：
   - 支持模糊搜索场馆名称（如输入"羽毛球"可匹配所有羽毛球馆）
   - 日期格式：YYYY-MM-DD（如：2026-04-06）
   - 时间段格式：HH:MM（如：18:00）

`);
}

/**
 * 清屏
 */
export function clearScreen(): void {
    console.clear();
}