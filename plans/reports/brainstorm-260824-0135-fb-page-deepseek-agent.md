# Brainstorm — Kênh Facebook Page + Agent DeepSeek cho Zaplo

Ngày: 2026-08-24 · Trạng thái: **Hợp đồng đã chốt, sẵn sàng lập kế hoạch**
Repo: `D:\Orca\zaplo` (andyluu98/zaplo, v26.8.0, clone shallow từ `main`)

## 1. Bằng chứng hiện trạng

Electron 41 + React 18 + TS 5 + SQLite (better-sqlite3), local-first, không backend cloud.

| Mảng | Đã có | Khoảng trống |
|---|---|---|
| Facebook | `src/services/facebook/` 19 file (~380KB): cookie login, `FacebookMQTTListener`, E2EE Go bridge, `FacebookThreadManager`; bảng `fb_accounts`/`fb_threads`/`fb_messages` | Toàn bộ là **tài khoản cá nhân**. Không có Graph API, không có `page_access_token`, không có bảng Page |
| DeepSeek | `AIPlatform` gồm `'deepseek'`; `AIAssistantService` gọi được; `ai_usage_logs` đếm token | Chưa nối vào kênh Page |
| Instruction | `ai_assistants.system_prompt` | — |
| Knowledge | `ai_assistant_files.content_text`; `buildSystemPrompt()` gộp **toàn văn mọi file** vào system prompt | Không chunk / không RAG → nút thắt token khi KB lớn |
| Agent auto-reply | `chat-agent-resolver` (pinned→label→group→default), `chat-agent-decider`, `message-aggregator`, `conversation_ai_state`, bảng `chat_agent*` | `chat-agent-dispatcher.ts` **chỉ nghe event Zalo** (`zca-js`, `zaloId`); grep "facebook" = 0 hit |
| Kiểu kênh | `agent-types.ts`: `Channel = 'fb' \| 'zalo'`, `derive-channel.ts` | Nhánh chat `fb` chưa tồn tại |
| Hạ tầng webhook | `HttpRelayService` (HTTP server cục bộ) + `TunnelService` (cloudflared quick tunnel, đã trong dependency + `extraResources`) | Đủ nhận webhook Meta, **không cần server ngoài** |

Kết luận: DeepSeek + instruction + knowledge + bộ định tuyến agent đã có. Việc thật = (1) kênh **Page** chưa tồn tại, (2) dispatcher chưa biết Facebook.

## 2. Hợp đồng

**Outcome** — Thêm kênh Facebook **Page** vào Zaplo: kết nối nhiều Page, đồng bộ + hiển thị hội thoại Messenger của Page trong UI chat sẵn có, và Agent dùng DeepSeek tự trả lời khách theo instruction + knowledge của Page đó với hành vi giống người thật.

**Constraints** — Local-first, không thêm hạ tầng cloud. Tái dùng `AIAssistantService`, `chat-agent-resolver`, `message-aggregator` thay vì viết engine mới. Không đụng đường FB cá nhân đang chạy. Tuân thủ chính sách Meta (cửa sổ 24h, chống spam).

**Non-goals** — Không RAG/vector store. Không comment-to-inbox, ads, catalog. Không đổi kiến trúc Zalo. Không đụng luồng FB cá nhân.

**Acceptance** — Kết nối 1 Page → tin khách hiện trong UI ≤5s → Agent trả lời đúng instruction, trích đúng dữ liệu knowledge → tin gửi thật lên Messenger → token ghi vào `ai_usage_logs` → tắt agent thì thread về chế độ trả lời tay.

## 3. Quyết định đã chốt

| # | Quyết định | Chọn | Lý do |
|---|---|---|---|
| 1 | Kết nối Page | **A — Graph API chính thức** | Repo đã sẵn hai mảnh khó nhất (HTTP relay + cloudflared). Kênh mới tách biệt, bảng riêng, rẻ nhất để bỏ nếu sai. Phương án B nhét Page vào stack cá nhân sẽ trộn rủi ro ToS vào thứ đang chạy tốt |
| 2 | Knowledge | **Giữ dump toàn văn** | KISS, tái dùng `buildSystemPrompt()` nguyên trạng. Chấp nhận giới hạn KB nhỏ |
| 3 | Thinking | ~~2 lượt: `deepseek-reasoner` → `deepseek-chat`~~ → **1 lượt, thinking bật** | **Sửa cùng ngày.** Hai model trong quyết định gốc đã bị DeepSeek khai tử 24/07/2026. Model hiện hành `deepseek-v4-flash` có sẵn thinking mode: một lượt gọi trả `reasoning_content` song song `content`, nên lượt thứ hai là thừa. Cùng mục tiêu, rẻ và nhanh gấp đôi |
| 4 | Model DeepSeek chết | **Vá trong cùng plan** | `deepseek-chat`/`deepseek-reasoner` vẫn còn trong dropdown UI và không được `normalizeModelName` map → trợ lý đang lưu chúng hiện gọi lỗi |

## 4. Hướng đã chọn

**Kênh Page (A)** — OAuth lấy `/me/accounts` → lưu Page Access Token; nhận tin qua Webhook `messages` (cloudflared → `HttpRelayService`); gửi qua Send API; typing indicator + read receipt chính chủ.

**Agent giống người — 4 tầng:**
1. Gom tin: `message-aggregator` gộp nhiều tin rời trong cửa sổ ngắn thành 1 lượt
2. Thinking: `deepseek-v4-flash` với `thinking:{type:'enabled'}` — một lượt gọi cho ra `reasoning_content` (lưu log để debug, không gửi khách) và `content` (câu trả lời)
3. Giống người: trễ tỉ lệ độ dài câu có nhiễu ngẫu nhiên, bật typing khi "gõ", tách câu dài thành nhiều tin, không markdown trong tin nhắn
4. Bàn giao: khách xin gặp người thật hoặc agent không chắc → tắt auto cho thread (`conversation_ai_state`), báo trong UI

## 5. Rủi ro còn mở

- **Token/KB**: dump toàn văn tốn nguyên bộ KB mỗi lượt. Nút thắt đầu tiên sẽ xuất hiện ở đây khi KB vượt ~20k ký tự. Đã chấp nhận cho vòng 1
- **App Review**: app Meta ở dev mode chạy được với Page do chính người dùng sở hữu; phát hành cho khách ngoài cần App Review + Business Verification. Cần kiểm chứng lại tài liệu Meta hiện hành ở bước plan
- **Webhook liên tục**: máy tắt là mất tin đến. Meta có retry nhưng hữu hạn — cần cơ chế backfill qua Conversations API khi app khởi động lại
- **Cửa sổ 24h**: ngoài 24h chỉ gửi được message tag hợp lệ. Agent phải biết dừng thay vì gửi lỗi

## 6. Bàn giao

Tiếp theo: skill lập kế hoạch → `/ak:cook`. Không có `--yagni`.
