/** Best-effort alert. No-op when the bot is not configured; never throws into the caller. */
export async function notify(message: string): Promise<void> {
	const token = process.env.TELEGRAM_BOT_HTTP_TOKEN;
	const chatId = process.env.TELEGRAM_BOT_CHANNEL_ID;
	if (!token || !chatId) return;
	try {
		const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ chat_id: chatId, text: message }),
			signal: AbortSignal.timeout(8000),
		});
		if (!res.ok) console.error("Telegram API error:", res.status, await res.text());
	} catch (error) {
		console.error("Telegram notify failed:", error);
	}
}
