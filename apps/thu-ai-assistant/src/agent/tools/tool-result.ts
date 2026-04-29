export interface ToolResultEnvelope {
    success: boolean;
    status: string;
    data: unknown;
    meta: Record<string, unknown>;
    error: string | null;
    actions: ToolAction[];
    [key: string]: unknown;
}

export type ToolAction =
    | {
        type: "payment_qr";
        label: string;
        url: string;
    }
    | {
        type: "open_url";
        label: string;
        url: string;
    }
    | {
        type: "sports_captcha";
        label: string;
        panel: "current";
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const markerToAction = (key: string, marker: string): ToolAction | null => {
    if (key === "paymentMarker") {
        const match = /^\[PAY_QR:(.+)\]$/.exec(marker);
        return match ? { type: "payment_qr", label: "支付二维码", url: match[1] } : null;
    }
    if (key === "openUrlMarker") {
        const match = /^\[OPEN_URL:(.+)\]$/.exec(marker);
        return match ? { type: "open_url", label: "打开页面", url: match[1] } : null;
    }
    if (key === "captchaPanelMarker" && marker === "[SPORTS_CAPTCHA:current]") {
        return { type: "sports_captcha", label: "体育验证码辅助面板", panel: "current" };
    }
    return null;
};

export function extractToolActions(result: unknown): ToolAction[] {
    if (!isRecord(result)) return [];
    const explicitActions = Array.isArray(result.actions)
        ? result.actions.filter(isRecord).map((action) => ({ ...action } as ToolAction))
        : [];
    const markerActions = ["paymentMarker", "openUrlMarker", "captchaPanelMarker"]
        .map((key) => typeof result[key] === "string" ? markerToAction(key, result[key] as string) : null)
        .filter((action): action is ToolAction => Boolean(action));

    const seen = new Set<string>();
    return [...explicitActions, ...markerActions].filter((action) => {
        const key = JSON.stringify(action);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export function normalizeToolResult(result: unknown): ToolResultEnvelope {
    if (!isRecord(result)) {
        return {
            success: true,
            status: "ok",
            data: result,
            meta: {},
            error: null,
            actions: [],
        };
    }

    const success = typeof result.success === "boolean"
        ? result.success
        : !("error" in result);
    const status = typeof result.status === "string" && result.status
        ? result.status
        : success ? "ok" : "error";
    const meta = isRecord(result.meta) ? result.meta : {};
    const errorValue = result.error ?? (success ? null : result.message);

    return {
        ...result,
        success,
        status,
        data: "data" in result ? result.data : null,
        meta,
        error: errorValue === undefined || errorValue === null ? null : String(errorValue),
        actions: extractToolActions(result),
    };
}

export function toolError(status: string, error: string): ToolResultEnvelope {
    return normalizeToolResult({
        success: false,
        status,
        error,
    });
}
