# Bố trí lại 3 trung tâm + Hub liên thông (Cách A)

**Goal:** Dọn trùng lặp, dựng 3 trung tâm (Zalo / FB / Hub), Hub là cửa sổ tổng đọc-ghi thẳng các hệ agent đang chạy → liên thông 2 chiều. KHÔNG đụng động cơ. Đổi icon ✏️ → logo Zalo.

**Nguyên tắc (Cách A):** Agent vẫn lưu ở hệ gốc (Zalo=`posting_agent`, FB=`mc_agent`, chat=`chat_agent`). Hub + trang kênh cùng render component đọc/ghi CÙNG IPC → sửa ở đâu cũng đồng bộ. Chỉ sửa file UI.

## TUYỆT ĐỐI KHÔNG ĐỤNG (động cơ)
- `src/services/posting/*` (posting-sender, agent-scheduler-service, posting-scheduler-service, content-draft-generator, posting-image-generator)
- `electron/ipc/postingIpc.ts`, `electron/ipc/agent-mc-ipc.ts`, `electron/ipc/chatAgentIpc.ts`, `electron/ipc/facebook*-ipc.ts`
- Các tab component đang chạy của trang Zalo (agents-tab, calendar-tab, drafts-tab, pillars-tab, image-library-tab, stats-tab) — chỉ TÁI DÙNG, không sửa logic.

## Việc cần làm (chỉ UI)

### T1 — Sidebar: icon Zalo
- `src/ui/components/layout/Sidebar.tsx`: thay SVG cây bút ở `groupPosting` (≈ dòng 406-409) bằng `<ZaloIcon size={16}/>` (import từ `@/components/common/ChannelBadge`). Đổi nhãn nav "Đăng bài nhóm" → "Zalo". Vẫn trỏ `view='groupPosting'`.

### T2 — Hub: 3 tab + liên thông
- `src/ui/components/agent-hub/agent-hub-page.tsx`:
  - Tab còn: `🧠 Trợ lý AI` (AIAssistantPage) · `✒️ Agent đăng bài` · `💬 Agent chat` (ChatAgentsTab).
  - BỎ tab nhúng `GroupPostingPage` (hết trùng) và tab `Agent đa kênh` riêng.
  - Tab `Agent đăng bài` = component mới `hub-posting-agents.tsx`: nút chuyển kênh [Zalo | FB]. Zalo→`<AgentsTab zaloId={activeAccountId}/>` (cùng `posting:agent.*` với trang Zalo → đồng bộ). FB→`<McAgentManager/>` (cùng `agent:mc.*` → đồng bộ).
- Tạo `src/ui/components/agent-hub/hub-posting-agents.tsx` (toggle kênh + render 2 component sẵn có).

### T3 — Trang FB: tab Agent liên thông
- `src/ui/components/facebook-write/fb-write-page.tsx`: tab `agent` thay Placeholder bằng `<McAgentManager/>` (cùng dữ liệu mc_agent với Hub → sửa FB ↔ Hub đồng bộ).

### T4 — Trang Zalo: giữ nguyên chức năng
- Không sửa logic. Agents tab tại đây = `posting_agent`, tự đồng bộ với Hub. (Tùy chọn: đổi nhãn "Bài đăng"→"Kho bài" cho khớp prototype — làm nếu không rủi ro.)

## Kiểm thử
- Đây là relayout UI, không có logic thuần mới → kiểm thử = build sạch + bấm thử: (1) đăng group Zalo vẫn chạy; (2) sửa agent Zalo ở Hub → trang Zalo thấy; (3) sửa agent FB ở FB page → Hub thấy; (4) icon Zalo hiển thị; (5) Hub hết tab trùng.

## Câu hỏi mở
- T4 có cần thêm tab "Soạn & Đăng" / "Nhóm Zalo" như prototype không? (Hiện compose nằm trong Agents/Drafts; nhóm Zalo lấy từ contacts.) → để hỏi sau, không chặn.
