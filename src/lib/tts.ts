import type { Language, Settings } from "./types";

/**
 * Generic TTS bridge client. Contract:
 *   POST {url}  body: { text, language }   (JSON)
 *   → audio/* binary, or JSON { audioUrl } | { audioBase64, mimeType }
 */
export async function synthesizeViaBridge(settings: Settings, text: string, language: Language, signal?: AbortSignal): Promise<Blob> {
  const url = settings.ttsBridgeUrl.trim();
  if (!url) throw new Error("Chưa cấu hình TTS Bridge URL trong Cài đặt.");
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "audio/*, application/json" };
  if (settings.ttsBridgeToken) headers.Authorization = `Bearer ${settings.ttsBridgeToken}`;
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ text, language }), signal });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`Bridge trả về HTTP ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ""}`);
  }
  const type = (res.headers.get("content-type") ?? "").toLowerCase();
  if (type.startsWith("audio/") || type === "application/octet-stream") {
    const blob = await res.blob();
    return blob.type ? blob : new Blob([blob], { type: "audio/mpeg" });
  }
  const json = (await res.json()) as { audioUrl?: string; url?: string; audioBase64?: string; audio?: string; mimeType?: string };
  const b64 = json.audioBase64 ?? json.audio;
  if (b64) {
    const clean = b64.replace(/^data:[^,]+,/, "");
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: json.mimeType ?? "audio/mpeg" });
  }
  const audioUrl = json.audioUrl ?? json.url;
  if (audioUrl) {
    const r2 = await fetch(audioUrl, { signal });
    if (!r2.ok) throw new Error(`Không tải được audio từ ${audioUrl} (HTTP ${r2.status})`);
    return await r2.blob();
  }
  throw new Error("Phản hồi Bridge không có audio (cần audio/* hoặc audioUrl/audioBase64).");
}
