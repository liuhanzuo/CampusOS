import { sportsSeleniumService } from "./services/sports-selenium/sports-selenium-service";

function getArg(name: string): string | undefined {
    const prefix = `--${name}=`;
    const inline = process.argv.find((arg) => arg.startsWith(prefix));
    if (inline) return inline.slice(prefix.length);

    const index = process.argv.indexOf(`--${name}`);
    if (index >= 0) return process.argv[index + 1];

    return undefined;
}

async function main() {
    const venueName = getArg("venue") || getArg("venueName") || process.argv[2];
    const date = getArg("date") || process.argv[3];

    if (!venueName) {
        console.log("用法: npm run open:sports-booking -- --venue=气膜馆羽毛球场 --date=2026-04-30");
        console.log("可用场馆:", sportsSeleniumService.getInteractiveVenues().map((venue) => venue.name).join("、"));
        process.exit(1);
    }

    const result = await sportsSeleniumService.openInteractiveBookingPage(venueName, date);
    console.log(JSON.stringify(result, null, 2));
    console.log("浏览器会保持打开。完成操作后按 Ctrl+C 退出。");

    await new Promise(() => undefined);
}

main().catch(async (e) => {
    console.error(e);
    await sportsSeleniumService.close();
    process.exit(1);
});

process.on("SIGINT", async () => {
    await sportsSeleniumService.close();
    process.exit(0);
});
