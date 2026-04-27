import dayjs from "dayjs";

export function parseRelativeDate(dateStr?: string): string | undefined {
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

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }
    return undefined;
}
