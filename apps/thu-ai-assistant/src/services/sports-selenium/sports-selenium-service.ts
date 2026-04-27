/**
 * 体育场馆 Selenium 服务
 * 使用 Selenium WebDriver 自动化清华大学体育场馆预约系统
 */

import { Builder, Browser, By, until, WebDriver, WebElement, Key } from 'selenium-webdriver';
import { Options as ChromeOptions } from 'selenium-webdriver/chrome';
import * as fs from 'fs';
import * as path from 'path';

// 体育场馆信息
export interface SportsVenue {
    name: string;
    gymId: string;
    itemId: string;
}

// 时间段信息
export interface TimeSlot {
    time: string;
    field: string;
    available: boolean;
    price: number;
    bookId?: string;
}

// 查询结果
export interface QueryResult {
    venueName: string;
    date: string;
    maxBookable: number;
    currentBooked: number;
    phone: string;
    slots: TimeSlot[];
}

// 预约结果
export interface BookingResult {
    success: boolean;
    message: string;
    orderId?: string;
    paymentUrl?: string;
}

// 登录状态回调
export type LoginCallback = {
    onNeed2FAMethod?: (methods: string[]) => Promise<string>;
    onNeed2FACode?: (method: string) => Promise<string>;
    onNeedTrustDevice?: () => Promise<boolean>;
    onProgress?: (message: string) => void;
    onError?: (error: string) => void;
    onSuccess?: () => void;
};

/**
 * 体育场馆 Selenium 服务类
 */
export class SportsSeleniumService {
    private driver: WebDriver | null = null;
    private isLoggedIn: boolean = false;
    private appRoot = path.join(__dirname, '..', '..', '..');
    private cookieDir = path.join(this.appRoot, '.cookies');
    private cookieFile = path.join(this.cookieDir, 'sports-cookies.json');

    // 体育场馆列表
    private venues: SportsVenue[] = [
        { name: "气膜馆羽毛球场", gymId: "3998000", itemId: "4045681" },
        { name: "气膜馆乒乓球场", gymId: "3998000", itemId: "4037036" },
        { name: "综体篮球场", gymId: "4797914", itemId: "4797898" },
        { name: "综体羽毛球场", gymId: "4797914", itemId: "4797899" },
        { name: "西体羽毛球场", gymId: "4836273", itemId: "4836196" },
        { name: "西体台球", gymId: "4836273", itemId: "14567218" },
        { name: "紫荆网球场", gymId: "5843934", itemId: "5845263" },
        { name: "西网球场", gymId: "5843934", itemId: "10120539" },
    ];

    /**
     * 初始化浏览器驱动
     */
    private async initDriver(headless: boolean = true): Promise<WebDriver> {
        if (this.driver) {
            return this.driver;
        }

        this.log('正在启动 Chrome 浏览器...');

        const options = new ChromeOptions();

        // 基本设置
        if (headless) {
            options.addArguments('--headless');
        }

        options
            .addArguments('--disable-gpu')
            .addArguments('--disable-extensions')
            .addArguments('--disable-dev-shm-usage')
            .addArguments('--no-sandbox')
            .addArguments('--disable-blink-features=AutomationControlled')
            .addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            .excludeSwitches('enable-automation');

        this.driver = await new Builder()
            .forBrowser(Browser.CHROME)
            .setChromeOptions(options)
            .build();

        // 设置隐式等待
        await this.driver.manage().setTimeouts({ implicit: 10000 });

        this.log('浏览器启动成功');

        // 尝试加载已保存的cookies
        await this.loadCookies();

        return this.driver;
    }

    /**
     * 日志输出
     */
    private log(message: string): void {
        console.log(`[Selenium] ${message}`);
    }

    /**
     * 确保cookie目录存在
     */
    private ensureCookieDir(): void {
        if (!fs.existsSync(this.cookieDir)) {
            fs.mkdirSync(this.cookieDir, { recursive: true });
        }
    }

    /**
     * 保存cookies到文件
     */
    private async saveCookies(): Promise<void> {
        if (!this.driver) return;

        try {
            this.ensureCookieDir();
            const cookies = await this.driver.manage().getCookies();
            fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2));
            this.log(`已保存 ${cookies.length} 个 cookies`);
        } catch (e: any) {
            this.log(`保存cookies失败: ${e.message}`);
        }
    }

    /**
     * 从文件加载cookies
     */
    private async loadCookies(): Promise<void> {
        if (!this.driver || !fs.existsSync(this.cookieFile)) {
            return;
        }

        try {
            const cookies = JSON.parse(fs.readFileSync(this.cookieFile, 'utf-8'));
            const baseUrl = 'https://www.sports.tsinghua.edu.cn';

            // 先访问基础URL以设置domain
            await this.driver.get(baseUrl);
            await this.driver.sleep(500);

            // 恢复cookies
            let loadedCount = 0;
            for (const cookie of cookies) {
                try {
                    await this.driver.manage().addCookie(cookie);
                    loadedCount++;
                } catch (e) {
                    // 某些cookie可能已过期或无效，忽略
                }
            }

            this.log(`已加载 ${loadedCount}/${cookies.length} 个 cookies`);
        } catch (e: any) {
            this.log(`加载cookies失败: ${e.message}`);
        }
    }

    /**
     * 清除cookies
     */
    private async clearCookies(): Promise<void> {
        if (!this.driver) return;

        try {
            await this.driver.manage().deleteAllCookies();
            this.log('已清除所有 cookies');

            if (fs.existsSync(this.cookieFile)) {
                fs.unlinkSync(this.cookieFile);
                this.log('已删除 cookies 文件');
            }
        } catch (e: any) {
            this.log(`清除cookies失败: ${e.message}`);
        }
    }

    /**
     * 等待元素出现
     */
    private async waitForElement(selector: string, timeout: number = 10000): Promise<WebElement> {
        if (!this.driver) throw new Error('Driver not initialized');

        return await this.driver.wait(until.elementLocated(By.css(selector)), timeout);
    }

    /**
     * 等待URL包含特定字符串
     */
    private async waitForUrl(expected: string, timeout: number = 15000): Promise<boolean> {
        if (!this.driver) throw new Error('Driver not initialized');

        return await this.driver.wait(async () => {
            const url = await this.driver!.getCurrentUrl();
            return url.includes(expected);
        }, timeout);
    }

    /**
     * 检查是否已登录（增强版）
     */
    private async checkLoginStatus(): Promise<boolean> {
        if (!this.driver) return false;

        try {
            const currentUrl = await this.driver.getCurrentUrl();

            // 如果在体育系统页面且不在登录页，认为已登录
            if (currentUrl.includes('sports.tsinghua.edu.cn') &&
                !currentUrl.includes('login') &&
                !currentUrl.includes('cas')) {

                // 进一步检查：尝试访问需要登录的页面
                try {
                    await this.driver.get('https://www.sports.tsinghua.edu.cn/venue/api/user/info');
                    await this.driver.sleep(1000);
                    const pageSource = await this.driver.getPageSource();

                    // 如果包含登录过期错误，清除cookies并重新登录
                    if (pageSource.includes('登录过期') ||
                        pageSource.includes('1130002') ||
                        pageSource.includes('请重新登录')) {
                        this.log('检测到登录过期，清除cookies');
                        await this.clearCookies();
                        return false;
                    }

                    return true;
                } catch (e) {
                    // API访问失败，可能需要重新登录
                    return false;
                }
            }

            // 检查页面中是否有登录按钮
            const loginButtons = await this.driver.findElements(By.css('a[href*="login"], .login-btn'));
            return loginButtons.length === 0;
        } catch (e) {
            return false;
        }
    }

    /**
     * 处理二次认证
     */
    private async handleTwoFactorAuth(callbacks: LoginCallback): Promise<boolean> {
        if (!this.driver) return false;

        try {
            this.log('检测到二次认证...');

            // 等待2FA页面加载
            await this.driver.sleep(2000);

            // 查找可用的2FA方法
            const methods: string[] = [];
            const methodElements = await this.driver.findElements(By.css('input[name="type"], .2fa-method, [class*="auth-method"]'));

            for (const elem of methodElements) {
                const value = await elem.getAttribute('value');
                const text = await elem.getText();
                const label = await elem.findElement(By.xpath('..')).getText().catch(() => '');

                if (value) {
                    methods.push(value);
                } else if (label.includes('微信')) {
                    methods.push('wechat');
                } else if (label.includes('手机') || label.includes('短信')) {
                    methods.push('mobile');
                } else if (label.includes('TOTP') || label.includes('验证器')) {
                    methods.push('totp');
                }
            }

            // 如果没有找到方法选择器，可能直接在验证码页面
            if (methods.length === 0) {
                // 检查是否有验证码输入框
                const codeInput = await this.driver.findElements(By.css('input[name="vericode"], input[name="code"], input[type="text"]'));
                if (codeInput.length > 0) {
                    methods.push('wechat'); // 默认使用微信
                }
            }

            this.log(`可用的2FA方法: ${methods.join(', ')}`);

            // 获取用户选择的方法
            let selectedMethod = 'wechat'; // 默认微信
            if (callbacks.onNeed2FAMethod && methods.length > 1) {
                selectedMethod = await callbacks.onNeed2FAMethod(methods);
                this.log(`用户选择了: ${selectedMethod}`);
            }

            // 如果需要选择方法
            if (methods.length > 1) {
                const methodRadio = await this.driver.findElements(By.css(`input[value="${selectedMethod}"]`));
                if (methodRadio.length > 0) {
                    await methodRadio[0].click();
                    await this.driver.sleep(500);

                    // 点击发送验证码按钮
                    const sendBtn = await this.driver.findElements(By.css('button[type="submit"], .send-code-btn'));
                    if (sendBtn.length > 0) {
                        await sendBtn[0].click();
                        await this.driver.sleep(1000);
                    }
                }
            }

            // 获取验证码
            if (callbacks.onNeed2FACode) {
                const code = await callbacks.onNeed2FACode(selectedMethod);
                this.log(`收到验证码: ${code.substring(0, 2)}***`);

                // 输入验证码
                const codeInputs = await this.driver.findElements(By.css('input[name="vericode"], input[name="code"], input[type="text"]'));
                for (const input of codeInputs) {
                    try {
                        await input.clear();
                        await input.sendKeys(code);
                        break;
                    } catch (e) {
                        // 尝试下一个输入框
                    }
                }

                await this.driver.sleep(500);

                // 提交验证码
                const submitBtns = await this.driver.findElements(By.css('button[type="submit"], input[type="submit"], .confirm-btn'));
                for (const btn of submitBtns) {
                    try {
                        const btnText = await btn.getText();
                        const btnVisible = await btn.isDisplayed();
                        if (btnVisible && (btnText.includes('确定') || btnText.includes('提交') || btnText.includes('验证'))) {
                            await btn.click();
                            break;
                        }
                    } catch (e) {
                        // 尝试下一个按钮
                    }
                }

                await this.driver.sleep(2000);
            }

            // 检查是否需要信任设备
            const trustElements = await this.driver.findElements(By.css('input[name="trust"], input[type="checkbox"], .trust-device'));
            if (trustElements.length > 0 && callbacks.onNeedTrustDevice) {
                const trust = await callbacks.onNeedTrustDevice();
                if (trust) {
                    try {
                        await trustElements[0].click();
                        await this.driver.sleep(500);

                        // 提交信任设备选择
                        const confirmBtns = await this.driver.findElements(By.css('button[type="submit"]'));
                        for (const btn of confirmBtns) {
                            try {
                                if (await btn.isDisplayed()) {
                                    await btn.click();
                                    break;
                                }
                            } catch (e) {}
                        }
                    } catch (e: any) {
                        this.log(`设置信任设备失败: ${e.message}`);
                    }
                }
            }

            return true;
        } catch (e: any) {
            this.log(`处理二次认证失败: ${e.message}`);
            if (callbacks.onError) {
                callbacks.onError(`二次认证失败: ${e.message}`);
            }
            return false;
        }
    }

    /**
     * 登录体育系统（增强版）
     */
    async login(userId: string, password: string, callbacks: LoginCallback = {}, headless: boolean = true, forceRelogin: boolean = false): Promise<boolean> {
        const driver = await this.initDriver(headless);

        try {
            callbacks.onProgress?.('开始登录流程...');

            // 如果需要强制重新登录，清除cookies
            if (forceRelogin) {
                callbacks.onProgress?.('清除旧登录状态...');
                await this.clearCookies();
            }

            // 访问体育系统首页
            await driver.get('https://www.sports.tsinghua.edu.cn/');
            await driver.sleep(2000);

            // 检查是否已登录（如果不是强制重新登录）
            const alreadyLoggedIn = !forceRelogin && await this.checkLoginStatus();
            if (alreadyLoggedIn) {
                this.log('已处于登录状态');
                this.isLoggedIn = true;
                callbacks.onSuccess?.();
                return true;
            }

            // 查找并点击登录按钮
            callbacks.onProgress?.('查找登录入口...');
            const loginSelectors = [
                'a[href*="login"]',
                '.login-btn',
                'button:contains("登录")',
                '[class*="login"]'
            ];

            let loginClicked = false;
            for (const selector of loginSelectors) {
                try {
                    const loginBtn = await driver.findElements(By.css(selector));
                    if (loginBtn.length > 0 && await loginBtn[0].isDisplayed()) {
                        await loginBtn[0].click();
                        loginClicked = true;
                        break;
                    }
                } catch (e) {
                    // 尝试下一个选择器
                }
            }

            if (!loginClicked) {
                // 直接访问登录页面
                this.log('未找到登录按钮，直接访问登录页面');
                await driver.get('https://www.sports.tsinghua.edu.cn/venue/login.html');
                await driver.sleep(3000);
            }

            // 检查当前URL和页面状态
            let pageUrl = await driver.getCurrentUrl();
            this.log(`当前页面URL: ${pageUrl}`);

            // 等待跳转到统一认证页面或检查是否已经在认证页面
            callbacks.onProgress?.('等待统一认证页面...');

            // 给页面更多时间加载，尝试多个认证地址
            let onAuthPage = false;
            let triedUrls = 0;
            const maxAttempts = 4;

            const authUrls = [
                'https://id.tsinghua.edu.cn/',
                'https://oauth.tsinghua.edu.cn/',
                'https://webvpn.tsinghua.edu.cn/'
            ];

            for (let i = 0; i < maxAttempts; i++) {
                await driver.sleep(2000);
                const url = await driver.getCurrentUrl();
                this.log(`检查URL (${i+1}/${maxAttempts}): ${url}`);

                if (url.includes('id.tsinghua.edu.cn') ||
                    url.includes('oauth.tsinghua.edu.cn') ||
                    url.includes('webvpn.tsinghua.edu.cn')) {
                    onAuthPage = true;
                    break;
                }

                // 如果还在体育系统页面，尝试其他认证地址
                if ((url.includes('sports.tsinghua.edu.cn') || i === 0) && triedUrls < authUrls.length) {
                    this.log(`尝试认证地址 (${triedUrls+1}): ${authUrls[triedUrls]}`);
                    try {
                        await driver.get(authUrls[triedUrls]);
                        triedUrls++;
                    } catch (e: any) {
                        this.log(`访问认证地址失败: ${e.message}`);
                    }
                }
            }

            if (!onAuthPage) {
                // 截图用于调试
                await this.screenshot('no-auth-page.png');
                const finalUrl = await driver.getCurrentUrl();

                throw new Error(`未能跳转到统一认证页面，当前URL: ${finalUrl}\n` +
                    `可能原因：\n` +
                    `1. 网络连接问题（需要VPN或校园网）\n` +
                    `2. 清华认证服务器暂时不可用\n` +
                    `3. 页面结构发生变化\n\n` +
                    `请检查网络连接后重试`);
            }

            callbacks.onProgress?.('输入账号密码...');

            // 等待页面完全加载
            await driver.sleep(2000);

            // 尝试多种方式找到用户名输入框
            let userIdInput = await driver.findElements(By.name('i_user'));
            if (userIdInput.length === 0) {
                userIdInput = await driver.findElements(By.name('username'));
            }
            if (userIdInput.length === 0) {
                userIdInput = await driver.findElements(By.css('input[placeholder*="学号"], input[placeholder*="用户名"], input[type="text"]'));
            }

            if (userIdInput.length === 0) {
                // 如果还是找不到，截图并抛出错误
                await this.screenshot('no-username-input.png');
                throw new Error('无法找到学号输入框，请检查页面是否正确加载');
            }

            this.log(`找到学号输入框，正在输入学号...`);
            await userIdInput[0].clear();
            await userIdInput[0].sendKeys(userId);
            await driver.sleep(500);

            // 尝试多种方式找到密码输入框
            let passwordInput = await driver.findElements(By.name('i_pass'));
            if (passwordInput.length === 0) {
                passwordInput = await driver.findElements(By.name('password'));
            }
            if (passwordInput.length === 0) {
                passwordInput = await driver.findElements(By.css('input[type="password"]'));
            }

            if (passwordInput.length === 0) {
                await this.screenshot('no-password-input.png');
                throw new Error('无法找到密码输入框，请检查页面是否正确加载');
            }

            this.log(`找到密码输入框，正在输入密码...`);
            await passwordInput[0].clear();
            await passwordInput[0].sendKeys(password);
            await driver.sleep(1000);

            // 点击登录按钮
            this.log(`查找登录按钮...`);
            const submitSelectors = [
                'button[type="submit"]',
                'input[type="submit"]',
                '.login-btn',
                '#login',
                'button:contains("登录")'
            ];

            let submitClicked = false;
            for (const selector of submitSelectors) {
                try {
                    const submitBtns = await driver.findElements(By.css(selector));
                    this.log(`选择器 "${selector}" 找到 ${submitBtns.length} 个元素`);

                    for (const btn of submitBtns) {
                        try {
                            const isVisible = await btn.isDisplayed();
                            const isEnabled = await btn.isEnabled();
                            this.log(`按钮可见: ${isVisible}, 可用: ${isEnabled}`);

                            if (isVisible && isEnabled) {
                                const btnText = await btn.getText();
                                this.log(`点击登录按钮: "${btnText}"`);
                                await btn.click();
                                submitClicked = true;
                                await driver.sleep(3000);
                                break;
                            }
                        } catch (e: any) {
                            this.log(`点击按钮失败: ${e.message}`);
                        }
                    }
                    if (submitClicked) break;
                } catch (e: any) {
                    this.log(`选择器 "${selector}" 失败: ${e.message}`);
                }
            }

            if (!submitClicked) {
                // 如果找不到按钮，尝试按回车键提交
                this.log(`未找到登录按钮，尝试按回车键提交`);
                await passwordInput[0].sendKeys(Key.ENTER);
                await driver.sleep(3000);
            }

            // 检查是否需要二次认证
            await driver.sleep(3000);
            const loginUrl = await driver.getCurrentUrl();

            if (loginUrl.includes('2fa') || loginUrl.includes('totp') || loginUrl.includes('verify')) {
                callbacks.onProgress?.('需要二次认证...');
                const authSuccess = await this.handleTwoFactorAuth(callbacks);
                if (!authSuccess) {
                    throw new Error('二次认证失败');
                }
            }

            // 等待登录完成
            callbacks.onProgress?.('等待登录完成...');
            const loginSuccess = await this.waitForUrl('sports.tsinghua.edu.cn', 30000);

            if (!loginSuccess) {
                // 检查是否有错误信息
                const errorElements = await driver.findElements(By.css('.error, .alert, [class*="error"]'));
                if (errorElements.length > 0) {
                    const errorText = await errorElements[0].getText();
                    throw new Error(errorText || '登录失败');
                }
                throw new Error('登录超时或失败');
            }

            this.log('登录成功！');
            this.isLoggedIn = true;

            // 保存cookies
            await this.saveCookies();

            callbacks.onSuccess?.();
            return true;

        } catch (e: any) {
            this.log(`登录失败: ${e.message}`);
            this.isLoggedIn = false;

            if (callbacks.onError) {
                callbacks.onError(e.message);
            }

            throw e;
        }
    }

    /**
     * 获取场馆列表
     */
    getVenues(): SportsVenue[] {
        return this.venues;
    }

    /**
     * 查询场馆可用时段（增强版，自动处理登录过期）
     */
    async queryVenue(venueName: string, date: string, userId?: string, password?: string, callbacks?: LoginCallback): Promise<QueryResult> {
        const driver = await this.initDriver();

        // 检查登录状态，如果过期则自动重新登录
        if (userId && password && callbacks) {
            const isLoggedIn = await this.ensureLoggedIn(userId, password, callbacks);
            if (!isLoggedIn) {
                throw new Error('登录失败，请检查账号密码');
            }
        } else if (!this.isLoggedIn) {
            throw new Error('请先登录');
        }

        try {
            // 查找匹配的场馆
            const venue = this.venues.find(v =>
                v.name.includes(venueName) ||
                venueName.includes(v.name.split(' ')[0]) ||
                venueName.includes('羽毛球') && v.name.includes('羽毛球') ||
                venueName.includes('篮球') && v.name.includes('篮球') ||
                venueName.includes('乒乓球') && v.name.includes('乒乓球') ||
                venueName.includes('台球') && v.name.includes('台球') ||
                venueName.includes('网球') && v.name.includes('网球')
            );

            if (!venue) {
                throw new Error(`未找到场馆: ${venueName}`);
            }

            this.log(`查询场馆: ${venue.name}, 日期: ${date}`);

            // 访问预约页面
            const bookingUrl = `https://www.sports.tsinghua.edu.cn/venue/booking?gymnasium_id=${venue.gymId}&item_id=${venue.itemId}&date=${date}`;
            await driver.get(bookingUrl);

            // 等待页面加载
            await driver.sleep(3000);

            // 提取场地信息
            const slots: TimeSlot[] = [];

            try {
                // 尝试多种选择器来获取场地信息
                const slotSelectors = [
                    '.time-slot',
                    '.booking-slot',
                    '.field-item',
                    'tr[data-field]',
                    '[class*="slot"]',
                    '[class*="field"]'
                ];

                let slotElements: WebElement[] = [];
                for (const selector of slotSelectors) {
                    const elements = await driver.findElements(By.css(selector));
                    if (elements.length > 0) {
                        slotElements = elements;
                        break;
                    }
                }

                this.log(`找到 ${slotElements.length} 个场地信息`);

                for (const element of slotElements) {
                    try {
                        const text = await element.getText();
                        const className = await element.getAttribute('class') || '';

                        // 检查是否可用
                        const isDisabled = className.includes('disabled') ||
                                         className.includes('booked') ||
                                         text.includes('已约');

                        // 提取价格
                        const priceMatch = text.match(/(\d+)元/);
                        const price = priceMatch ? parseInt(priceMatch[1]) : 0;

                        // 提取时间和场地名
                        const lines = text.split('\n').filter(l => l.trim());
                        const time = lines[0] || '';
                        const field = lines[1] || '';

                        if (time && !time.includes('查看')) {
                            slots.push({
                                time: time.trim(),
                                field: field.trim(),
                                available: !isDisabled,
                                price
                            });
                        }
                    } catch (e) {
                        // 忽略无法解析的元素
                    }
                }
            } catch (e: any) {
                this.log(`解析场地信息失败: ${e.message}`);
            }

            // 尝试获取限制信息
            let maxBookable = 3;
            let currentBooked = 0;
            let phone = '';

            try {
                const limitElements = await driver.findElements(By.css('[class*="limit"], [class*="count"]'));
                for (const elem of limitElements) {
                    const text = await elem.getText();
                    const countMatch = text.match(/(\d+)/);
                    if (countMatch) {
                        maxBookable = parseInt(countMatch[1]);
                    }
                }
            } catch (e) {}

            return {
                venueName: venue.name,
                date,
                maxBookable,
                currentBooked,
                phone,
                slots
            };

        } catch (e: any) {
            this.log(`查询失败: ${e.message}`);
            throw e;
        }
    }

    /**
     * 预约场地（增强版，自动处理登录过期）
     */
    async bookVenue(venueName: string, date: string, timeSlot: string, userId?: string, password?: string, callbacks?: LoginCallback): Promise<BookingResult> {
        const driver = await this.initDriver();

        // 检查登录状态，如果过期则自动重新登录
        if (userId && password && callbacks) {
            const isLoggedIn = await this.ensureLoggedIn(userId, password, callbacks);
            if (!isLoggedIn) {
                return {
                    success: false,
                    message: '登录失败，请检查账号密码'
                };
            }
        } else if (!this.isLoggedIn) {
            return {
                success: false,
                message: '请先登录'
            };
        }

        try {
            this.log(`开始预约: ${venueName}, ${date} ${timeSlot}`);

            // 先查询获取场地列表
            const { slots } = await this.queryVenue(venueName, date);
            const targetSlot = slots.find(s => s.time.includes(timeSlot) || timeSlot.includes(s.time));

            if (!targetSlot) {
                return {
                    success: false,
                    message: `未找到时间段: ${timeSlot}`
                };
            }

            if (!targetSlot.available) {
                return {
                    success: false,
                    message: `该时间段不可用或已被预约`
                };
            }

            // 查找并点击预约按钮
            const bookSelectors = [
                `//*[contains(text(), '${timeSlot}')]/ancestor::tr//button[contains(text(), '预约')]`,
                `//*[contains(text(), '${timeSlot}')]/ancestor::div//button[contains(text(), '预约')]`,
                'button:contains("预约")',
                '.book-btn'
            ];

            let bookClicked = false;
            for (const selector of bookSelectors) {
                try {
                    const bookBtn = await driver.findElement(By.xpath(selector));
                    if (await bookBtn.isDisplayed()) {
                        await bookBtn.click();
                        bookClicked = true;
                        await driver.sleep(1000);
                        break;
                    }
                } catch (e) {
                    // 尝试下一个选择器
                }
            }

            if (!bookClicked) {
                return {
                    success: false,
                    message: '无法找到预约按钮'
                };
            }

            // 确认预约
            const confirmSelectors = [
                'button:contains("确认")',
                '.confirm-btn',
                'button[type="submit"]'
            ];

            for (const selector of confirmSelectors) {
                try {
                    const confirmBtn = await driver.findElement(By.css(selector));
                    if (await confirmBtn.isDisplayed()) {
                        await confirmBtn.click();
                        await driver.sleep(2000);
                        break;
                    }
                } catch (e) {}
            }

            // 检查结果
            const successSelectors = [
                '.success-message',
                '[class*="success"]',
                '*:contains("预约成功")'
            ];

            let success = false;
            let message = '预约结果未知';

            for (const selector of successSelectors) {
                try {
                    const elem = await driver.findElement(By.css(selector));
                    message = await elem.getText();
                    if (message.includes('成功') || message.includes('Success')) {
                        success = true;
                        break;
                    }
                } catch (e) {}
            }

            return {
                success,
                message: success ? '预约成功' : message,
                orderId: success ? Date.now().toString() : undefined
            };

        } catch (e: any) {
            return {
                success: false,
                message: e.message
            };
        }
    }

    /**
     * 关闭浏览器
     */
    async close(): Promise<void> {
        if (this.driver) {
            await this.driver.quit();
            this.driver = null;
            this.isLoggedIn = false;
            this.log('浏览器已关闭');
        }
    }

    /**
     * 截图（用于调试）
     */
    async screenshot(filename: string): Promise<void> {
        if (!this.driver) return;

        try {
            const screenshot = await this.driver.takeScreenshot();
            const screenshotPath = path.join(this.appRoot, 'screenshots', filename);
            const screenshotDir = path.dirname(screenshotPath);

            if (!fs.existsSync(screenshotDir)) {
                fs.mkdirSync(screenshotDir, { recursive: true });
            }

            fs.writeFileSync(screenshotPath, screenshot, 'base64');
            this.log(`截图已保存: ${screenshotPath}`);
        } catch (e: any) {
            this.log(`截图失败: ${e.message}`);
        }
    }

    /**
     * 检查并处理登录过期
     */
    async ensureLoggedIn(userId: string, password: string, callbacks: LoginCallback = {}): Promise<boolean> {
        if (!this.isLoggedIn) {
            this.log('未登录，开始登录...');
            return await this.login(userId, password, callbacks);
        }

        // 检查登录是否过期
        const isValid = await this.checkLoginStatus();
        if (!isValid) {
            this.log('登录已过期，重新登录...');
            this.isLoggedIn = false;
            return await this.login(userId, password, callbacks, true); // 强制重新登录
        }

        return true;
    }

    /**
     * 强制重新登录
     */
    async forceRelogin(userId: string, password: string, callbacks: LoginCallback = {}): Promise<boolean> {
        this.log('强制重新登录...');
        this.isLoggedIn = false;
        return await this.login(userId, password, callbacks, true);
    }

    /**
     * 获取登录状态
     */
    isUserLoggedIn(): boolean {
        return this.isLoggedIn;
    }
}

// 导出单例
export const sportsSeleniumService = new SportsSeleniumService();
