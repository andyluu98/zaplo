# Plan v2: Module Đăng bài Tự động — Quản lý theo Agent

**Ngày:** 2026-06-22 · **Nhánh:** feat/automation · **Trạng thái:** CHỜ DUYỆT (đã rà soát 4 sub-agent)
**Mockup:** [visuals/app-prototype.html](visuals/app-prototype.html) · [visuals/orchestrator.html](visuals/orchestrator.html)

## Mục tiêu
Module **agent-centric**: mỗi Agent phụ trách 1+ nhóm Zalo, tự viết (trợ lý AI riêng) và tự đăng đều theo lịch (định kỳ + calendar). Gom quản lý: prompt, API, agent, nhóm, lịch, bài đăng, ảnh, thống kê.

## Quyết định đã chốt (đề xuất từ rà soát — chờ user xác nhận)
| # | Quyết định | Chọn |
|---|---|---|
| 1 | Chế độ duyệt mặc định | **Cần duyệt tay** (an toàn), mỗi agent tự đổi sang tự-đăng |
| 2 | Trần bài/ngày | mặc định 2 · preset 1/2/3/4/6 · trần cứng 12 |
| 3 | 1 agent nhiều nhóm | **cùng 1 bài** cho mọi nhóm (muốn khác → tạo agent khác) |
| 4 | Tab cũ | **thay hẳn** (migrate sang 1 agent mặc định), giữ IPC cũ 1 bản |
| 5 | Agent ↔ tài khoản | **1 agent = 1 tài khoản Zalo** |
| 6 | Thư viện ảnh | shared theo tài khoản; mọi agent dùng chung |
| 7 | "Xem trên Zalo" | hoãn (cần lưu zalo_msg_id) — v1 bỏ |

## Mô hình dữ liệu (đã sửa theo rà soát)
| Bảng | Cột |
|---|---|
| `posting_agent` (mới) | id, **owner_zalo_id**, name, assistant_id, enabled, approval_mode(auto/manual), image_mode(auto/fixed/none), image_count, created_at, updated_at |
| `agent_pillar` (mới) | agent_id, pillar_id · *ON DELETE CASCADE* |
| `agent_group` (mới) | agent_id, group_id, position · *CASCADE* |
| `agent_schedule` (mới) | **id PK**, agent_id, kind(daily/weekly/monthly/once), weekdays, month_days, date(yyyy-mm-dd), **time(HH:MM)**, window_start, window_end, posts_per_day, enabled · *CASCADE* |
| `agent_image` (mới, cho image_mode=fixed) | agent_id, image_asset_id, position |
| `content_pillar` (đổi) | +assistant_id (đã có 26.6.9) |
| `content_draft` (đổi) | +**agent_id**, +**scheduled_at** |
| `post_log` (đổi) | +**agent_id** (thống kê theo agent) |
| dùng lại | ai_assistants, image_asset |

**Trạng thái "Lỗi":** KHÔNG thêm vào DraftApprovalStatus. Bộ lọc "Lỗi" query `post_log JOIN content_draft` (1 bài có thể fail 1 phần nhóm). "Đăng lại" thao tác theo post_log.

## Scheduler (AgentScheduler — thay PostingScheduler)
- **Rekey in-memory maps `zaloId` → `agentId`** (nhiều agent/1 account).
- **Schedule Resolver**: gộp mọi luật định kỳ + mốc `once` → danh sách giờ chạy/ngày.
- Edge-case BẮT BUỘC xử lý: timezone Asia/Ho_Chi_Minh; monthly day>số-ngày-tháng → kẹp về cuối tháng; `once` đã đăng → set enabled=0 (không lặp); cửa sổ đã qua → báo "hôm nay không có slot"; cap `countPostsToday` theo **owner_zalo_id+group** (chặn 2 agent đăng trùng nhóm).
- posts_per_day = số chu kỳ/ngày, mỗi chu kỳ gửi tới TẤT CẢ nhóm của agent; cap/nhóm = posts_per_day.

## IPC cần thêm (mới)
agent.list/get/create/update/delete/enable/postNow/status · schedule.list/save/delete (theo agentId) · calendar.list/add/delete · draft.list+generate (thêm agentId) · log.list (+agentId) · stats.agent · agent.resumeAll (startup). Giữ IPC cũ 1 bản rồi gỡ ở 26.8.0.

## Checklist chức năng theo màn (từ rà soát — phải đủ)
- **Agents (list):** trạng thái · trợ lý · chủ đề · **tên nhóm** · **giờ chạy kế** · **lần chạy cuối** · **số bài chờ duyệt/đã duyệt** · **cảnh báo lỗi** · tài khoản · actions: tạo/sửa/tạm dừng/**nhân bản**/**xóa(confirm)**/đăng thử/nhật ký(lọc đúng agent) · empty state · tìm kiếm.
- **Agent editor:** tên · **chọn tài khoản Zalo** · trợ lý (sửa nhanh inline, không rời modal) · chủ đề(multi) · nhóm(multi+**tìm kiếm**) · lịch định kỳ (daily/weekly **đủ T2–CN**/monthly **validate ngày**) + khung giờ + posts/day · **danh sách mốc calendar** (date+time picker, thêm/xóa) · **nhiều luật lịch** · ảnh (auto 2–3 / **fixed có picker** / none) · chế độ duyệt · bật/tắt trong editor · **validate** (nhóm≥1, giờ kết thúc>bắt đầu) · **Lưu & Bật ngay** · trạng thái lưu.
- **Lịch/Calendar:** **3 view thật** (ngày/tuần/tháng) · **prev/next tháng** · **lọc theo agent** · màu trạng thái (dự kiến/đã đăng/lỗi) · ngày quá khứ mờ · click ngày: xem/thêm/sửa-giờ/xóa bài.
- **Bài đăng:** lọc pending/approved/**rejected**/posted/**Lỗi** + theo agent · **nút Từ chối** · đăng-ngay trên bài **đã duyệt** · **badge "→ Tiếp theo"** (FIFO) · hiện nhóm/ảnh/giờ/lý-do-lỗi · **bulk duyệt/từ chối** · tìm kiếm/phân trang · badge nguồn (AI/tay).
- **Trợ lý AI/API:** name/platform/**model**/key/system-prompt/**bật-tắt**/**xóa**/test/thêm · cảnh báo nguồn-kép với Cài đặt (đề xuất: full sửa ở Cài đặt + sửa nhanh name/key/prompt tại đây) · "agent nào đang dùng".
- **Chủ đề/Prompt:** **modal editor** (name/description/tone/prompt + **gợi ý biến {name}{description}{tone}**/**chọn trợ lý**/bật-tắt) · xóa(confirm) · "agent nào dùng".
- **Ảnh:** **ô nhập prompt khi Sinh ảnh AI** + **chú thích cần key OpenAI** · upload/xóa/preview/đếm.
- **Thống kê:** lọc theo agent/nhóm/khoảng ngày; per-agent breakdown từ post_log.agent_id.

## 3 luồng end-to-end (phải thông)
1. Tạo agent → tự đăng: agent.create → AgentScheduler.start(agentId) → tick đọc agent_schedule → generate(agentId) → (gate) → post tới agent_group → post_log(agent_id).
2. Thêm mốc calendar: calendar.add(once,date,time) → hiện trên lịch → tới giờ resolver sinh+đăng → set enabled=0.
3. Bài lỗi → retry: post_log(failed,error,agent_id) → tab Bài đăng lọc Lỗi (JOIN) → "Đăng lại" theo post_log.

## Phases
| # | Phase | Verify |
|---|---|---|
| 1 | DB + migrate (bảng agent + agent_id/scheduled_at + migrate→1 agent mặc định, **1 transaction**) | mở app, dữ liệu cũ còn, agent mặc định chạy như cũ |
| 2 | AgentScheduler + Resolver (rekey agentId, edge-cases) | unit test resolver daily/weekly/monthly/once + timezone |
| 3 | Generator + Poster theo agent (nội dung+ảnh, fixed-image) | Đăng thử theo agent đúng nội dung+ảnh |
| 4 | UI Agents + Agent editor (đủ checklist) | tạo agent → chạy |
| 5 | UI Calendar (3 view, nav) + Bài đăng (reject/retry/next) | lịch hiện bài; duyệt/đăng/từ chối |
| 6 | UI Trợ lý AI/API + Chủ đề modal + Ảnh + Thống kê | sửa nhanh; số liệu khớp |
| 7 | Hoàn thiện + build 26.7.0 + cài đè | end-to-end 1 agent đăng tự động 1 chu kỳ |

## Câu hỏi mở còn lại (cần user chốt)
- Bỏ "Ảnh cố định" ở v1 cho gọn (chỉ auto 2–3 / none) hay làm luôn picker? 
- "Xem trên Zalo" có cần không (phải lưu zalo_msg_id)?
- Stats v1 mức cơ bản (KPI + theo agent) đủ chưa?
