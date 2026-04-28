import React, {useMemo, useRef, useState} from "react";
import {
	ActivityIndicator,
	KeyboardAvoidingView,
	Linking,
	Platform,
	Pressable,
	ScrollView,
	StatusBar,
	StyleSheet,
	Text,
	TextInput,
	View,
} from "react-native";

type Role = "user" | "assistant" | "system";
type LoginStatus = "unknown" | "not_logged_in" | "pending" | "two_factor" | "success" | "error";

interface Message {
	id: string;
	role: Role;
	content: string;
}

interface ActionLink {
	type: "pay" | "open";
	url: string;
}

const demoPrompts = [
	"查一下我的校园卡余额",
	"今天下午有什么课",
	"明天羽毛球场有没有空位",
	"帮我预约明天 10:00-11:00 的研读间",
	"校园卡充 50 元",
	"你现在支持哪些真实动作？",
];

const capabilityTiles = [
	{label: "课表", tone: "blue", prompt: "今天下午有什么课"},
	{label: "校园卡", tone: "green", prompt: "查一下我的校园卡余额"},
	{label: "研读间", tone: "amber", prompt: "查一下研读间资源"},
	{label: "体育", tone: "red", prompt: "明天羽毛球场有没有空位"},
] as const;

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const normalizeBaseUrl = (value: string) => value.replace(/\/+$/, "");
const defaultBaseUrl = Platform.OS === "android" ? "http://10.0.2.2:3000" : "http://127.0.0.1:3000";
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractMarkerLinks = (content: string): ActionLink[] => {
	const links: ActionLink[] = [];
	const paymentMarker = /\[PAY_QR:([^\]]+)\]/g;
	const openMarker = /\[OPEN_URL:([^\]]+)\]/g;
	let match: RegExpExecArray | null;
	while ((match = paymentMarker.exec(content))) {
		links.push({type: "pay", url: match[1]});
	}
	while ((match = openMarker.exec(content))) {
		links.push({type: "open", url: match[1]});
	}
	return links;
};

const stripMarkers = (content: string) =>
	content
		.replace(/\[PAY_QR:[^\]]+\]/g, "")
		.replace(/\[OPEN_URL:[^\]]+\]/g, "")
		.replace(/\[SPORTS_CAPTCHA:current\]/g, "")
		.trim();

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

export const App = () => {
	const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
	const [userId, setUserId] = useState("");
	const [password, setPassword] = useState("");
	const [twoFactorCode, setTwoFactorCode] = useState("");
	const [twoFactor, setTwoFactor] = useState<any>(null);
	const [loginStatus, setLoginStatus] = useState<LoginStatus>("unknown");
	const [busy, setBusy] = useState(false);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>([
		{
			id: makeId(),
			role: "assistant",
			content: "### Campus Agent 已就绪\n- 先连接后端并登录\n- 直接说校园任务，例如查课表、充值校园卡、预约研读间\n- 真实支付和预约会先生成确认动作",
		},
	]);
	const scrollRef = useRef<ScrollView>(null);

	const apiBase = useMemo(() => normalizeBaseUrl(baseUrl), [baseUrl]);
	const currentStatus = statusMeta[loginStatus];

	const append = (message: Omit<Message, "id">) => {
		setMessages((prev: Message[]) => prev.concat({...message, id: makeId()}));
		setTimeout(() => scrollRef.current?.scrollToEnd({animated: true}), 80);
	};

	const request = async (path: string, options: RequestInit = {}) => {
		const response = await fetch(`${apiBase}${path}`, {
			...options,
			headers: {
				"Content-Type": "application/json",
				...(options.headers || {}),
			},
			credentials: "include",
		});
		const body = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(body.error || body.message || `HTTP ${response.status}`);
		}
		return body;
	};

	const checkHealth = async () => {
		setBusy(true);
		try {
			const [body, capabilities] = await Promise.all([
				request("/api/health"),
				request("/api/capabilities"),
			]);
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
			const body = await request("/api/login", {
				method: "POST",
				body: JSON.stringify({userId, password}),
			});
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
		setBusy(true);
		try {
			const body = await request("/api/chat", {
				method: "POST",
				body: JSON.stringify({message: prompt}),
			});
			append({role: "assistant", content: body.reply || "后端没有返回回复。"});
		} catch (e: any) {
			append({role: "assistant", content: `### 调用失败\n${e.message}`});
		} finally {
			setBusy(false);
		}
	};

	const renderMessage = (message: Message) => {
		const links = extractMarkerLinks(message.content);
		const hasSportsCaptcha = message.content.includes("[SPORTS_CAPTCHA:current]");

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
				{links.length > 0 ? (
					<View style={styles.actionStack}>
						{links.map((link) => (
							<Pressable
								key={`${link.type}-${link.url}`}
								style={({pressed}) => [styles.actionButton, pressed ? styles.pressed : null]}
								onPress={() => Linking.openURL(link.url)}>
								<Text style={styles.actionButtonText}>
									{link.type === "pay" ? "打开支付链接" : "打开预约页面"}
								</Text>
							</Pressable>
						))}
					</View>
				) : null}
				{hasSportsCaptcha ? (
					<View style={styles.noticeBox}>
						<Text style={styles.noticeTitle}>需要手动完成</Text>
						<Text style={styles.noticeText}>体育预约页已打开，在网页中完成验证码、时段选择和最终提交。</Text>
					</View>
				) : null}
			</View>
		);
	};

	return (
		<View style={styles.safe}>
			<StatusBar barStyle="dark-content" backgroundColor="#eef2f1" />
			<KeyboardAvoidingView
				style={styles.root}
				behavior={Platform.OS === "ios" ? "padding" : undefined}>
				<View style={styles.appBar}>
					<View>
						<Text style={styles.kicker}>CampusOS</Text>
						<Text style={styles.title}>Campus Agent</Text>
					</View>
					<View style={[styles.statusPill, styles[`status_${currentStatus.tone}`]]}>
						<View style={[styles.statusDot, styles[`dot_${currentStatus.tone}`]]} />
						<Text style={styles.statusPillText}>{currentStatus.label}</Text>
					</View>
				</View>

				<ScrollView
					style={styles.content}
					contentContainerStyle={styles.contentBody}
					keyboardShouldPersistTaps="handled">
					<View style={styles.sessionCard}>
						<View style={styles.cardHeader}>
							<Text style={styles.cardTitle}>会话连接</Text>
							{busy ? <ActivityIndicator color="#145c56" /> : null}
						</View>
						<View style={styles.backendRow}>
							<TextInput
								style={styles.backendInput}
								value={baseUrl}
								autoCapitalize="none"
								autoCorrect={false}
								onChangeText={setBaseUrl}
								placeholder="后端地址"
							/>
							<Pressable
								style={({pressed}) => [styles.secondaryButton, pressed ? styles.pressed : null]}
								onPress={checkHealth}
								disabled={busy}>
								<Text style={styles.secondaryButtonText}>检查</Text>
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
										<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("wechat")} disabled={busy}>
											<Text style={styles.methodChipText}>微信</Text>
										</Pressable>
									) : null}
									{twoFactor.phone ? (
										<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("mobile")} disabled={busy}>
											<Text style={styles.methodChipText}>短信</Text>
										</Pressable>
									) : null}
									{twoFactor.hasTotp ? (
										<Pressable style={styles.methodChip} onPress={() => submitTwoFactorMethod("totp")} disabled={busy}>
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
							<Pressable style={styles.ghostButton} onPress={submitTwoFactor} disabled={busy}>
								<Text style={styles.ghostButtonText}>提交</Text>
							</Pressable>
						</View>
					</View>

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
							<Text style={styles.cardTitle}>Agent</Text>
							<Text style={styles.threadCount}>{messages.length} 条</Text>
						</View>
						<ScrollView
							ref={scrollRef}
							style={styles.messages}
							contentContainerStyle={styles.messageContent}
							nestedScrollEnabled>
							{messages.map(renderMessage)}
							{busy ? (
								<View style={styles.systemEvent}>
									<ActivityIndicator color="#145c56" />
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
						placeholder="输入校园任务"
						multiline
					/>
					<Pressable
						style={({pressed}) => [styles.sendButton, pressed ? styles.pressed : null]}
						onPress={() => sendMessage()}
						disabled={busy}>
						<Text style={styles.sendButtonText}>发送</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</View>
	);
};

const styles = StyleSheet.create({
	safe: {
		flex: 1,
		backgroundColor: "#eef2f1",
	},
	root: {
		flex: 1,
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
		color: "#60706c",
		textTransform: "uppercase",
	},
	title: {
		marginTop: 2,
		fontSize: 26,
		fontWeight: "800",
		color: "#17201e",
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
		borderColor: "#d4dbd9",
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
		backgroundColor: "#eaf1ff",
		borderColor: "#a9bee8",
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
		backgroundColor: "#315fb8",
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
		color: "#1d2926",
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
		borderColor: "#cbd5d2",
		paddingHorizontal: 10,
		backgroundColor: "#f8faf9",
		color: "#17201e",
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
		borderColor: "#cbd5d2",
		paddingHorizontal: 10,
		backgroundColor: "#f8faf9",
		color: "#17201e",
	},
	primaryButton: {
		width: 64,
		minHeight: 40,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#145c56",
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
		backgroundColor: "#233a66",
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
		backgroundColor: "#eef4f2",
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#bdd1ca",
	},
	methodChipText: {
		color: "#145c56",
		fontSize: 12,
		fontWeight: "800",
	},
	codeInput: {
		width: 82,
		minHeight: 36,
		borderRadius: 7,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#cbd5d2",
		paddingHorizontal: 10,
		backgroundColor: "#f8faf9",
		color: "#17201e",
	},
	ghostButton: {
		width: 54,
		minHeight: 36,
		borderRadius: 7,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#edf0ef",
	},
	ghostButtonText: {
		color: "#3d4845",
		fontWeight: "800",
		fontSize: 13,
	},
	capabilityGrid: {
		flexDirection: "row",
		gap: 8,
		marginTop: 10,
	},
	capabilityTile: {
		flex: 1,
		height: 54,
		borderRadius: 8,
		padding: 8,
		justifyContent: "flex-end",
		borderWidth: StyleSheet.hairlineWidth,
	},
	tile_blue: {
		backgroundColor: "#eaf1ff",
		borderColor: "#b3c4e8",
	},
	tile_green: {
		backgroundColor: "#e9f5ef",
		borderColor: "#a9cab8",
	},
	tile_amber: {
		backgroundColor: "#fff6de",
		borderColor: "#e5ca7d",
	},
	tile_red: {
		backgroundColor: "#fff0ed",
		borderColor: "#dfa9a0",
	},
	capabilityLabel: {
		color: "#1d2926",
		fontWeight: "900",
		fontSize: 14,
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
		borderColor: "#d8dedc",
	},
	quickText: {
		fontSize: 12,
		fontWeight: "700",
		color: "#33413d",
	},
	threadShell: {
		minHeight: 380,
		maxHeight: 560,
		backgroundColor: "#ffffff",
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#d8dedc",
		overflow: "hidden",
	},
	threadHeader: {
		height: 42,
		paddingHorizontal: 12,
		flexDirection: "row",
		alignItems: "center",
		justifyContent: "space-between",
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: "#e3e8e6",
	},
	threadCount: {
		fontSize: 12,
		color: "#72807c",
		fontWeight: "700",
	},
	messages: {
		flex: 1,
		backgroundColor: "#fbfcfb",
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
		backgroundColor: "#e8f1ee",
	},
	systemEventText: {
		fontSize: 12,
		lineHeight: 16,
		color: "#31504a",
		fontWeight: "700",
	},
	userMessage: {
		alignSelf: "flex-end",
		maxWidth: "86%",
		marginVertical: 6,
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 8,
		backgroundColor: "#233a66",
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
		borderColor: "#dfe6e3",
	},
	markdownHeading: {
		fontSize: 16,
		lineHeight: 22,
		fontWeight: "900",
		color: "#15211e",
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
		color: "#145c56",
		fontWeight: "900",
	},
	markdownOrder: {
		width: 24,
		fontSize: 14,
		lineHeight: 21,
		color: "#145c56",
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
	composer: {
		flexDirection: "row",
		alignItems: "flex-end",
		gap: 8,
		paddingHorizontal: 12,
		paddingTop: 10,
		paddingBottom: 12,
		backgroundColor: "#ffffff",
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: "#d8dedc",
	},
	composerInput: {
		flex: 1,
		maxHeight: 92,
		minHeight: 44,
		borderRadius: 8,
		borderWidth: StyleSheet.hairlineWidth,
		borderColor: "#cbd5d2",
		paddingHorizontal: 12,
		paddingVertical: 10,
		backgroundColor: "#f8faf9",
		color: "#17201e",
		fontSize: 14,
		lineHeight: 19,
	},
	sendButton: {
		width: 64,
		minHeight: 44,
		borderRadius: 8,
		alignItems: "center",
		justifyContent: "center",
		backgroundColor: "#145c56",
	},
	sendButtonText: {
		color: "#ffffff",
		fontSize: 14,
		fontWeight: "900",
	},
	pressed: {
		opacity: 0.72,
	},
});
