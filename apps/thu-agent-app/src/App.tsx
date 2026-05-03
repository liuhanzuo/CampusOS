import React, {useEffect, useMemo, useRef, useState} from "react";
import {
	ActivityIndicator,
	DeviceEventEmitter,
	Image,
	KeyboardAvoidingView,
	Linking,
	Modal,
	NativeModules,
	PermissionsAndroid,
	Platform,
	Pressable,
	ScrollView,
	Share,
	StatusBar,
	StyleSheet,
	Text as RNText,
	TextInput as RNTextInput,
	type GestureResponderEvent,
	type LayoutChangeEvent,
	View,
} from "react-native";
import {InfoHelper} from "@thu-info/lib";
import {chatWithMobileAgent} from "./mobile/mobileAgent";
import {callMobileLlmStream} from "./mobile/mobileLlm";
import type {ChatMessage as AgentChatMessage, LlmSettings} from "./mobile/agentTypes";

const Text = (props: React.ComponentProps<typeof RNText>) => (
	<RNText maxFontSizeMultiplier={1.08} {...props} />
);

const TextInput = (props: React.ComponentProps<typeof RNTextInput>) => (
	<RNTextInput placeholderTextColor="#8C7A98" maxFontSizeMultiplier={1.08} {...props} />
);

type Role = "user" | "assistant" | "system";
type LoginStatus = "unknown" | "not_logged_in" | "pending" | "two_factor" | "success" | "error";
type ActiveTab = "agent" | "profile";
type LlmMode = "builtin" | "custom";
type RuntimeMode = "mobile" | "backend";

interface Message {
	id: string;
	role: Role;
	content: string;
	actions?: ChatAction[];
	toolResults?: ToolResult[];
	actionResult?: ToolResultEnvelope;
}

interface ChatAction {
	type: "payment_qr" | "open_url" | "sports_captcha";
	label?: string;
	url?: string;
	panel?: "current";
}

interface ToolResult {
	name: string;
	args: Record<string, unknown>;
	result: ToolResultEnvelope;
}

interface ToolResultEnvelope {
	success?: boolean;
	status?: string;
	data?: unknown;
	meta?: Record<string, unknown>;
	error?: string | null;
	message?: string;
	summary?: string;
	risk?: "low" | "medium" | "high";
	confirmation_token?: string;
	expires_at?: string;
	actions?: ChatAction[];
	[key: string]: unknown;
}

interface CampusCapability {
	id: string;
	name: string;
	category: string;
	status: "ready" | "partial" | "planned";
	examples: string[];
	notes?: string;
}

interface ParsedActionMarkers {
	cleanText: string;
	payUrls: string[];
	openUrls: string[];
	hasSportsCaptcha: boolean;
}

interface CaptchaPoint {
	x: number;
	y: number;
	t: number;
}

interface CaptchaSnapshot {
	success: boolean;
	message?: string;
	imageDataUrl?: string;
	currentUrl?: string;
	viewport?: {
		width: number;
		height: number;
		devicePixelRatio: number;
	};
}

type VoiceInputModule = {
	isAvailable: () => Promise<boolean>;
	start: (localeTag?: string) => Promise<string>;
	stop: () => void;
};

type SettingsStorageModule = {
	getItem: (key: string) => Promise<string | null>;
	setItem: (key: string, value: string) => Promise<boolean>;
};

const VoiceInput = NativeModules.VoiceInput as VoiceInputModule | undefined;
const SettingsStorage = NativeModules.SettingsStorage as SettingsStorageModule | undefined;

const iconSources = {
	agent: require("./assets/icons/agent.png"),
	card: require("./assets/icons/card.png"),
	sports: require("./assets/icons/sports.png"),
	library: require("./assets/icons/library.png"),
	schedule: require("./assets/icons/schedule.png"),
	user: require("./assets/icons/user.png"),
	connection: require("./assets/icons/connection.png"),
	mic: require("./assets/icons/mic.png"),
};

const demoPrompts = [
	"查一下我的校园卡余额",
	"今天下午有什么课",
	"明天羽毛球场有没有空位",
	"帮我预约明天 10:00-11:00 的研读间",
	"校园卡充 50 元",
	"你现在支持哪些真实动作？",
	"列出我当前待确认的动作",
	"确认执行",
];

const capabilityTiles = [
	{label: "课表", tone: "blue", prompt: "今天下午有什么课", icon: iconSources.schedule},
	{label: "校园卡", tone: "green", prompt: "查一下我的校园卡余额", icon: iconSources.card},
	{label: "图书馆", tone: "amber", prompt: "查一下研读间资源", icon: iconSources.library},
	{label: "体育", tone: "red", prompt: "明天羽毛球场有没有空位", icon: iconSources.sports},
] as const;

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");
const defaultBaseUrl = "http://127.0.0.1:3000";
const defaultLlmApiUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const defaultLlmModel = "glm-4-flash";
const appSettingsKey = "campusos.agent.settings.v1";
const requestTimeoutMs = 8000;
const longRequestTimeoutMs = 120000;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseActionMarkers = (content: string): ParsedActionMarkers => {
	const payUrls: string[] = [];
	const openUrls: string[] = [];
	let cleanText = content
		.replace(/\[PAY_QR:([^\]]+)\]/g, (_marker, url) => {
			payUrls.push(url);
			return "";
		})
		.replace(/\[OPEN_URL:([^\]]+)\]/g, (_marker, url) => {
			openUrls.push(url);
			return "";
		});
	const hasSportsCaptcha = cleanText.includes("[SPORTS_CAPTCHA:current]");
	cleanText = cleanText.replace(/\[SPORTS_CAPTCHA:current\]/g, "").trim();
	return {cleanText, payUrls, openUrls, hasSportsCaptcha};
};

const normalizeMarkerActions = (content: string): ChatAction[] => {
	const parsed = parseActionMarkers(content);
	const actions: ChatAction[] = [
		...parsed.payUrls.map((url) => ({type: "payment_qr" as const, label: "支付二维码", url})),
		...parsed.openUrls.map((url) => ({type: "open_url" as const, label: "打开页面", url})),
	];
	if (parsed.hasSportsCaptcha) {
		actions.push({type: "sports_captcha", label: "体育验证码辅助面板", panel: "current"});
	}
	return actions;
};

const normalizeActions = (...sources: Array<ChatAction[] | undefined>): ChatAction[] => {
	const seen = new Set<string>();
	const actions: ChatAction[] = [];
	for (const source of sources) {
		for (const action of source || []) {
			if (!action?.type) continue;
			const key = JSON.stringify(action);
			if (seen.has(key)) continue;
			seen.add(key);
			actions.push(action);
		}
	}
	return actions;
};

const extractActionsFromToolResult = (result?: ToolResultEnvelope): ChatAction[] => {
	if (!result) return [];
	const actions: ChatAction[] = Array.isArray(result.actions) ? result.actions : [];
	if (typeof result.paymentMarker === "string") {
		actions.push(...normalizeMarkerActions(result.paymentMarker));
	}
	if (typeof result.openUrlMarker === "string") {
		actions.push(...normalizeMarkerActions(result.openUrlMarker));
	}
	if (result.captchaPanelMarker === "[SPORTS_CAPTCHA:current]") {
		actions.push({type: "sports_captcha", label: "体育验证码辅助面板", panel: "current"});
	}
	return actions;
};

const collectMessageActions = (message: Message): ChatAction[] => {
	const toolActions = (message.toolResults || []).flatMap((item) => extractActionsFromToolResult(item.result));
	return normalizeActions(
		normalizeMarkerActions(message.content),
		message.actions,
		message.actionResult?.actions,
		extractActionsFromToolResult(message.actionResult),
		toolActions,
	);
};

const extractPendingEnvelope = (message: Message): ToolResultEnvelope | null => {
	const candidates = [
		message.actionResult,
		...(message.toolResults || []).map((item) => item.result),
	].filter(Boolean) as ToolResultEnvelope[];
	return candidates.find((result) => result.status === "awaiting_confirmation" && typeof result.confirmation_token === "string") || null;
};

const stripMarkers = (content: string) => parseActionMarkers(content).cleanText;

const asDisplayValue = (value: unknown): string => {
	if (value === undefined || value === null || value === "") return "无";
	if (Array.isArray(value)) return `${value.length} 项`;
	if (typeof value === "object") return `${Object.keys(value as Record<string, unknown>).length} 个字段`;
	return String(value);
};

const collectToolFields = (result: ToolResultEnvelope): Array<[string, string]> => {
	const fields: Array<[string, string]> = [];
	const push = (key: string, value: unknown) => {
		if (fields.length >= 8) return;
		fields.push([key, asDisplayValue(value)]);
	};
	if (result.error) push("error", result.error);
	if (result.message) push("message", result.message);
	if (result.summary) push("summary", result.summary);
	if (result.confirmation_token) push("confirmation", "需要确认");
	if (result.expires_at) push("expires", result.expires_at);
	const data = result.data;
	if (Array.isArray(data)) {
		push("data", data);
		const first = data.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
		if (first) Object.entries(first).slice(0, 5).forEach(([key, value]) => push(key, value));
	} else if (data && typeof data === "object") {
		Object.entries(data as Record<string, unknown>).slice(0, 7).forEach(([key, value]) => push(key, value));
	} else if (data !== undefined && data !== null) {
		push("data", data);
	}
	if (result.meta && typeof result.meta === "object") {
		Object.entries(result.meta).slice(0, 4).forEach(([key, value]) => push(`meta.${key}`, value));
	}
	return fields;
};

const qrImageUrl = (url: string) =>
	`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;

const normalizeExternalUrl = (url: string) => {
	const trimmed = url.trim();
	if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) || /^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
		return trimmed;
	}
	return `https://${trimmed}`;
};

const parseSseBlock = (block: string) => {
	let event = "message";
	const dataLines: string[] = [];
	for (const line of block.split(/\r?\n/)) {
		if (line.startsWith("event:")) event = line.slice(6).trim();
		if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
	}
	if (!dataLines.length) return null;
	return {event, data: JSON.parse(dataLines.join("\n"))};
};

const statusTone: Record<CampusCapability["status"], "ok" | "warn" | "neutral"> = {
	ready: "ok",
	partial: "warn",
	planned: "neutral",
};

const statusLabel: Record<CampusCapability["status"], string> = {
	ready: "Ready",
	partial: "Partial",
	planned: "Planned",
};

const statusMeta: Record<LoginStatus, {label: string; tone: "neutral" | "warn" | "ok" | "bad" | "busy"}> = {
	unknown: {label: "未检查", tone: "neutral"},
	not_logged_in: {label: "未登录", tone: "neutral"},
	pending: {label: "登录中", tone: "busy"},
	two_factor: {label: "二次验证", tone: "warn"},
	success: {label: "已登录", tone: "ok"},
	error: {label: "登录失败", tone: "bad"},
};

const renderInline = (text: string, keyPrefix: string) => {
	const nodes: React.ReactNode[] = [];
	const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)]+)\))/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(text))) {
		if (match.index > lastIndex) {
			nodes.push(text.slice(lastIndex, match.index));
		}
		const token = match[0];
		if (token.startsWith("**")) {
			nodes.push(
				<Text key={`${keyPrefix}-b-${match.index}`} style={styles.markdownStrong}>
					{token.slice(2, -2)}
				</Text>,
			);
		} else if (token.startsWith("`")) {
			nodes.push(
				<Text key={`${keyPrefix}-c-${match.index}`} style={styles.markdownCode}>
					{token.slice(1, -1)}
				</Text>,
			);
		} else {
			const linkMatch = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/.exec(token);
			if (linkMatch) {
				nodes.push(
					<Text
						key={`${keyPrefix}-l-${match.index}`}
						style={styles.markdownLink}
						onPress={() => Linking.openURL(linkMatch[2])}>
						{linkMatch[1]}
					</Text>,
				);
			}
		}
		lastIndex = pattern.lastIndex;
	}

	if (lastIndex < text.length) {
		nodes.push(text.slice(lastIndex));
	}
	return nodes.length > 0 ? nodes : text;
};

const MarkdownCard = ({content}: {content: string}) => {
	const cleaned = stripMarkers(content);
	const lines = cleaned.split(/\r?\n/).filter((line) => line.trim().length > 0);

	if (lines.length === 0) return null;

	return (
		<View style={styles.markdownCard}>
			{lines.map((rawLine, index) => {
				const line = rawLine.trim();
				const heading = /^(#{1,3})\s+(.+)$/.exec(line);
				if (heading) {
					return (
						<Text key={`${index}-${line}`} style={styles.markdownHeading}>
							{renderInline(heading[2], `h-${index}`)}
						</Text>
					);
				}

				const bullet = /^[-*]\s+(.+)$/.exec(line);
				if (bullet) {
					return (
						<View key={`${index}-${line}`} style={styles.markdownListRow}>
							<Text style={styles.markdownBullet}>•</Text>
							<Text style={styles.markdownParagraph}>
								{renderInline(bullet[1], `u-${index}`)}
							</Text>
						</View>
					);
				}

				const ordered = /^(\d+)[.)]\s+(.+)$/.exec(line);
				if (ordered) {
					return (
						<View key={`${index}-${line}`} style={styles.markdownListRow}>
							<Text style={styles.markdownOrder}>{ordered[1]}.</Text>
							<Text style={styles.markdownParagraph}>
								{renderInline(ordered[2], `o-${index}`)}
							</Text>
						</View>
					);
				}

				return (
					<Text key={`${index}-${line}`} style={styles.markdownParagraph}>
						{renderInline(line, `p-${index}`)}
					</Text>
				);
			})}
		</View>
	);
};

const ToolResults = ({items, actionResult}: {items?: ToolResult[]; actionResult?: ToolResultEnvelope}) => {
	const results = [...(items || [])];
	if (actionResult) {
		results.push({name: "confirm_pending_action", args: {}, result: actionResult});
	}
	if (!results.length) return null;

	return (
		<View style={styles.toolSection}>
			<Text style={styles.sectionLabel}>工具结果</Text>
			{results.slice(0, 5).map((item, index) => {
				const result = item.result || {};
				const failed = result.success === false;
				const fields = collectToolFields(result);
				return (
					<View key={`${item.name}-${index}`} style={styles.toolCard}>
						<View style={styles.toolHead}>
							<Text style={styles.toolName} numberOfLines={1}>{item.name || "tool"}</Text>
							<View style={[styles.toolStatus, failed ? styles.toolStatusFailed : styles.toolStatusOk]}>
								<Text style={[styles.toolStatusText, failed ? styles.toolStatusTextFailed : styles.toolStatusTextOk]}>
									{result.status || (failed ? "error" : "ok")}
								</Text>
							</View>
						</View>
						{fields.length > 0 ? (
							<View style={styles.toolFieldGrid}>
								{fields.map(([key, value]) => (
									<View key={`${item.name}-${index}-${key}`} style={styles.toolField}>
										<Text style={styles.toolFieldKey}>{key}</Text>
										<Text style={styles.toolFieldValue} numberOfLines={2}>{value}</Text>
									</View>
								))}
							</View>
						) : null}
					</View>
				);
			})}
		</View>
	);
};

export const App = () => {
	const [activeTab, setActiveTab] = useState<ActiveTab>("agent");
	const [runtimeMode, setRuntimeMode] = useState<RuntimeMode>("mobile");
	const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
	const [llmMode, setLlmMode] = useState<LlmMode>("builtin");
	const [llmProvider, setLlmProvider] = useState("zhipu");
	const [llmApiUrl, setLlmApiUrl] = useState(defaultLlmApiUrl);
	const [llmApiKey, setLlmApiKey] = useState("");
	const [llmModel, setLlmModel] = useState(defaultLlmModel);
	const [llmStatus, setLlmStatus] = useState("内置服务");
	const [userId, setUserId] = useState("");
	const [password, setPassword] = useState("");
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [twoFactor, setTwoFactor] = useState<any>(null);
	const [loginStatus, setLoginStatus] = useState<LoginStatus>("unknown");
	const [busy, setBusy] = useState(false);
	const [input, setInput] = useState("");
	const [listening, setListening] = useState(false);
	const [capabilities, setCapabilities] = useState<CampusCapability[]>([]);
	const [healthLine, setHealthLine] = useState("等待连接");
	const [payUrl, setPayUrl] = useState<string | null>(null);
	const [sportsPanelVisible, setSportsPanelVisible] = useState(false);
	const [captchaSnapshot, setCaptchaSnapshot] = useState<CaptchaSnapshot | null>(null);
	const [captchaBusy, setCaptchaBusy] = useState(false);
	const [captchaStatus, setCaptchaStatus] = useState("打开体育预约页后可获取截图");
	const [dragPoints, setDragPoints] = useState<CaptchaPoint[]>([]);
	const [dragStartTime, setDragStartTime] = useState(0);
	const [captchaLayout, setCaptchaLayout] = useState({width: 0, height: 0});
	const [messages, setMessages] = useState<Message[]>([
		{
			id: makeId(),
			role: "assistant",
			content: "### Campus Agent 已就绪\n- 先连接后端并登录\n- 直接说校园任务，例如查课表、充值校园卡、预约研读间\n- 真实支付和预约会先生成确认动作",
		},
	]);
	const scrollRef = useRef<ScrollView>(null);
	const dragStartRef = useRef(0);
	const voiceBaseInputRef = useRef("");
	const helperRef = useRef(new InfoHelper());
	const mobileHistoryRef = useRef<AgentChatMessage[]>([]);
	const twoFactorMethodResolveRef = useRef<((method: "wechat" | "mobile" | "totp" | undefined) => void) | null>(null);
	const twoFactorCodeResolveRef = useRef<((code: string | undefined) => void) | null>(null);

	const apiBase = useMemo(() => normalizeBaseUrl(baseUrl), [baseUrl]);
	const currentStatus = statusMeta[loginStatus];
	const llmModeLabel = llmMode === "builtin" ? "内置 LLM" : "自定义 LLM";
	const runtimeModeLabel = runtimeMode === "mobile" ? "手机直连" : "后端代理";

	useEffect(() => {
		const helper = helperRef.current;
		helper.clearCookieHandler = async () => {};
		helper.trustFingerprintHook = async () => true;
		helper.trustFingerprintNameHook = async () => "CampusOS Agent";
		helper.twoFactorMethodHook = (hasWeChatBool, phone, hasTotp) =>
			new Promise((resolve) => {
				twoFactorMethodResolveRef.current = resolve;
				setTwoFactor({type: "method_selection", hasWeChatBool, phone, hasTotp});
				setLoginStatus("two_factor");
				append({role: "system", content: "需要二次验证：请选择验证方式"});
			});
		helper.twoFactorAuthHook = () =>
			new Promise((resolve) => {
				twoFactorCodeResolveRef.current = resolve;
				setTwoFactor((prev: any) => ({...(prev || {}), type: "code"}));
				setLoginStatus("two_factor");
				append({role: "system", content: "请输入二次验证码"});
			});
		helper.loginErrorHook = (error: any) => {
			append({role: "system", content: `手机端登录失败：${error.message || error}`});
		};
	}, []);

	useEffect(() => {
		if (!SettingsStorage) {
			setLlmStatus("本地设置模块未注册");
			return;
		}
		SettingsStorage.getItem(appSettingsKey)
			.then((raw) => {
				if (!raw) return;
				const settings = JSON.parse(raw);
				if (settings.runtimeMode === "mobile" || settings.runtimeMode === "backend") setRuntimeMode(settings.runtimeMode);
				if (typeof settings.baseUrl === "string") setBaseUrl(settings.baseUrl);
				if (settings.llmMode === "builtin" || settings.llmMode === "custom") setLlmMode(settings.llmMode);
				if (typeof settings.llmProvider === "string") setLlmProvider(settings.llmProvider);
				if (typeof settings.llmApiUrl === "string") setLlmApiUrl(settings.llmApiUrl);
				if (typeof settings.llmApiKey === "string") setLlmApiKey(settings.llmApiKey);
				if (typeof settings.llmModel === "string") setLlmModel(settings.llmModel);
				if (typeof settings.userId === "string") {
					setUserId(settings.userId);
					helperRef.current.userId = settings.userId;
				}
				if (typeof settings.password === "string") {
					setPassword(settings.password);
					helperRef.current.password = settings.password;
				}
				setLlmStatus(settings.llmMode === "custom" ? "自定义配置已载入" : "内置服务");
			})
			.catch(() => {
				setLlmStatus("设置读取失败");
			});
	}, []);

	useEffect(() => {
		if (!SettingsStorage) return;
		const handle = setTimeout(() => {
			SettingsStorage.setItem(appSettingsKey, JSON.stringify({
				runtimeMode,
				baseUrl,
				llmMode,
				llmProvider,
				llmApiUrl,
				llmApiKey,
				llmModel,
				userId,
				password,
			})).catch(() => {
				setLlmStatus("设置保存失败");
			});
		}, 300);
		return () => clearTimeout(handle);
	}, [runtimeMode, baseUrl, llmMode, llmProvider, llmApiUrl, llmApiKey, llmModel, userId, password]);

	const buildLlmPayload = () => {
		if (llmMode !== "custom") return undefined;
		return {
			mode: "custom",
			provider: llmProvider.trim() || "custom",
			apiUrl: normalizeBaseUrl(llmApiUrl.trim()),
			apiKey: llmApiKey.trim(),
			model: llmModel.trim(),
		};
	};

	const buildMobileLlmSettings = (): LlmSettings => ({
		mode: llmMode,
		provider: llmProvider.trim() || "custom",
		apiUrl: normalizeBaseUrl(llmApiUrl.trim()),
		apiKey: llmApiKey.trim(),
		model: llmModel.trim(),
	});

	useEffect(() => {
		const subscription = DeviceEventEmitter.addListener("VoiceInputPartial", (text: string) => {
			const partial = String(text || "").trim();
			if (!partial) return;
			const base = voiceBaseInputRef.current;
			setInput(base ? `${base}${base.endsWith(" ") ? "" : " "}${partial}` : partial);
		});
		return () => subscription.remove();
	}, []);

	const append = (message: Omit<Message, "id">) => {
		setMessages((prev: Message[]) => prev.concat({...message, id: makeId()}));
		setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80);
	};

	const appendWithId = (message: Omit<Message, "id">) => {
		const id = makeId();
		setMessages((prev: Message[]) => prev.concat({...message, id}));
		setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80);
		return id;
	};

	const updateMessage = (id: string, patch: Partial<Message> | ((message: Message) => Message)) => {
		setMessages((prev) => prev.map((message) => {
			if (message.id !== id) return message;
			return typeof patch === "function" ? patch(message) : {...message, ...patch};
		}));
		setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80);
	};

	const request = async (path: string, options: RequestInit = {}, timeoutMs = requestTimeoutMs) => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const response = await fetch(`${apiBase}${path}`, {
				...options,
				headers: {
					"Content-Type": "application/json",
					...(options.headers || {}),
				},
				credentials: "include",
				signal: controller.signal,
			});
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(body.error || body.message || `HTTP ${response.status}`);
			}
			return body;
		} catch (error: any) {
			if (error?.name === "AbortError") {
				throw new Error(`请求超时，请确认后端地址 ${apiBase} 可访问`);
			}
			if (String(error?.message || "").includes("Network request failed")) {
				throw new Error(`无法连接后端 ${apiBase}，请确认后端已启动并已配置 ADB reverse`);
			}
			throw error;
		} finally {
			clearTimeout(timeout);
		}
	};

	const checkHealth = async () => {
		setBusy(true);
		try {
			if (runtimeMode === "mobile") {
				const localCapabilities: CampusCapability[] = [
					{id: "mobile_schedule", name: "手机端课表查询", category: "手机直连", status: "ready", examples: ["今天下午有什么课"]},
					{id: "mobile_card", name: "手机端校园卡查询", category: "手机直连", status: "ready", examples: ["查一下校园卡余额"]},
					{id: "mobile_library", name: "手机端图书馆查询", category: "手机直连", status: "ready", examples: ["列出图书馆"]},
					{id: "mobile_sports", name: "手机端体育余量查询", category: "手机直连", status: "ready", examples: ["明天羽毛球场有没有空位"]},
				];
				setCapabilities(localCapabilities);
				setHealthLine(`手机直连 · ${localCapabilities.length} 能力`);
				append({role: "system", content: "手机直连模式已就绪：校园接口会直接从手机访问，不依赖电脑后端。"});
				return;
			}
			const [body, capabilities] = await Promise.all([
				request("/api/health"),
				request("/api/capabilities"),
			]);
			setCapabilities(Array.isArray(capabilities.data) ? capabilities.data : []);
			setHealthLine(`${body.service} · ${capabilities.count} 能力 · ${body.uptimeSeconds}s`);
			append({
				role: "system",
				content: `后端连接成功：${body.service} · ${capabilities.count} 个能力 · 运行 ${body.uptimeSeconds}s`,
			});
		} catch (e: any) {
			append({role: "system", content: `后端连接失败：${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const testLlmConnection = async () => {
		if (llmMode === "custom" && (!llmApiUrl.trim() || !llmApiKey.trim() || !llmModel.trim())) {
			const message = "自定义 LLM 配置不完整";
			setLlmStatus(message);
			append({role: "system", content: message});
			return;
		}
		setBusy(true);
		setLlmStatus("正在测试...");
		try {
			if (runtimeMode === "mobile") {
				const startedAt = Date.now();
				await callMobileLlmStream(
					buildMobileLlmSettings(),
					[{role: "user", content: "请只回复 ok，用于连接测试。"}],
				);
				const line = `手机直连 LLM 连接成功 · ${Date.now() - startedAt}ms`;
				setLlmStatus(line);
				append({role: "system", content: line});
				return;
			}
			const body = await request("/api/llm/test", {
				method: "POST",
				body: JSON.stringify({llm: buildLlmPayload()}),
			}, 30000);
			const line = `${llmModeLabel} 连接成功 · ${body.elapsedMs}ms`;
			setLlmStatus(line);
			append({role: "system", content: `LLM 连接成功：${body.provider || llmModeLabel} · ${body.elapsedMs}ms`});
		} catch (e: any) {
			setLlmStatus(`测试失败：${e.message}`);
			append({role: "system", content: `LLM 连接失败：${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const applyLoginStatus = (body: any) => {
		setLoginStatus(body.status);
		setTwoFactor(body.twoFactor || null);
		return body.status as LoginStatus;
	};

	const refreshLoginStatus = async () => {
		const body = await request("/api/login/status");
		return applyLoginStatus(body);
	};

	const pollLoginStatus = async () => {
		for (let attempt = 0; attempt < 30; attempt += 1) {
			await delay(2000);
			const body = await request("/api/login/status");
			const status = applyLoginStatus(body);
			if (status === "success") {
				append({role: "system", content: "登录成功"});
				return;
			}
			if (status === "two_factor") {
				append({role: "system", content: "需要二次验证：请选择验证方式或输入验证码"});
				return;
			}
			if (status === "error" || status === "not_logged_in") {
				append({
					role: "system",
					content: body.error ? `登录失败：${body.error}` : `登录未完成：${status}`,
				});
				return;
			}
		}
		append({role: "system", content: "登录仍在进行中，请稍后刷新状态或检查后端日志"});
	};

	const login = async () => {
		if (!userId || !password) {
			append({role: "system", content: "请输入学号和密码"});
			return;
		}
		setBusy(true);
		try {
			if (runtimeMode === "mobile") {
				setLoginStatus("pending");
				setHealthLine("手机端正在登录校园账号...");
				await helperRef.current.login({userId, password});
				setLoginStatus("success");
				setTwoFactor(null);
				setHealthLine("手机直连 · 校园账号已登录");
				append({role: "system", content: "手机端校园账号登录成功，后续校园接口会直接从手机访问。"});
				return;
			}
			const body = await request("/api/login", {
				method: "POST",
				body: JSON.stringify({userId, password}),
			}, 30000);
			const status = applyLoginStatus(body);
			append({
				role: "system",
				content: status === "success"
					? "登录成功"
					: status === "two_factor"
						? "需要二次验证：请选择验证方式或输入验证码"
						: "登录已提交，等待后端完成",
			});
			if (status === "pending") {
				await pollLoginStatus();
			}
		} catch (e: any) {
			setLoginStatus("error");
			append({role: "system", content: `登录失败：${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const submitTwoFactor = async () => {
		if (!twoFactorCode) return;
		if (runtimeMode === "mobile" && twoFactorCodeResolveRef.current) {
			twoFactorCodeResolveRef.current(twoFactorCode);
			twoFactorCodeResolveRef.current = null;
			append({role: "system", content: "验证码已提交，等待手机端完成登录"});
			return;
		}
		setBusy(true);
		try {
			await request("/api/login/2fa/code", {
				method: "POST",
				body: JSON.stringify({code: twoFactorCode}),
			});
			append({role: "system", content: "验证码已提交，等待后端完成登录"});
			await pollLoginStatus();
		} catch (e: any) {
			append({role: "system", content: `提交验证码失败：${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const submitTwoFactorMethod = async (method: "wechat" | "mobile" | "totp") => {
		if (runtimeMode === "mobile" && twoFactorMethodResolveRef.current) {
			twoFactorMethodResolveRef.current(method);
			twoFactorMethodResolveRef.current = null;
			append({role: "system", content: `已选择 ${method} 验证方式，请输入收到的验证码`});
			return;
		}
		setBusy(true);
		try {
			await request("/api/login/2fa/method", {
				method: "POST",
				body: JSON.stringify({method}),
			});
			append({role: "system", content: `已选择 ${method} 验证方式，请输入收到的验证码`});
			await refreshLoginStatus();
		} catch (e: any) {
			append({role: "system", content: `选择验证方式失败：${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const sendMessage = async (text = input) => {
		const prompt = text.trim();
		if (!prompt || busy) return;
		setInput("");
		append({role: "user", content: prompt});
		const assistantId = appendWithId({role: "assistant", content: ""});
		setBusy(true);
		try {
			if (runtimeMode === "mobile") {
				await streamMobileChat(prompt, assistantId);
			} else {
				await streamChat(prompt, assistantId);
			}
		} catch (e: any) {
			if (String(e.message).includes("请先登录")) setLoginStatus("not_logged_in");
			updateMessage(assistantId, {role: "assistant", content: `### 调用失败\n${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const streamMobileChat = async (prompt: string, assistantId: string) => {
		if (loginStatus !== "success") {
			throw new Error("请先在“我的”页面登录校园账号");
		}
		if (llmMode !== "custom") {
			throw new Error("手机直连模式需要在“我的”页面选择“自定义 Key”并配置 LLM API Key");
		}
		const history = mobileHistoryRef.current.concat({role: "user", content: prompt});
		const result = await chatWithMobileAgent(
			helperRef.current,
			buildMobileLlmSettings(),
			history,
			(event) => {
				if (event.type === "delta") {
					updateMessage(assistantId, (message) => ({
						...message,
						content: `${message.content || ""}${event.text}`,
					}));
				}
				if (event.type === "tool_result") {
					updateMessage(assistantId, (message) => ({
						...message,
						toolResults: (message.toolResults || []).concat({
							name: event.name,
							args: event.args,
							result: event.result,
						}),
					}));
				}
				if (event.type === "status") {
					setHealthLine(event.message);
				}
				if (event.type === "done") {
					updateMessage(assistantId, (message) => ({
						...message,
						content: event.reply || message.content || "手机端 Agent 没有返回回复。",
						actions: event.actions || message.actions || [],
						toolResults: event.toolResults || message.toolResults || [],
					}));
				}
			},
		);
		mobileHistoryRef.current = result.updatedMessages.slice(-20);
	};

	const streamChat = (prompt: string, assistantId: string) =>
		new Promise<void>((resolve, reject) => {
			const xhr = new XMLHttpRequest();
			let cursor = 0;
			let buffer = "";
			let settled = false;

			const finish = (error?: Error) => {
				if (settled) return;
				settled = true;
				if (error) reject(error);
				else resolve();
			};

			const handleBlock = (rawBlock: string) => {
				const block = rawBlock.trim();
				if (!block) return;
				const parsed = parseSseBlock(block);
				if (!parsed) return;
				const {event, data} = parsed;
				if (event === "delta") {
					updateMessage(assistantId, (message) => ({
						...message,
						content: `${message.content || ""}${data.text || ""}`,
					}));
				}
				if (event === "tool_result") {
					updateMessage(assistantId, (message) => ({
						...message,
						toolResults: (message.toolResults || []).concat({
							name: data.name,
							args: data.args || {},
							result: data.result || {},
						}),
					}));
				}
				if (event === "done") {
					updateMessage(assistantId, (message) => ({
						...message,
						content: data.reply || message.content || "后端没有返回回复。",
						actions: data.actions || message.actions || [],
						toolResults: data.toolResults || message.toolResults || [],
						actionResult: data.actionResult || message.actionResult,
					}));
					finish();
				}
				if (event === "error") {
					finish(new Error(data.error || "流式回复失败"));
				}
			};

			xhr.onreadystatechange = () => {
				if (xhr.readyState === xhr.LOADING || xhr.readyState === xhr.DONE) {
					const chunk = xhr.responseText.slice(cursor);
					cursor = xhr.responseText.length;
					buffer += chunk;
					const blocks = buffer.split(/\n\n/);
					buffer = blocks.pop() || "";
					for (const block of blocks) handleBlock(block);
				}
				if (xhr.readyState === xhr.DONE && !settled) {
					if (buffer.trim()) handleBlock(buffer);
					if (xhr.status >= 200 && xhr.status < 300) finish();
					else finish(new Error(`HTTP ${xhr.status}`));
				}
			};
			xhr.onerror = () => finish(new Error(`无法连接后端 ${apiBase}`));
			xhr.ontimeout = () => finish(new Error(`请求超时，请确认后端地址 ${apiBase} 可访问`));
			xhr.open("POST", `${apiBase}/api/chat/stream`);
			xhr.setRequestHeader("Content-Type", "application/json");
			xhr.setRequestHeader("Accept", "text/event-stream");
			xhr.withCredentials = true;
			xhr.timeout = longRequestTimeoutMs;
			xhr.send(JSON.stringify({message: prompt, llm: buildLlmPayload()}));
		});

	const requestMicPermission = async () => {
		if (Platform.OS !== "android") return true;
		const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
			title: "麦克风权限",
			message: "用于把语音识别成校园任务输入。",
			buttonPositive: "允许",
			buttonNegative: "取消",
		});
		return granted === PermissionsAndroid.RESULTS.GRANTED;
	};

	const startVoiceInput = async () => {
		if (busy || listening) return;
		if (!VoiceInput) {
			append({role: "system", content: "当前版本未注册语音识别模块，请重新安装 Android App。"});
			return;
		}
		const hasPermission = await requestMicPermission();
		if (!hasPermission) {
			append({role: "system", content: "未获得麦克风权限，无法语音输入。"});
			return;
		}
		setListening(true);
		voiceBaseInputRef.current = input.trim();
		try {
			const available = await VoiceInput.isAvailable();
			if (!available) {
				append({role: "system", content: "离线语音模型尚未准备好，请稍后再试。"});
				return;
			}
			const text = await VoiceInput.start("zh-CN");
			if (text.trim()) {
				const base = voiceBaseInputRef.current;
				setInput(base ? `${base}${base.endsWith(" ") ? "" : " "}${text.trim()}` : text.trim());
			}
		} catch (e: any) {
			append({role: "system", content: `语音识别失败：${e.message || e}`});
		} finally {
			voiceBaseInputRef.current = "";
			setListening(false);
		}
	};

	const confirmPendingAction = async (_token: string) => {
		await sendMessage("确认执行");
	};

	const clearChat = async () => {
		setBusy(true);
		try {
			mobileHistoryRef.current = [];
			if (runtimeMode === "backend") {
				await request("/api/chat/clear", {method: "POST"}).catch(() => null);
			}
			setMessages([{
				id: makeId(),
				role: "assistant",
				content: runtimeMode === "mobile"
					? "### 手机端 Campus Agent 已就绪\n输入任务开始，校园接口会直接从手机访问。"
					: "### Campus Agent 已就绪\n输入任务开始，结构化结果和动作会在这里展示。",
			}]);
		} finally {
			setBusy(false);
		}
	};

	const logout = async () => {
		setBusy(true);
		try {
			if (runtimeMode === "mobile") {
				await helperRef.current.logout().catch(() => null);
			} else {
				await request("/api/logout", {method: "POST"}).catch(() => null);
			}
			setLoginStatus("not_logged_in");
			setTwoFactor(null);
			append({role: "system", content: "已退出登录"});
		} finally {
			setBusy(false);
		}
	};

	const openPayment = (url?: string) => {
		if (!url) return;
		setPayUrl(url);
	};

	const openExternalUrl = async (url?: string) => {
		if (!url) return;
		const targetUrl = normalizeExternalUrl(url);
		try {
			await Linking.openURL(targetUrl);
		} catch (e: any) {
			append({role: "system", content: `无法打开链接：${e.message || targetUrl}`});
		}
	};

	const shareExternalUrl = async (url?: string) => {
		if (!url) return;
		const targetUrl = normalizeExternalUrl(url);
		try {
			await Share.share({message: targetUrl, url: targetUrl});
		} catch (e: any) {
			append({role: "system", content: `无法分享链接：${e.message || targetUrl}`});
		}
	};

	const openSportsPanel = async () => {
		setSportsPanelVisible(true);
		await loadCaptchaSnapshot();
	};

	const loadCaptchaSnapshot = async () => {
		setCaptchaBusy(true);
		setCaptchaStatus("正在获取体育预约页面截图...");
		setDragPoints([]);
		try {
			const body = await request("/api/sports/captcha/screenshot", {}, 60000);
			if (!body.success || !body.imageDataUrl) {
				throw new Error(body.message || body.error || "没有可用截图");
			}
			setCaptchaSnapshot(body);
			setCaptchaStatus(body.currentUrl ? `当前页面：${body.currentUrl}` : "截图已加载，请在图上拖动滑块轨迹");
		} catch (e: any) {
			setCaptchaSnapshot(null);
			setCaptchaStatus(`获取截图失败：${e.message}`);
		} finally {
			setCaptchaBusy(false);
		}
	};

	const onCaptchaLayout = (event: LayoutChangeEvent) => {
		setCaptchaLayout({
			width: event.nativeEvent.layout.width,
			height: event.nativeEvent.layout.height,
		});
	};

	const recordCaptchaPoint = (event: GestureResponderEvent) => {
		if (!captchaSnapshot?.viewport || !captchaLayout.width || !captchaLayout.height) return;
		const {locationX, locationY} = event.nativeEvent;
		const scaleX = captchaSnapshot.viewport.width / captchaLayout.width;
		const scaleY = captchaSnapshot.viewport.height / captchaLayout.height;
		setDragPoints((prev) => prev.concat({
			x: Math.round(locationX * scaleX),
			y: Math.round(locationY * scaleY),
			t: Date.now() - dragStartRef.current,
		}));
	};

	const startCaptchaDrag = (event: GestureResponderEvent) => {
		dragStartRef.current = Date.now();
		setDragPoints([]);
		setDragStartTime(dragStartRef.current);
		recordCaptchaPoint(event);
	};

	const moveCaptchaDrag = (event: GestureResponderEvent) => {
		if (!dragStartTime) return;
		recordCaptchaPoint(event);
	};

	const endCaptchaDrag = (event: GestureResponderEvent) => {
		recordCaptchaPoint(event);
		setCaptchaStatus(`已记录 ${dragPoints.length + 1} 个拖动点`);
	};

	const submitCaptchaDrag = async () => {
		if (!dragPoints.length) {
			setCaptchaStatus("请先在截图上拖动滑块轨迹");
			return;
		}
		setCaptchaBusy(true);
		setCaptchaStatus("正在回放拖动轨迹...");
		try {
			const body = await request("/api/sports/captcha/drag", {
				method: "POST",
				body: JSON.stringify({points: dragPoints}),
			}, 60000);
			setCaptchaStatus(body.message || "拖动轨迹已提交");
		} catch (e: any) {
			setCaptchaStatus(`提交失败：${e.message}`);
		} finally {
			setCaptchaBusy(false);
		}
	};

	const renderMessage = (message: Message) => {
		const actions = collectMessageActions(message);
		const pending = extractPendingEnvelope(message);

		if (message.role === "system") {
			return (
				<View key={message.id} style={styles.systemEvent}>
					<Text style={styles.systemEventText}>{message.content}</Text>
				</View>
			);
		}

		if (message.role === "user") {
			return (
				<View key={message.id} style={styles.userMessage}>
					<Text style={styles.userMessageText}>{message.content}</Text>
				</View>
			);
		}

		return (
			<View key={message.id} style={styles.assistantMessage}>
				<MarkdownCard content={message.content} />
				<ToolResults items={message.toolResults} actionResult={message.actionResult} />
				{pending ? (
					<View style={styles.noticeBox}>
						<Text style={styles.noticeTitle}>等待确认 · {pending.risk || "medium"}</Text>
						<Text style={styles.noticeText}>{pending.summary || "后端已生成待确认动作。"}</Text>
						<Pressable
							style={({pressed}) => [styles.confirmButton, pressed ? styles.pressed : null]}
							onPress={() => confirmPendingAction(String(pending.confirmation_token))}
							disabled={busy}>
							<Text style={styles.confirmButtonText}>确认执行</Text>
						</Pressable>
					</View>
				) : null}
				{actions.length > 0 ? (
					<View style={styles.actionStack}>
						{actions.map((action, index) => {
							if (action.type === "payment_qr") {
								return (
									<Pressable
										key={`${action.type}-${action.url}-${index}`}
										style={({pressed}) => [styles.actionButton, pressed ? styles.pressed : null]}
										onPress={() => openPayment(action.url)}>
										<Text style={styles.actionButtonText}>查看支付二维码</Text>
									</Pressable>
								);
							}
							if (action.type === "open_url") {
								return (
									<Pressable
										key={`${action.type}-${action.url}-${index}`}
										style={({pressed}) => [styles.actionButton, styles.actionButtonBlue, pressed ? styles.pressed : null]}
										onPress={() => openExternalUrl(action.url)}>
										<Text style={styles.actionButtonText}>打开页面</Text>
									</Pressable>
								);
							}
							return (
								<Pressable
									key={`${action.type}-${index}`}
									style={({pressed}) => [styles.actionButton, styles.actionButtonAmber, pressed ? styles.pressed : null]}
									onPress={openSportsPanel}>
									<Text style={styles.actionButtonText}>体育验证码面板</Text>
								</Pressable>
							);
						})}
					</View>
				) : null}
			</View>
		);
	};

	const renderAgentPage = () => (
		<>
			<View style={styles.agentHero}>
				<View style={styles.heroIdentity}>
					<Image source={iconSources.agent} style={styles.heroIcon} />
					<View style={styles.heroCopy}>
						<Text style={styles.kicker}>CampusOS</Text>
						<Text style={styles.title}>Campus Agent</Text>
						<Text style={styles.healthLine} numberOfLines={1}>{healthLine}</Text>
					</View>
				</View>
				<View style={[styles.statusPill, styles[`status_${currentStatus.tone}`]]}>
					<View style={[styles.statusDot, styles[`dot_${currentStatus.tone}`]]} />
					<Text style={styles.statusPillText}>{currentStatus.label}</Text>
				</View>
			</View>

			<ScrollView
				style={styles.content}
				contentContainerStyle={styles.agentContent}
				keyboardShouldPersistTaps="handled">
				<View style={styles.capabilityGrid}>
					{capabilityTiles.map((item) => (
						<Pressable
							key={item.label}
							style={({pressed}) => [
								styles.capabilityTile,
								styles[`tile_${item.tone}`],
								pressed ? styles.pressed : null,
							]}
							onPress={() => sendMessage(item.prompt)}
							disabled={busy}>
							<Image source={item.icon} style={styles.capabilityIcon} />
							<Text style={styles.capabilityLabel}>{item.label}</Text>
						</Pressable>
					))}
				</View>

				<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickStrip}>
					{demoPrompts.map((prompt) => (
						<Pressable
							key={prompt}
							style={({pressed}) => [styles.quickButton, pressed ? styles.pressed : null]}
							onPress={() => sendMessage(prompt)}
							disabled={busy}>
							<Text style={styles.quickText}>{prompt}</Text>
						</Pressable>
					))}
				</ScrollView>

				<View style={styles.threadShell}>
					<View style={styles.threadHeader}>
						<View style={styles.sectionTitleRow}>
							<Image source={iconSources.agent} style={styles.sectionIcon} />
							<Text style={styles.cardTitle}>对话</Text>
						</View>
						<Pressable style={styles.headerButton} onPress={clearChat} disabled={busy}>
							<Text style={styles.headerButtonText}>清空</Text>
						</Pressable>
					</View>
					<ScrollView
						ref={scrollRef}
						style={styles.messages}
						contentContainerStyle={styles.messageContent}
						nestedScrollEnabled>
						{messages.map(renderMessage)}
						{busy ? (
							<View style={styles.systemEvent}>
								<ActivityIndicator color="#5C307D" />
								<Text style={styles.systemEventText}>处理中</Text>
							</View>
						) : null}
					</ScrollView>
				</View>
			</ScrollView>

			<View style={styles.composer}>
				<TextInput
					style={styles.composerInput}
					value={input}
					onChangeText={setInput}
					placeholder={listening ? "正在听..." : "输入校园任务"}
					multiline
				/>
				<Pressable
					style={({pressed}) => [
						styles.voiceButton,
						listening ? styles.voiceButtonActive : null,
						pressed ? styles.pressed : null,
					]}
					onPress={startVoiceInput}
					disabled={busy || listening}>
					<Image source={iconSources.mic} style={styles.voiceIcon} />
				</Pressable>
				<Pressable
					style={({pressed}) => [styles.sendButton, pressed ? styles.pressed : null]}
					onPress={() => sendMessage()}
					disabled={busy}>
					<Text style={styles.sendButtonText}>发送</Text>
				</Pressable>
			</View>
		</>
	);

	const renderProfilePage = () => (
		<ScrollView
			style={styles.content}
			contentContainerStyle={styles.profileContent}
			keyboardShouldPersistTaps="handled">
			<View style={styles.profileHeader}>
				<Image source={iconSources.user} style={styles.profileAvatar} />
				<View style={styles.profileText}>
					<Text style={styles.profileName}>{userId || "未登录用户"}</Text>
					<Text style={styles.profileMeta}>{runtimeModeLabel} · {healthLine} · {currentStatus.label}</Text>
				</View>
				<View style={[styles.statusPill, styles[`status_${currentStatus.tone}`]]}>
					<View style={[styles.statusDot, styles[`dot_${currentStatus.tone}`]]} />
					<Text style={styles.statusPillText}>{currentStatus.label}</Text>
				</View>
			</View>

			<View style={styles.panel}>
				<View style={styles.cardHeader}>
					<View style={styles.sectionTitleRow}>
						<Image source={iconSources.connection} style={styles.sectionIcon} />
						<Text style={styles.cardTitle}>运行模式</Text>
					</View>
					{busy ? <ActivityIndicator color="#5C307D" /> : null}
				</View>
				<View style={styles.modeRow}>
					<Pressable
						style={[styles.modeButton, runtimeMode === "mobile" ? styles.modeButtonActive : null]}
						onPress={() => {
							setRuntimeMode("mobile");
							setHealthLine("手机直连 · 等待登录");
						}}>
						<Text style={[styles.modeButtonText, runtimeMode === "mobile" ? styles.modeButtonTextActive : null]}>手机直连</Text>
					</Pressable>
					<Pressable
						style={[styles.modeButton, runtimeMode === "backend" ? styles.modeButtonActive : null]}
						onPress={() => {
							setRuntimeMode("backend");
							setHealthLine("后端代理 · 等待连接");
						}}>
						<Text style={[styles.modeButtonText, runtimeMode === "backend" ? styles.modeButtonTextActive : null]}>后端代理</Text>
					</Pressable>
				</View>
				<View style={styles.backendRow}>
					{runtimeMode === "backend" ? (
						<TextInput
							style={styles.backendInput}
							value={baseUrl}
							autoCapitalize="none"
							autoCorrect={false}
							onChangeText={setBaseUrl}
							placeholder="后端地址"
						/>
					) : (
						<View style={styles.mobileDirectBox}>
							<Text style={styles.helperText}>校园接口从手机直接访问；请确保手机能访问清华服务。</Text>
						</View>
					)}
					<Pressable
						style={({pressed}) => [styles.secondaryButton, pressed ? styles.pressed : null]}
						onPress={checkHealth}
						disabled={busy}>
						<Text style={styles.secondaryButtonText}>检查</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.panel}>
				<View style={styles.cardHeader}>
					<View style={styles.sectionTitleRow}>
						<Image source={iconSources.agent} style={styles.sectionIcon} />
						<Text style={styles.cardTitle}>LLM 模式</Text>
					</View>
					<Text style={styles.threadCount}>{llmModeLabel}</Text>
				</View>
				<View style={styles.modeRow}>
					<Pressable
						style={[styles.modeButton, llmMode === "builtin" ? styles.modeButtonActive : null]}
						onPress={() => {
							setLlmMode("builtin");
							setLlmStatus("内置服务");
						}}>
						<Text style={[styles.modeButtonText, llmMode === "builtin" ? styles.modeButtonTextActive : null]}>内置服务</Text>
					</Pressable>
					<Pressable
						style={[styles.modeButton, llmMode === "custom" ? styles.modeButtonActive : null]}
						onPress={() => {
							setLlmMode("custom");
							setLlmStatus("自定义配置");
						}}>
						<Text style={[styles.modeButtonText, llmMode === "custom" ? styles.modeButtonTextActive : null]}>自定义 Key</Text>
					</Pressable>
				</View>
				{llmMode === "custom" ? (
					<View style={styles.llmForm}>
						<View style={styles.providerRow}>
							{[
								["zhipu", "智谱"],
								["deepseek", "DeepSeek"],
								["openai", "OpenAI"],
								["custom", "兼容"],
							].map(([value, label]) => (
								<Pressable
									key={value}
									style={[styles.providerChip, llmProvider === value ? styles.providerChipActive : null]}
									onPress={() => setLlmProvider(value)}>
									<Text style={[styles.providerChipText, llmProvider === value ? styles.providerChipTextActive : null]}>{label}</Text>
								</Pressable>
							))}
						</View>
						<TextInput
							style={styles.llmInput}
							value={llmApiUrl}
							onChangeText={setLlmApiUrl}
							autoCapitalize="none"
							autoCorrect={false}
							placeholder="OpenAI 兼容 Chat Completions URL"
						/>
						<TextInput
							style={styles.llmInput}
							value={llmModel}
							onChangeText={setLlmModel}
							autoCapitalize="none"
							autoCorrect={false}
							placeholder="模型名，例如 glm-4-flash"
						/>
						<TextInput
							style={styles.llmInput}
							value={llmApiKey}
							onChangeText={setLlmApiKey}
							autoCapitalize="none"
							autoCorrect={false}
							secureTextEntry
							placeholder="API Key"
						/>
					</View>
				) : null}
				<View style={styles.llmFooter}>
					<Text style={styles.helperText} numberOfLines={2}>{llmStatus}</Text>
					<Pressable
						style={({pressed}) => [styles.secondaryButton, pressed ? styles.pressed : null]}
						onPress={testLlmConnection}
						disabled={busy}>
						<Text style={styles.secondaryButtonText}>测试</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.panel}>
				<View style={styles.cardHeader}>
					<View style={styles.sectionTitleRow}>
						<Image source={iconSources.user} style={styles.sectionIcon} />
						<Text style={styles.cardTitle}>登录</Text>
					</View>
					<Pressable style={styles.headerButton} onPress={logout} disabled={busy}>
						<Text style={styles.headerButtonText}>退出</Text>
					</Pressable>
				</View>
				<View style={styles.loginGrid}>
					<TextInput
						style={styles.field}
						value={userId}
						onChangeText={setUserId}
						placeholder="学号"
						autoCapitalize="none"
					/>
					<TextInput
						style={styles.field}
						value={password}
						onChangeText={setPassword}
						placeholder="密码"
						secureTextEntry
					/>
					<Pressable
						style={({pressed}) => [styles.primaryButton, pressed ? styles.pressed : null]}
						onPress={login}
						disabled={busy}>
						<Text style={styles.primaryButtonText}>登录</Text>
					</Pressable>
				</View>
				<View style={styles.twoFactorRow}>
					{twoFactor?.type === "method_selection" ? (
						<View style={styles.methodRow}>
							{twoFactor.hasWeChatBool ? (
								<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("wechat")} disabled={busy && runtimeMode !== "mobile"}>
									<Text style={styles.methodChipText}>微信</Text>
								</Pressable>
							) : null}
							{twoFactor.phone ? (
								<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("mobile")} disabled={busy && runtimeMode !== "mobile"}>
									<Text style={styles.methodChipText}>短信</Text>
								</Pressable>
							) : null}
							{twoFactor.hasTotp ? (
								<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("totp")} disabled={busy && runtimeMode !== "mobile"}>
									<Text style={styles.methodChipText}>TOTP</Text>
								</Pressable>
							) : null}
						</View>
					) : null}
					<TextInput
						style={styles.codeInput}
						value={twoFactorCode}
						onChangeText={setTwoFactorCode}
						placeholder="2FA"
						keyboardType="number-pad"
					/>
					<Pressable style={styles.ghostButton} onPress={submitTwoFactor} disabled={busy && runtimeMode !== "mobile"}>
						<Text style={styles.ghostButtonText}>提交</Text>
					</Pressable>
				</View>
			</View>

			<View style={styles.panel}>
				<View style={styles.cardHeader}>
					<View style={styles.sectionTitleRow}>
						<Image source={iconSources.library} style={styles.sectionIcon} />
						<Text style={styles.cardTitle}>能力目录</Text>
					</View>
					<Text style={styles.threadCount}>{capabilities.length || capabilityTiles.length} 项</Text>
				</View>
				<View style={styles.profileCapabilityGrid}>
					{(capabilities.length ? capabilities : capabilityTiles.map((item) => ({
						id: item.label,
						name: item.label,
						status: "ready" as const,
						examples: [item.prompt],
					}))).map((capability, index) => (
						<Pressable
							key={capability.id}
							style={({pressed}) => [styles.profileCapability, pressed ? styles.pressed : null]}
							onPress={() => {
								setActiveTab("agent");
								sendMessage(capability.examples[0] || `介绍一下${capability.name}`);
							}}
							disabled={busy}>
							<Image source={capabilityTiles[index % capabilityTiles.length].icon} style={styles.profileCapabilityIcon} />
							<View style={styles.profileCapabilityText}>
								<Text style={styles.capabilityChipTitle}>{capability.name}</Text>
								<View style={[styles.capabilityStatus, styles[`capabilityStatus_${statusTone[capability.status]}`]]}>
									<Text style={styles.capabilityStatusText}>{statusLabel[capability.status]}</Text>
								</View>
							</View>
						</Pressable>
					))}
				</View>
			</View>
		</ScrollView>
	);

	return (
		<View style={styles.safe}>
			<StatusBar barStyle="light-content" backgroundColor="#4B1F6F" />
			<KeyboardAvoidingView
				style={styles.root}
				behavior={Platform.OS === "ios" ? "padding" : undefined}>
				{activeTab === "agent" ? renderAgentPage() : renderProfilePage()}
				<View style={styles.tabBar}>
					<Pressable
						style={[styles.tabItem, activeTab === "agent" ? styles.tabItemActive : null]}
						onPress={() => setActiveTab("agent")}>
						<Image source={iconSources.agent} style={styles.tabIcon} />
						<Text style={[styles.tabText, activeTab === "agent" ? styles.tabTextActive : null]}>Agent</Text>
					</Pressable>
					<Pressable
						style={[styles.tabItem, activeTab === "profile" ? styles.tabItemActive : null]}
						onPress={() => setActiveTab("profile")}>
						<Image source={iconSources.user} style={styles.tabIcon} />
						<Text style={[styles.tabText, activeTab === "profile" ? styles.tabTextActive : null]}>我的</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
			<Modal visible={Boolean(payUrl)} transparent animationType="fade" onRequestClose={() => setPayUrl(null)}>
				<View style={styles.modalOverlay}>
					<View style={styles.modalCard}>
						<View style={styles.modalHeader}>
							<Text style={styles.modalTitle}>支付二维码</Text>
							<Pressable style={styles.modalClose} onPress={() => setPayUrl(null)}>
								<Text style={styles.modalCloseText}>关闭</Text>
							</Pressable>
						</View>
						{payUrl ? (
							<>
								<Image source={{uri: qrImageUrl(payUrl)}} style={styles.qrImage} />
								<Text style={styles.modalNote}>手机扫码完成支付，App 不会自动扣款。</Text>
								<Text style={styles.urlText}>{payUrl}</Text>
								<Pressable style={styles.modalPrimaryButton} onPress={() => openExternalUrl(payUrl)}>
									<Text style={styles.modalPrimaryText}>打开支付链接</Text>
								</Pressable>
								<Pressable style={[styles.modalSecondaryButton, styles.modalLinkButton]} onPress={() => shareExternalUrl(payUrl)}>
									<Text style={styles.modalSecondaryText}>分享支付链接</Text>
								</Pressable>
							</>
						) : null}
					</View>
				</View>
			</Modal>
			<Modal visible={sportsPanelVisible} transparent animationType="slide" onRequestClose={() => setSportsPanelVisible(false)}>
				<View style={styles.modalOverlay}>
					<View style={[styles.modalCard, styles.sportsModalCard]}>
						<View style={styles.modalHeader}>
							<View style={styles.modalTitleGroup}>
								<Text style={styles.modalTitle}>体育验证码辅助面板</Text>
								<Text style={styles.modalSubtitle} numberOfLines={2}>{captchaStatus}</Text>
							</View>
							<Pressable style={styles.modalClose} onPress={() => setSportsPanelVisible(false)}>
								<Text style={styles.modalCloseText}>关闭</Text>
							</Pressable>
						</View>
						<View style={styles.captchaStage}>
							{captchaBusy ? (
								<ActivityIndicator color="#ffffff" />
							) : captchaSnapshot?.imageDataUrl ? (
								<View
									style={styles.captchaImageWrap}
									onLayout={onCaptchaLayout}
									onStartShouldSetResponder={() => true}
									onMoveShouldSetResponder={() => true}
									onResponderGrant={startCaptchaDrag}
									onResponderMove={moveCaptchaDrag}
									onResponderRelease={endCaptchaDrag}>
									<Image
										source={{uri: captchaSnapshot.imageDataUrl}}
										style={styles.captchaImage}
										resizeMode="contain"
									/>
								</View>
							) : (
								<Text style={styles.captchaEmpty}>{captchaStatus}</Text>
							)}
						</View>
						<View style={styles.captchaActions}>
							<Pressable style={styles.modalSecondaryButton} onPress={loadCaptchaSnapshot} disabled={captchaBusy}>
								<Text style={styles.modalSecondaryText}>刷新截图</Text>
							</Pressable>
							<Pressable style={styles.modalPrimaryButton} onPress={submitCaptchaDrag} disabled={captchaBusy}>
								<Text style={styles.modalPrimaryText}>提交轨迹</Text>
							</Pressable>
							<Pressable style={styles.modalSecondaryButton} onPress={() => {
								setDragPoints([]);
								setCaptchaStatus("已清除拖动轨迹");
							}}>
								<Text style={styles.modalSecondaryText}>清除</Text>
							</Pressable>
						</View>
						<Text style={styles.dragCount}>已记录 {dragPoints.length} 个点</Text>
					</View>
				</View>
			</Modal>
		</View>
	);
};

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: "#F7F2FA",
	},
	root: {
		flex: 1,
		backgroundColor: "#F7F2FA",
	},
	agentHero: {
		minHeight: Platform.OS === "android" ? 116 : 96,
		paddingHorizontal: 16,
		paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 10 : 14,
		paddingBottom: 14,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#4B1F6F",
	},
	heroIdentity: {
		flex: 1,
		flexDirection: "row",
		alignItems: "center",
		gap: 12,
	},
	heroIcon: {
		width: 48,
		height: 48,
	},
	heroCopy: {
		flex: 1,
	},
	agentContent: {
		paddingHorizontal: 12,
		paddingTop: 12,
		paddingBottom: 10,
	},
	profileContent: {
		paddingHorizontal: 12,
		paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 12 : 14,
		paddingBottom: 86,
	},
	profileHeader: {
		minHeight: 84,
		padding: 12,
		borderRadius: 8,
		backgroundColor: "#4B1F6F",
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	profileAvatar: {
		width: 52,
		height: 52,
	},
	profileText: {
		flex: 1,
	},
	profileName: {
		fontSize: 18,
		lineHeight: 24,
		fontWeight: "900",
		color: "#ffffff",
	},
	profileMeta: {
		marginTop: 3,
		fontSize: 12,
		lineHeight: 17,
		color: "#E9DCF1",
		fontWeight: "700",
	},
	panel: {
		marginTop: 10,
		padding: 12,
		borderRadius: 8,
		backgroundColor: "#ffffff",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E3D8EA",
	},
	modeRow: {
		flexDirection: "row",
		gap: 8,
		marginBottom: 10,
	},
	modeButton: {
		flex: 1,
		minHeight: 38,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#FBF8FD",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
	},
	modeButtonActive: {
		backgroundColor: "#5C307D",
		borderColor: "#5C307D",
	},
	modeButtonText: {
		fontSize: 13,
		fontWeight: "900",
		color: "#4B1F6F",
	},
	modeButtonTextActive: {
		color: "#ffffff",
	},
	llmForm: {
		gap: 8,
		marginBottom: 10,
	},
	providerRow: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 7,
	},
	providerChip: {
		minHeight: 30,
		paddingHorizontal: 10,
		borderRadius: 15,
		justifyContent: "center",
		backgroundColor: "#FBF8FD",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
	},
	providerChipActive: {
		backgroundColor: "#F0E6F6",
		borderColor: "#B997CC",
	},
	providerChipText: {
		fontSize: 12,
		fontWeight: "900",
		color: "#6C5D75",
	},
	providerChipTextActive: {
		color: "#4B1F6F",
	},
	llmInput: {
		minHeight: 40,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 10,
		backgroundColor: "#FBF8FD",
		color: "#2B123B",
		fontSize: 13,
	},
	llmFooter: {
		minHeight: 40,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	helperText: {
		flex: 1,
		fontSize: 12,
		lineHeight: 17,
		fontWeight: "700",
		color: "#6C5D75",
	},
	sectionTitleRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 7,
	},
	sectionIcon: {
		width: 22,
		height: 22,
	},
	profileCapabilityGrid: {
		gap: 8,
	},
	profileCapability: {
		minHeight: 62,
		padding: 9,
		borderRadius: 8,
		backgroundColor: "#FBF8FD",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E7DDED",
		flexDirection: "row",
		alignItems: "center",
		gap: 10,
	},
	profileCapabilityIcon: {
		width: 34,
		height: 34,
	},
	profileCapabilityText: {
		flex: 1,
	},
	tabBar: {
		minHeight: 62,
		paddingTop: 7,
		paddingBottom: Platform.OS === "ios" ? 16 : 8,
		paddingHorizontal: 34,
		flexDirection: "row",
		justifyContent: "space-between",
		backgroundColor: "#ffffff",
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "#E4D8EA",
	},
	tabItem: {
		minWidth: 104,
		height: 44,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		flexDirection: "row",
		gap: 8,
	},
	tabItemActive: {
		backgroundColor: "#F0E6F6",
	},
	tabIcon: {
		width: 22,
		height: 22,
	},
	tabText: {
		fontSize: 13,
		fontWeight: "900",
		color: "#6C5D75",
	},
	tabTextActive: {
		color: "#4B1F6F",
	},
	appBar: {
		minHeight: Platform.OS === "android" ? 92 : 72,
		paddingHorizontal: 18,
		paddingTop: Platform.OS === "android" ? (StatusBar.currentHeight || 0) + 8 : 10,
		paddingBottom: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		backgroundColor: "#eef2f1",
	},
	kicker: {
		fontSize: 11,
		fontWeight: "800",
		color: "#E3D1EC",
		textTransform: "uppercase",
	},
	title: {
		marginTop: 2,
		fontSize: 26,
		fontWeight: "800",
		color: "#ffffff",
	},
	healthLine: {
		marginTop: 2,
		maxWidth: 190,
		fontSize: 11,
		lineHeight: 15,
		color: "#E9DCF1",
		fontWeight: "700",
	},
	appBarRight: {
		alignItems: "flex-end",
		gap: 7,
	},
	headerActions: {
		flexDirection: "row",
		gap: 6,
	},
	headerButton: {
		minHeight: 28,
		paddingHorizontal: 9,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F7F2FA",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#DACBE3",
	},
	headerButtonText: {
		fontSize: 12,
		fontWeight: "800",
		color: "#4B1F6F",
	},
	statusPill: {
		height: 32,
		paddingHorizontal: 10,
		borderRadius: 16,
		flexDirection: "row",
		alignItems: "center",
		borderWidth: StyleSheet.hairlineWidth,
	},
	status_neutral: {
		backgroundColor: "#ffffff",
		borderColor: "#E0D2E7",
	},
	status_warn: {
		backgroundColor: "#fff7df",
		borderColor: "#ead18a",
	},
	status_ok: {
		backgroundColor: "#e6f5ee",
		borderColor: "#9ac7b3",
	},
	status_bad: {
		backgroundColor: "#fff0ef",
		borderColor: "#e1aaa5",
	},
	status_busy: {
		backgroundColor: "#F0E6F6",
		borderColor: "#CDB7DB",
	},
	statusDot: {
		width: 7,
		height: 7,
		borderRadius: 4,
		marginRight: 6,
	},
	dot_neutral: {
		backgroundColor: "#8a9692",
	},
	dot_warn: {
		backgroundColor: "#b98200",
	},
	dot_ok: {
		backgroundColor: "#18845f",
	},
	dot_bad: {
		backgroundColor: "#bc392d",
	},
	dot_busy: {
		backgroundColor: "#5C307D",
	},
	statusPillText: {
		fontSize: 12,
		fontWeight: "800",
		color: "#283330",
	},
	content: {
		flex: 1,
	},
	contentBody: {
		paddingHorizontal: 12,
		paddingBottom: 12,
	},
	sessionCard: {
		padding: 12,
		backgroundColor: "#ffffff",
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#d8dedc",
	},
	cardHeader: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		marginBottom: 10,
	},
	cardTitle: {
		fontSize: 14,
		fontWeight: "800",
		color: "#2B123B",
	},
	backendRow: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 8,
	},
	backendInput: {
		flex: 1,
		minHeight: 40,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 10,
		backgroundColor: "#FBF8FD",
		color: "#2B123B",
	},
	mobileDirectBox: {
		flex: 1,
		minHeight: 40,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 10,
		justifyContent: "center",
		backgroundColor: "#FBF8FD",
	},
	loginGrid: {
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
		marginBottom: 8,
	},
	field: {
		flex: 1,
		minWidth: 0,
		minHeight: 40,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 10,
		backgroundColor: "#FBF8FD",
		color: "#2B123B",
	},
	primaryButton: {
		width: 64,
		minHeight: 40,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#5C307D",
	},
	primaryButtonText: {
		color: "#ffffff",
		fontWeight: "800",
		fontSize: 14,
	},
	secondaryButton: {
		width: 64,
		minHeight: 40,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#4B1F6F",
	},
	secondaryButtonText: {
		color: "#ffffff",
		fontWeight: "800",
		fontSize: 14,
	},
	twoFactorRow: {
		minHeight: 36,
		flexDirection: "row",
		alignItems: "center",
		gap: 8,
	},
	methodRow: {
		flex: 1,
		flexDirection: "row",
		gap: 6,
	},
	methodChip: {
		minHeight: 32,
		paddingHorizontal: 10,
		borderRadius: 16,
		justifyContent: "center",
		backgroundColor: "#F0E6F6",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D7C2E3",
	},
	methodChipText: {
		color: "#4B1F6F",
		fontSize: 12,
		fontWeight: "800",
	},
	codeInput: {
		width: 82,
		minHeight: 36,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 10,
		backgroundColor: "#FBF8FD",
		color: "#2B123B",
	},
	ghostButton: {
		width: 54,
		minHeight: 36,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F0E6F6",
	},
	ghostButtonText: {
		color: "#4B1F6F",
		fontWeight: "800",
		fontSize: 13,
	},
	capabilityGrid: {
		flexDirection: "row",
		gap: 8,
		marginTop: 0,
	},
	capabilityTile: {
		flex: 1,
		height: 78,
		borderRadius: 8,
		padding: 8,
		justifyContent: "space-between",
		alignItems: "flex-start",
		borderWidth: StyleSheet.hairlineWidth,
	},
	tile_blue: {
		backgroundColor: "#EEF4FF",
		borderColor: "#C6D4F0",
	},
	tile_green: {
		backgroundColor: "#EAF7F0",
		borderColor: "#B7D7C4",
	},
	tile_amber: {
		backgroundColor: "#FFF5DC",
		borderColor: "#E4C876",
	},
	tile_red: {
		backgroundColor: "#FFF0F1",
		borderColor: "#E5B3B8",
	},
	capabilityIcon: {
		width: 28,
		height: 28,
	},
	capabilityLabel: {
		color: "#2B123B",
		fontWeight: "900",
		fontSize: 14,
	},
	capabilityStrip: {
		marginTop: 10,
	},
	capabilityChip: {
		width: 132,
		minHeight: 54,
		marginRight: 8,
		padding: 9,
		borderRadius: 8,
		backgroundColor: "#ffffff",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#d8dedc",
		justifyContent: "space-between",
	},
	capabilityChipTitle: {
		fontSize: 12,
		lineHeight: 16,
		fontWeight: "900",
		color: "#202b28",
	},
	capabilityStatus: {
		alignSelf: "flex-start",
		marginTop: 5,
		paddingHorizontal: 7,
		paddingVertical: 2,
		borderRadius: 9,
		borderWidth: StyleSheet.hairlineWidth,
	},
	capabilityStatus_ok: {
		backgroundColor: "#e7f6ee",
		borderColor: "#a9d7bf",
	},
	capabilityStatus_warn: {
		backgroundColor: "#fff6de",
		borderColor: "#e5ca7d",
	},
	capabilityStatus_neutral: {
		backgroundColor: "#f0f2f1",
		borderColor: "#d4dbd9",
	},
	capabilityStatusText: {
		fontSize: 10,
		fontWeight: "900",
		color: "#44504d",
	},
	quickStrip: {
		marginTop: 10,
		marginBottom: 10,
	},
	quickButton: {
		marginRight: 8,
		minHeight: 34,
		paddingHorizontal: 12,
		borderRadius: 17,
		justifyContent: "center",
		backgroundColor: "#ffffff",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E0D2E7",
	},
	quickText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#4B1F6F",
	},
	threadShell: {
		minHeight: 430,
		maxHeight: 620,
		backgroundColor: "#ffffff",
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E0D2E7",
		overflow: "hidden",
	},
	threadHeader: {
		height: 42,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#E9DFEF",
	},
	threadCount: {
		fontSize: 12,
		color: "#72807c",
		fontWeight: "700",
	},
	messages: {
		flex: 1,
		backgroundColor: "#FCFAFD",
	},
	messageContent: {
		padding: 10,
	},
	systemEvent: {
		alignSelf: "center",
		maxWidth: "92%",
		marginVertical: 5,
		paddingHorizontal: 10,
		paddingVertical: 7,
		borderRadius: 18,
		flexDirection: "row",
		alignItems: "center",
		gap: 6,
		backgroundColor: "#F0E6F6",
	},
	systemEventText: {
		fontSize: 12,
		lineHeight: 16,
		color: "#4B1F6F",
		fontWeight: "700",
	},
	userMessage: {
		alignSelf: "flex-end",
		maxWidth: "86%",
		marginVertical: 6,
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 8,
		backgroundColor: "#5C307D",
	},
	userMessageText: {
		color: "#ffffff",
		fontSize: 14,
		lineHeight: 20,
		fontWeight: "700",
	},
	assistantMessage: {
		alignSelf: "flex-start",
		width: "94%",
		marginVertical: 6,
	},
	markdownCard: {
		padding: 12,
		borderRadius: 8,
		backgroundColor: "#ffffff",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E4D8EA",
	},
	markdownHeading: {
		fontSize: 16,
		lineHeight: 22,
		fontWeight: "900",
		color: "#2B123B",
		marginBottom: 6,
	},
	markdownParagraph: {
		flex: 1,
		fontSize: 14,
		lineHeight: 21,
		color: "#26312e",
		marginBottom: 5,
	},
	markdownListRow: {
		flexDirection: "row",
		alignItems: "flex-start",
		marginBottom: 4,
	},
	markdownBullet: {
		width: 18,
		fontSize: 14,
		lineHeight: 21,
		color: "#5C307D",
		fontWeight: "900",
	},
	markdownOrder: {
		width: 24,
		fontSize: 14,
		lineHeight: 21,
		color: "#5C307D",
		fontWeight: "900",
	},
	markdownStrong: {
		fontWeight: "900",
		color: "#121b19",
	},
	markdownCode: {
		fontFamily: Platform.select({ios: "Menlo", android: "monospace", default: "monospace"}),
		fontSize: 13,
		color: "#7b3b00",
		backgroundColor: "#fff2d4",
	},
	markdownLink: {
		color: "#2457b8",
		fontWeight: "800",
	},
	toolSection: {
		marginTop: 8,
		padding: 10,
		borderRadius: 8,
		backgroundColor: "#FBF8FD",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#E4D8EA",
		gap: 8,
	},
	sectionLabel: {
		fontSize: 11,
		fontWeight: "900",
		color: "#67736f",
		textTransform: "uppercase",
	},
	toolCard: {
		padding: 9,
		borderRadius: 7,
		backgroundColor: "#ffffff",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#e3e8e6",
	},
	toolHead: {
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
		marginBottom: 6,
	},
	toolName: {
		flex: 1,
		fontFamily: Platform.select({ios: "Menlo", android: "monospace", default: "monospace"}),
		fontSize: 12,
		fontWeight: "800",
		color: "#202b28",
	},
	toolStatus: {
		paddingHorizontal: 8,
		paddingVertical: 3,
		borderRadius: 12,
		borderWidth: StyleSheet.hairlineWidth,
	},
	toolStatusOk: {
		backgroundColor: "#e7f6ee",
		borderColor: "#a9d7bf",
	},
	toolStatusFailed: {
		backgroundColor: "#fff0ef",
		borderColor: "#e1aaa5",
	},
	toolStatusText: {
		fontSize: 11,
		fontWeight: "900",
	},
	toolStatusTextOk: {
		color: "#126244",
	},
	toolStatusTextFailed: {
		color: "#a8271d",
	},
	toolFieldGrid: {
		flexDirection: "row",
		flexWrap: "wrap",
		gap: 6,
	},
	toolField: {
		width: "48%",
		minHeight: 44,
		paddingVertical: 4,
	},
	toolFieldKey: {
		fontSize: 10,
		lineHeight: 13,
		fontWeight: "900",
		color: "#72807c",
		textTransform: "uppercase",
	},
	toolFieldValue: {
		marginTop: 2,
		fontSize: 12,
		lineHeight: 16,
		color: "#26312e",
		fontWeight: "700",
	},
	actionStack: {
		marginTop: 8,
		gap: 8,
	},
	actionButton: {
		alignSelf: "flex-start",
		minHeight: 38,
		paddingHorizontal: 12,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#145c56",
	},
	actionButtonBlue: {
		backgroundColor: "#233a66",
	},
	actionButtonAmber: {
		backgroundColor: "#8a5a00",
	},
	actionButtonText: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "900",
	},
	noticeBox: {
		marginTop: 8,
		padding: 10,
		borderRadius: 8,
		backgroundColor: "#fff6de",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#e5ca7d",
	},
	noticeTitle: {
		fontSize: 12,
		fontWeight: "900",
		color: "#6b4b00",
		marginBottom: 3,
	},
	noticeText: {
		fontSize: 12,
		lineHeight: 17,
		color: "#4d3b12",
	},
	confirmButton: {
		alignSelf: "flex-start",
		marginTop: 9,
		minHeight: 34,
		paddingHorizontal: 12,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#5C307D",
	},
	confirmButtonText: {
		color: "#ffffff",
		fontSize: 12,
		fontWeight: "900",
	},
	composer: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
		backgroundColor: "#ffffff",
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "#E4D8EA",
	},
	composerInput: {
		flex: 1,
		maxHeight: 92,
		minHeight: 44,
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
		paddingHorizontal: 12,
		paddingVertical: 10,
		backgroundColor: "#FBF8FD",
		color: "#2B123B",
		fontSize: 14,
		lineHeight: 19,
	},
	sendButton: {
		width: 64,
		minHeight: 44,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#5C307D",
	},
	voiceButton: {
		width: 44,
		minHeight: 44,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#F0E6F6",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#D8C8E2",
	},
	voiceButtonActive: {
		backgroundColor: "#EADDF2",
		borderColor: "#B997CC",
	},
	voiceButtonText: {
		color: "#4B1F6F",
		fontSize: 14,
		fontWeight: "900",
	},
	voiceButtonTextActive: {
		color: "#4B1F6F",
	},
	voiceIcon: {
		width: 24,
		height: 24,
	},
	sendButtonText: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "900",
	},
	pressed: {
		opacity: 0.72,
	},
	modalOverlay: {
		flex: 1,
		padding: 18,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "rgba(0,0,0,0.48)",
	},
	modalCard: {
		width: "100%",
		maxWidth: 420,
		padding: 16,
		borderRadius: 8,
		backgroundColor: "#ffffff",
	},
	sportsModalCard: {
		maxWidth: 720,
	},
	modalHeader: {
		flexDirection: "row",
		alignItems: "flex-start",
		justifyContent: "space-between",
		gap: 12,
		marginBottom: 12,
	},
	modalTitleGroup: {
		flex: 1,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: "900",
		color: "#17201e",
	},
	modalSubtitle: {
		marginTop: 4,
		fontSize: 12,
		lineHeight: 17,
		color: "#5c6965",
	},
	modalClose: {
		minHeight: 32,
		paddingHorizontal: 10,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#edf0ef",
	},
	modalCloseText: {
		fontSize: 12,
		fontWeight: "900",
		color: "#3d4845",
	},
	qrImage: {
		alignSelf: "center",
		width: 280,
		height: 280,
		backgroundColor: "#f4f6f5",
	},
	modalNote: {
		marginTop: 10,
		textAlign: "center",
		fontSize: 12,
		lineHeight: 17,
		color: "#5c6965",
	},
	urlText: {
		marginTop: 10,
		padding: 9,
		borderRadius: 7,
		backgroundColor: "#f7faf9",
		fontSize: 11,
		lineHeight: 16,
		color: "#3f4b48",
	},
	modalPrimaryButton: {
		minHeight: 38,
		paddingHorizontal: 12,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#145c56",
	},
	modalPrimaryText: {
		color: "#ffffff",
		fontSize: 13,
		fontWeight: "900",
	},
	modalSecondaryButton: {
		minHeight: 38,
		paddingHorizontal: 12,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#edf0ef",
	},
	modalLinkButton: {
		marginTop: 8,
	},
	modalSecondaryText: {
		color: "#3d4845",
		fontSize: 13,
		fontWeight: "900",
	},
	captchaStage: {
		height: 380,
		borderRadius: 8,
		overflow: "hidden",
		backgroundColor: "#111716",
		alignItems: "center",
		justifyContent: "center",
	},
	captchaImage: {
		width: "100%",
		height: "100%",
	},
	captchaImageWrap: {
		width: "100%",
		height: "100%",
	},
	captchaEmpty: {
		padding: 18,
		textAlign: "center",
		fontSize: 13,
		lineHeight: 19,
		color: "#c9d1cf",
	},
	captchaActions: {
		marginTop: 12,
		flexDirection: "row",
		gap: 8,
	},
	dragCount: {
		marginTop: 8,
		fontSize: 12,
		lineHeight: 17,
		color: "#5c6965",
		fontWeight: "700",
	},
});
