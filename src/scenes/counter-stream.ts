export async function readCounterReply(response: Response, onDelta: (text: string) => void) {
  if (!response.ok) return;
  if (!response.headers.get("content-type")?.includes("application/x-ndjson")) {
    const data = await response.json();
    if (data.source === "model" && typeof data.line === "string") return data.line;
    return;
  }
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = "", text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let end = buffer.indexOf("\n");
      while (end >= 0) {
        const event = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        if (event.error) return;
        if (typeof event.line === "string") return event.line;
        if (typeof event.delta === "string") {
          text += event.delta;
          onDelta(text);
        }
        end = buffer.indexOf("\n");
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
