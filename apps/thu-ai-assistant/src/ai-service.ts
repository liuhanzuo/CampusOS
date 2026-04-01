/**
 * GLM4-Flash AI 服务
 * 使用智谱AI的GLM4-flash模型，支持function calling来自动调用后台数据
 */
import fetch from "cross-fetch";
import { InfoHelper } from "@thu-info/lib";
import {
    getScheduleInfo,
    getSportsResourceInfo,
    getReportInfo,
    getCardInfo,
    getElectricityInfo,
    getLibraryInfo,
    getNewsInfo,
    getCalendarInfo,
    getClassroomInfo,
    rechargeCardInfo,
    sportsIdInfoList,
} from "./thu-data-service";
import dayjs from "dayjs";

const GLM_API_URL = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const GLM_API_KEY = "e1c3374d056f4189846f339270851d3e.lYEkw0rtvuXVfPuu";

// 定义可供 AI 调用的工具
const tools = [
    {
        type: "function",
        function: {
            name: "get_schedule",
            description: "获取用户的课程表/课表信息，包括课程名称、上课时间、上课地点等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_sports_resources",
            description: "查询体育场馆的预约情况，包括羽毛球场、篮球场、乒乓球场、台球、网球场等。可以查看某个日期的场地空闲情况。",
            parameters: {
                type: "object",
                properties: {
                    sport_name: {
                        type: "string",
                        description: "运动类型名称，如：羽毛球、篮球、乒乓球、台球、网球。不填则查询所有场馆。",
                    },
                    date: {
                        type: "string",
                        description: "查询日期，格式为 YYYY-MM-DD。不填则查询今天。支持'明天'、'后天'等相对日期。",
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_report",
            description: "获取用户的成绩单/成绩信息，包括课程名称、学分、成绩、绩点等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_card_info",
            description: "获取校园卡信息，包括余额、状态等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_electricity",
            description: "获取宿舍电费余额信息",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_library",
            description: "获取图书馆信息，包括各图书馆的座位情况",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_news",
            description: "获取清华校内新闻/通知/公告，可以按关键词搜索",
            parameters: {
                type: "object",
                properties: {
                    keyword: {
                        type: "string",
                        description: "搜索关键词，不填则获取最新新闻",
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_calendar",
            description: "获取教学日历信息，包括学期开始日期、当前周次等",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_classroom",
            description: "查询教室使用状态/空闲教室",
            parameters: {
                type: "object",
                properties: {
                    building: {
                        type: "string",
                        description: "教学楼名称，如：六教、三教等。不填则返回所有教学楼列表。",
                    },
                    week: {
                        type: "number",
                        description: "查询的周次，不填则查询当前周",
                    },
                },
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_available_sports_venues",
            description: "获取所有可预约的体育场馆列表",
            parameters: {
                type: "object",
                properties: {},
                required: [],
            },
        },
    },
    {
        type: "function",
        function: {
            name: "recharge_campus_card",
            description: "校园卡充值，生成微信或支付宝支付二维码。用户可以扫码完成充值。充值金额范围为0.01~500元。",
            parameters: {
                type: "object",
                properties: {
                    amount: {
                        type: "number",
                        description: "充值金额（元），范围0.01~500。",
                    },
                    pay_method: {
                        type: "string",
                        enum: ["wechat", "alipay"],
                        description: "支付方式，默认为微信支付(wechat)。可选：wechat（微信）、alipay（支付宝）。",
                    },
                },
                required: ["amount"],
            },
        },
    },
];

/**
 * 解析相对日期（明天、后天等）
 */
function parseRelativeDate(dateStr?: string): string | undefined {
    if (!dateStr) return undefined;
    const today = dayjs();
    if (dateStr.includes("今天") || dateStr.includes("today")) {
        return today.format("YYYY-MM-DD");
    }
    if (dateStr.includes("明天") || dateStr.includes("tomorrow")) {
        return today.add(1, "day").format("YYYY-MM-DD");
    }
    if (dateStr.includes("后天")) {
        return today.add(2, "day").format("YYYY-MM-DD");
    }
    if (dateStr.includes("大后天")) {
        return today.add(3, "day").format("YYYY-MM-DD");
    }
    // 尝试匹配 "周X" / "星期X"
    const weekDayMatch = dateStr.match(/(?:周|星期)([一二三四五六日天])/);
    if (weekDayMatch) {
        const dayMap: Record<string, number> = {
            "一": 1, "二": 2, "三": 3, "四": 4,
            "五": 5, "六": 6, "日": 0, "天": 0,
        };
        const targetDay = dayMap[weekDayMatch[1]];
        if (targetDay !== undefined) {
            let diff = targetDay - today.day();
            if (diff <= 0) diff += 7;
            return today.add(diff, "day").format("YYYY-MM-DD");
        }
    }
    // 如果已经是 YYYY-MM-DD 格式，直接返回
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    return undefined;
}

/**
 * 执行工具调用
 */
async function executeTool(
    helper: InfoHelper,
    toolName: string,
    args: any,
): Promise<string> {
    try {
        switch (toolName) {
            case "get_schedule": {
                const result = await getScheduleInfo(helper);
                return JSON.stringify(result);
            }
            case "get_sports_resources": {
                const date = parseRelativeDate(args.date) || args.date;
                const result = await getSportsResourceInfo(helper, args.sport_name, date);
                return JSON.stringify(result);
            }
            case "get_report": {
                const result = await getReportInfo(helper);
                return JSON.stringify(result);
            }
            case "get_card_info": {
                const result = await getCardInfo(helper);
                return JSON.stringify(result);
            }
            case "get_electricity": {
                const result = await getElectricityInfo(helper);
                return JSON.stringify(result);
            }
            case "get_library": {
                const result = await getLibraryInfo(helper);
                return JSON.stringify(result);
            }
            case "get_news": {
                const result = await getNewsInfo(helper, args.keyword);
                return JSON.stringify(result);
            }
            case "get_calendar": {
                const result = await getCalendarInfo(helper);
                return JSON.stringify(result);
            }
            case "get_classroom": {
                const result = await getClassroomInfo(helper, args.building, args.week);
                return JSON.stringify(result);
            }
            case "get_available_sports_venues": {
                return JSON.stringify({
                    success: true,
                    data: sportsIdInfoList.map((v) => v.name),
                });
            }
            case "recharge_campus_card": {
                const result = await rechargeCardInfo(
                    helper,
                    args.amount,
                    args.pay_method || "wechat",
                );
                return JSON.stringify(result);
            }
            default:
                return JSON.stringify({ error: `未知工具: ${toolName}` });
        }
    } catch (e: any) {
        return JSON.stringify({ error: e.message || "工具执行失败" });
    }
}

export interface ChatMessage {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
    tool_calls?: any[];
    tool_call_id?: string;
}

const SYSTEM_PROMPT = `你是清华大学的AI校园助手"清华小助手"。你可以帮助同学查询各种校园信息。

你的能力包括：
1. 📅 查询课程表 - 查看本学期的课程安排
2. 🏸 查询体育场馆 - 查看羽毛球场、篮球场、网球场等的预约情况和空闲时段
3. 📊 查询成绩 - 查看成绩单和绩点
4. 💳 校园卡 - 查看校园卡余额
5. ⚡ 电费查询 - 查看宿舍电费余额
6. 📚 图书馆 - 查看图书馆信息
7. 📰 校内新闻 - 获取最新校内通知和新闻
8. 📆 教学日历 - 查看学期日历和当前周次
9. 🏫 教室查询 - 查看教室使用状态
10. 💰 校园卡充值 - 支持微信/支付宝扫码充值

当用户提出查询需求时，请自动调用相应的工具获取数据，然后用友好、清晰的方式呈现给用户。
如果查询失败，请友好地告知用户并建议稍后重试。

对于校园卡充值：
- 用户说"充值"、"充钱"、"充50"等时，调用 recharge_campus_card 工具
- 如果用户没有指定金额，请先询问充值金额
- 如果用户没有指定支付方式，默认使用微信支付
- 充值成功后，回复中包含支付链接，格式为：[PAY_QR:支付URL]，前端会自动将其渲染为二维码
- 同时告知用户当前余额和充值金额

当前日期：${dayjs().format("YYYY年MM月DD日")}，${["日", "一", "二", "三", "四", "五", "六"][dayjs().day()]}。

请用中文回复，语气友好亲切。对于体育场馆查询，请重点标注哪些时段有空位可以预约。`;

/**
 * 与 GLM4-Flash 进行对话
 */
export async function chat(
    helper: InfoHelper,
    messages: ChatMessage[],
): Promise<{ reply: string; updatedMessages: ChatMessage[] }> {
    // 构建完整的消息列表
    const fullMessages: ChatMessage[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages,
    ];

    console.log(`[AI] 开始对话，消息数: ${messages.length}`);

    // 第一次调用 GLM
    console.log(`[AI] 第1次调用GLM...`);
    let glmStart = Date.now();
    let response = await callGLM(fullMessages);
    console.log(`[AI] GLM响应耗时: ${Date.now() - glmStart}ms`);
    let assistantMessage = response.choices[0].message;

    // 处理工具调用循环（最多 5 轮）
    let iterations = 0;
    while (assistantMessage.tool_calls && iterations < 5) {
        iterations++;
        console.log(`[AI] === 工具调用轮次 ${iterations} ===`);

        // 将 assistant 的工具调用消息加入历史
        fullMessages.push({
            role: "assistant",
            content: assistantMessage.content || "",
            tool_calls: assistantMessage.tool_calls,
        });

        // 执行所有工具调用
        for (const toolCall of assistantMessage.tool_calls) {
            const args = typeof toolCall.function.arguments === "string"
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments;

            console.log(`[AI] 调用工具: ${toolCall.function.name}`, JSON.stringify(args));
            const toolStart = Date.now();
            const result = await executeTool(helper, toolCall.function.name, args);
            console.log(`[AI] 工具 ${toolCall.function.name} 耗时: ${Date.now() - toolStart}ms, 结果长度: ${result.length}`);
            
            // 打印结果摘要（前200字符）
            console.log(`[AI] 工具结果摘要: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);

            fullMessages.push({
                role: "tool",
                content: result,
                tool_call_id: toolCall.id,
            });
        }

        // 再次调用 GLM 获取最终回复
        console.log(`[AI] 第${iterations + 1}次调用GLM（带工具结果）...`);
        glmStart = Date.now();
        response = await callGLM(fullMessages);
        console.log(`[AI] GLM响应耗时: ${Date.now() - glmStart}ms`);
        assistantMessage = response.choices[0].message;
    }

    const reply = assistantMessage.content || "抱歉，我暂时无法回答这个问题。";
    console.log(`[AI] 最终回复长度: ${reply.length}, 工具调用轮次: ${iterations}`);

    // 更新消息历史（不包含 system prompt）
    const updatedMessages = [...messages, { role: "assistant" as const, content: reply }];

    return { reply, updatedMessages };
}

/**
 * 调用 GLM4-Flash API
 */
async function callGLM(messages: ChatMessage[]): Promise<any> {
    const msgSummary = messages.map(m => `${m.role}(${m.content?.length || 0}${m.tool_calls ? '+tools' : ''}${m.tool_call_id ? '+tool_id' : ''})`).join(', ');
    console.log(`[GLM] 发送请求，消息: [${msgSummary}]`);

    const response = await fetch(GLM_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GLM_API_KEY}`,
        },
        body: JSON.stringify({
            model: "glm-4-flash",
            messages,
            tools,
            tool_choice: "auto",
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("[GLM API Error]", response.status, errorText);
        throw new Error(`GLM API 调用失败: ${response.status} - ${errorText.substring(0, 200)}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    if (choice) {
        console.log(`[GLM] 响应: finish_reason=${choice.finish_reason}, has_tool_calls=${!!choice.message?.tool_calls}, content_length=${choice.message?.content?.length || 0}`);
    }
    return data;
}
