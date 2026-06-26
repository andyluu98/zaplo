# Trang Zalo đầy đủ theo prototype (8 tab) — 3 phase

**Mục tiêu:** Dựng lại trang Zalo đúng prototype proto-zalo, đủ tính năng. Tái dùng tối đa component đã có. Phần đụng động cơ = **THÊM nhánh Zalo** (không sửa code đăng Zalo cũ đang chạy). Build sau mỗi phase để test.

## Tab đích (proto-zalo)
1. 📊 Thống kê — dùng lại `StatsTab` ✅ (đã đưa lên đầu)
2. 📝 Soạn & Đăng — MỚI (soạn tay/AI → chọn nhóm → đăng ngay/hẹn lịch)
3. 🗂️ Kho bài — dùng lại `PostStoreTab` (post_store, không cần props) ✅
4. 🖼️ Thư viện ảnh — dùng lại `ImageLibraryTab` ✅
5. 📅 Lịch nội dung — dùng lại `ContentCalendarTab`+`rai-lich-modal` (cần truyền context Zalo + nối schedule-runner Zalo)
6. 👥 Nhóm Zalo — MỚI (list + đồng bộ qua `posting:groups.list`)
7. 🧩 Chủ đề — dùng lại `PillarsTab` ✅
8. 🤖 Tự động → Hub — nút chuyển sang Hub (setView('agentHub'))

## IPC đã có (không phải làm lại)
`posting:groups.list` · `posting:image.*` · `posting:pillar.*` · `posting:draft.*` · `posting:stats` · `posting:log.*` · `posting:agent.postNow` · `posting:test.postNow`. Kho bài/Lịch mới: `poststore:*`, `schedule:*`.

## Động cơ KHÔNG sửa
`src/services/posting/posting-sender.ts` (chỉ TÁI DÙNG hàm gửi), agent-scheduler-service, postingIpc handlers cũ.

---

## PHASE A — Bố cục 8 tab + tái dùng (KHÔNG đụng động cơ, rủi ro ~0)
- `group-posting-page.tsx`: đổi danh sách tab sang 8 mục trên. Map:
  - stats→StatsTab, store→PostStoreTab, images→ImageLibraryTab, pillars→PillarsTab.
  - compose→placeholder tạm (Phase B), calendar→ContentCalendarTab (Phase C nối Zalo), groups→Nhóm Zalo (mới, Phase A làm list+sync vì IPC có sẵn), hub→nút →Hub.
  - Bỏ tab "Agents" + "Bài đăng" khỏi trang Zalo (tự động đã ở Hub; draft gộp vào Kho bài). KHÔNG mất chức năng: agent vẫn quản ở Hub.
- Tạo `zalo-groups-tab.tsx` (mới): gọi `posting:groups.list` hiển thị nhóm + nút 🔄 Đồng bộ.
- Build → test: các tab cũ chạy, Kho bài hiện, Nhóm Zalo liệt kê nhóm.

## PHASE B — Soạn & Đăng (đăng tay Zalo)
- Tạo `zalo-compose-tab.tsx`: textarea + ✨AI viết (`ai:chat`) + chọn ảnh (`posting:image.list`) + chọn nhóm (`posting:groups.list`) + Đăng ngay/Hẹn lịch.
- Đăng ngay: cần path "đăng nội dung tới nhóm Zalo". Đọc `posting-sender.ts` tìm hàm gửi tái dùng; nếu chưa có IPC trực tiếp → thêm `posting:manualPost` (THÊM mới, gọi posting-sender). Hẹn lịch: ghi `content_schedule_item` channel='zalo'.
- Build → test: đăng tay 1 bài text + ảnh vào nhóm Zalo thật.

## PHASE C — Lịch rải bài cho Zalo
- `schedule-runner.postScheduledItem`: thêm nhánh `channel==='zalo'` → gọi posting-sender (giống Phase B). FB giữ nguyên.
- `ContentCalendarTab`/`rai-lich-modal`: truyền context Zalo (account + nhóm Zalo) để rải đúng kênh.
- Build → test: rải N bài Zalo ra nhiều ngày → tới giờ tự đăng nhóm Zalo.

## Câu hỏi mở
- Tab "Bài đăng" (drafts hệ cũ) bỏ khỏi trang Zalo — có cần giữ lối xem drafts ở đâu không? (Đề xuất: gộp vào Kho bài; drafts cũ vẫn truy được qua agent ở Hub.)
