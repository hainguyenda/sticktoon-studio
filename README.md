# StickToon Studio

Công cụ tạo video hoạt hình hài ngắn **9:16 (30–60s)** phong cách 2D flat cartoon / stickman, chạy 100% trên trình duyệt.

- **Next.js (App Router) + TypeScript + Tailwind CSS v4 + Zustand + Lucide + JSZip**
- Không backend: API key & cài đặt lưu trong `localStorage`, project / ảnh / clip / audio lưu trong `IndexedDB`.

## Chạy local

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start
```

## Deploy Vercel (1-click)

Đẩy repo lên GitHub → vercel.com/new → Import → Deploy. Không cần biến môi trường.

## Quy trình 4 bước

1. **Script & JSON Director** – nhập chủ đề, thời lượng, ngôn ngữ → Gemini trả JSON chặt (`voiceoverScript`, `characters`, `scenes[]` 8–15 cảnh). Copy nhanh voiceover, mở `giong-doc.vercel.app`, sửa JSON trực tiếp có validate, Import/Export `.json`.
2. **Visual Studio & Character Lock** – 1–4 ảnh nhân vật tham chiếu (upload hoặc AI) được gửi kèm mọi lần sinh ảnh; tạo ảnh từng cảnh hoặc hàng loạt (progress, retry/backoff theo `retryDelay` khi 429/5xx); kéo-thả ảnh `.png/.jpg/.webp` hoặc clip `.mp4/.webm`; sửa prompt/effect/SFX/duration trên thẻ cảnh.
3. **Audio & Waveform Timeline** – upload `.mp3/.wav`, sóng âm thật (Web Audio), Auto-Sync theo số từ (+ bắt vào khoảng lặng), kéo ranh giới cảnh bước 0.1s, click để tua, 6 SFX tổng hợp procedural (vine boom, record scratch, whoosh, pop, ding, cricket) + thay bằng file riêng. TTS Bridge URL tùy chọn trong Cài đặt.
4. **Engine & Export** – Canvas 1080×1920 @30fps, hiệu ứng `punch_zoom_in`, `dramatic_shake`, `freeze_grayscale`, `flash_cut`, `slow_zoom`; phụ đề (mặc định TẮT); xuất video bằng `captureStream` + `MediaRecorder` (ưu tiên MP4, fallback WebM) và xuất Project ZIP (`project.json`, `01.png`…, audio).

Project demo “Chuyến bay định mệnh” (5 cảnh vẽ bằng Canvas + giọng demo procedural) được nạp tự động ở lần mở đầu tiên, hoặc bấm **Demo** trên thanh tiêu đề.

## TTS Bridge contract

`POST <url>` với JSON `{ "text": string, "language": "vi" | "en" }` (kèm `Authorization: Bearer <token>` nếu có), trả về `audio/*` hoặc JSON `{ "audioUrl" }` / `{ "audioBase64", "mimeType" }`.

## Cấu trúc

```
src/app/            layout, page (client-only Studio), globals.css
src/components/     Studio, PreviewPanel, Timeline, modals, tabs/*
src/lib/            engine (canvas FX), player (audio mix + export), gemini, sfx, demo, sync, storage, zip, validate
src/store/          Zustand stores (project, playback)
```
