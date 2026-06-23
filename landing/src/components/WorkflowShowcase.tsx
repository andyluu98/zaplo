import { useState } from 'react';
import DownloadDropdown from './DownloadDropdown';

// ── Workflow category data (derived from template store) ────────────────────────
const categories = [
  { key: 'ban-hang',  icon: '🛒', label: 'Bán hàng & CSKH',     color: 'from-blue-500 to-cyan-500',    glow: 'rgba(59,130,246,0.25)',  count: 10 },
  { key: 'quan-ly',   icon: '📋', label: 'Quản lý & Vận hành',   color: 'from-amber-500 to-orange-500', glow: 'rgba(245,158,11,0.25)',  count: 8 },
  { key: 'marketing', icon: '📣', label: 'Marketing & Tiếp thị', color: 'from-pink-500 to-rose-500',    glow: 'rgba(236,72,153,0.25)',  count: 6 },
  { key: 'thong-bao', icon: '🔔', label: 'Thông báo & Tích hợp', color: 'from-emerald-500 to-teal-500', glow: 'rgba(16,185,129,0.25)',  count: 6 },
  { key: 'nang-cao',  icon: '⚙️', label: 'Nâng cao',              color: 'from-rose-500 to-red-600',     glow: 'rgba(244,63,94,0.25)',   count: 5 },
];

// ── All 40 workflows (mirrors workflowTemplates.ts) ─────────────────────────────
// Đặt featured: true cho các mẫu muốn hiển thị ở tab "Tất cả"
const showcaseWorkflows = [
  // ── ban-hang (10) ──────────────────────────────────────────────────────────
  {
    icon: '💬', title: 'Tự động trả lời tin nhắn',
    desc: 'Gửi câu trả lời cố định khi nhận tin nhắn mới — phù hợp làm thông báo "đã nhận tin".',
    category: 'ban-hang', difficulty: 'easy' as const, featured: false,
    steps: ['Nhận tin nhắn', 'Hiệu ứng đang gõ', 'Gửi câu trả lời'],
  },
  {
    icon: '🔑', title: 'Trả lời theo từ khoá',
    desc: 'Phân nhánh theo tin nhắn: "giá" → gửi bảng giá, "địa chỉ" → gửi vị trí, còn lại → mặc định.',
    category: 'ban-hang', difficulty: 'medium' as const, featured: true,
    steps: ['Nhận tin nhắn', 'Kiểm tra "giá"?', 'Kiểm tra "địa chỉ"?', 'Gửi phản hồi phù hợp'],
  },
  {
    icon: '🤝', title: 'Tự động chấp nhận kết bạn & chào mừng',
    desc: 'Tự động chấp nhận lời mời kết bạn, chờ 2 giây rồi gửi tin nhắn chào mừng.',
    category: 'ban-hang', difficulty: 'easy' as const, featured: false,
    steps: ['Lời mời kết bạn', 'Chấp nhận', 'Chờ 2s', 'Gửi lời chào'],
  },
  {
    icon: '🌙', title: 'Trả lời tự động ngoài giờ làm việc',
    desc: 'Nhận diện tin nhắn ngoài giờ hành chính, gửi thông báo sẽ phản hồi vào ngày làm việc tiếp theo.',
    category: 'ban-hang', difficulty: 'medium' as const, featured: false,
    steps: ['Nhận tin nhắn', 'Lấy giờ hiện tại', 'Kiểm tra ngoài giờ?', 'Thông báo ngoài giờ'],
  },
  {
    icon: '🎁', title: 'Chăm sóc sau mua hàng (2 ngày)',
    desc: 'Khi gắn nhãn "Đã mua hàng", chờ 2 ngày rồi tự động hỏi thăm trải nghiệm sản phẩm.',
    category: 'ban-hang', difficulty: 'medium' as const, featured: false,
    steps: ['Gắn nhãn "Đã mua"', 'Chờ 2 ngày', 'Hiệu ứng gõ', 'Gửi hỏi thăm'],
  },
  {
    icon: '⏳', title: 'Follow-up sau 4 giờ chưa phản hồi',
    desc: 'Khi gắn nhãn "Chờ phản hồi", chờ 4 giờ rồi tự động gửi tin nhắc nhẹ nhàng.',
    category: 'ban-hang', difficulty: 'medium' as const, featured: false,
    steps: ['Gắn nhãn "Chờ phản hồi"', 'Chờ 4h', 'Chọn ngẫu nhiên', 'Gửi follow-up'],
  },
  {
    icon: '📬', title: 'Chuỗi chăm sóc 3 bước (1h → 1 ngày → 3 ngày)',
    desc: 'Khi gắn nhãn "Khách mới", tự động gửi 3 tin nhắn chăm sóc theo lịch tự động.',
    category: 'ban-hang', difficulty: 'advanced' as const, featured: true,
    steps: ['Gắn nhãn "Khách mới"', 'Chờ 1h → Chào', 'Chờ 1 ngày → Giới thiệu', 'Chờ 3 ngày → Ưu đãi'],
  },
  {
    icon: '👑', title: 'Chào đón khách VIP khi gắn nhãn',
    desc: 'Khi gắn nhãn "VIP", tự động gửi tin nhắn chào đón đặc biệt và thông báo quyền lợi VIP.',
    category: 'ban-hang', difficulty: 'easy' as const, featured: false,
    steps: ['Gắn nhãn "VIP"', 'Chờ 3s', 'Gửi chào đón VIP'],
  },
  {
    icon: '📸', title: 'Gửi menu/catalogue khi được hỏi',
    desc: 'Khi khách nhắn "sản phẩm", "menu"... tự động gửi danh mục sản phẩm đầy đủ.',
    category: 'ban-hang', difficulty: 'easy' as const, featured: false,
    steps: ['Nhận "sản phẩm/menu"', 'Hiệu ứng gõ', 'Gửi danh mục SP', 'Gắn nhãn quan tâm'],
  },
  {
    icon: '✅', title: 'Xác nhận đơn + gắn nhãn trạng thái',
    desc: 'Khi nhận tin "đặt hàng", gửi xác nhận, gắn nhãn "Đang xử lý", ghi log pipeline bán hàng.',
    category: 'ban-hang', difficulty: 'medium' as const, featured: false,
    steps: ['Nhận "đặt hàng"', 'Gắn nhãn "Đang xử lý"', 'Gửi xác nhận đơn', 'Ghi log'],
  },

  // ── quan-ly (8) ────────────────────────────────────────────────────────────
  {
    icon: '📊', title: 'Ghi đơn hàng vào Google Sheets',
    desc: 'Khi nhận tin chứa "đặt hàng", tự động lấy thông tin và ghi vào Google Sheets.',
    category: 'quan-ly', difficulty: 'medium' as const, featured: true,
    steps: ['Lọc từ khoá', 'Lấy thông tin KH', 'Ghi vào Sheets', 'Xác nhận đơn'],
  },
  {
    icon: '⏰', title: 'Gửi nhắc nhở hàng ngày trong nhóm',
    desc: 'Chạy tự động lúc 8h sáng mỗi ngày, gửi tin nhắn nhắc nhở vào nhóm Zalo.',
    category: 'quan-ly', difficulty: 'easy' as const, featured: false,
    steps: ['Lịch hẹn 8h sáng', 'Lấy ngày hôm nay', 'Soạn nội dung', 'Gửi vào nhóm'],
  },
  {
    icon: '🎉', title: 'Chào thành viên mới vào nhóm',
    desc: 'Khi có thành viên mới tham gia nhóm, tự động gửi chào mừng và gắn nhãn "Thành viên mới".',
    category: 'quan-ly', difficulty: 'easy' as const, featured: false,
    steps: ['Thành viên vào nhóm', 'Gửi lời chào', 'Gắn nhãn "Thành viên mới"'],
  },
  {
    icon: '🏷️', title: 'Gán nhãn theo từ khoá tin nhắn',
    desc: 'Tự động gắn nhãn cho hội thoại dựa trên nội dung tin nhắn. "giá" → "Quan tâm giá"...',
    category: 'quan-ly', difficulty: 'medium' as const, featured: false,
    steps: ['Nhận tin nhắn', 'Kiểm tra "giá"?', 'Kiểm tra "lỗi"?', 'Gắn nhãn tương ứng'],
  },
  {
    icon: '🚪', title: 'Thông báo khi thành viên rời nhóm',
    desc: 'Khi có thành viên rời nhóm, tự động gửi thông báo cho admin qua Telegram.',
    category: 'quan-ly', difficulty: 'easy' as const, featured: false,
    steps: ['Thành viên rời nhóm', 'Soạn báo cáo', 'Báo qua Telegram'],
  },
  {
    icon: '📈', title: 'Báo cáo cuối ngày qua Telegram',
    desc: 'Mỗi ngày lúc 18h, tự động lấy dữ liệu từ Google Sheets và gửi báo cáo vào Telegram.',
    category: 'quan-ly', difficulty: 'medium' as const, featured: false,
    steps: ['Lịch 18h hàng ngày', 'Đọc dữ liệu Sheets', 'Soạn báo cáo', 'Gửi Telegram'],
  },
  {
    icon: '📝', title: 'Quản lý xin nghỉ phép qua Zalo',
    desc: 'Nhân viên nhắn "xin nghỉ", hệ thống tự ghi Sheets và thông báo nhóm quản lý.',
    category: 'quan-ly', difficulty: 'medium' as const, featured: false,
    steps: ['Nhận "xin nghỉ"', 'Ghi vào Sheet', 'Thông báo nhóm QL', 'Xác nhận người gửi'],
  },
  {
    icon: '📦', title: 'Thông báo KH khi cập nhật trạng thái đơn',
    desc: 'Khi gắn nhãn "Đang giao"/"Đã giao"/"Hoàn thành", tự động gửi cập nhật cho khách.',
    category: 'quan-ly', difficulty: 'medium' as const, featured: true,
    steps: ['Gắn nhãn trạng thái', 'Phân nhánh nhãn', 'Gửi thông báo tương ứng'],
  },

  // ── marketing (6) ──────────────────────────────────────────────────────────
  {
    icon: '❤️', title: 'Tự động cảm ơn khi được react',
    desc: 'Khi ai đó react tin nhắn, tự động gửi lời cảm ơn ngẫu nhiên. Tăng tương tác tự nhiên.',
    category: 'marketing', difficulty: 'easy' as const, featured: false,
    steps: ['Khi có react', 'Chờ 1s', 'Chọn câu cảm ơn ngẫu nhiên', 'Gửi cảm ơn'],
  },
  {
    icon: '📨', title: 'Gửi tin nhắn hàng loạt từ Google Sheets',
    desc: 'Đọc danh sách khách từ Sheets, lặp và gửi tin nhắn cá nhân hoá cho từng người.',
    category: 'marketing', difficulty: 'advanced' as const, featured: false,
    steps: ['Chạy thủ công', 'Đọc danh sách KH', 'Lặp từng người', 'Soạn & gửi tin'],
  },
  {
    icon: '⭐', title: 'Nhắc khách đánh giá sau 7 ngày',
    desc: 'Khi gắn nhãn "Đã giao hàng", chờ 7 ngày rồi tự động nhờ khách đánh giá sản phẩm.',
    category: 'marketing', difficulty: 'medium' as const, featured: true,
    steps: ['Gắn nhãn "Đã giao"', 'Chờ 7 ngày', 'Hiệu ứng gõ', 'Gửi nhờ đánh giá'],
  },
  {
    icon: '🎯', title: 'Gửi ưu đãi theo nhãn khách hàng',
    desc: 'Khi gắn nhãn promo, tự động gửi ngay tin nhắn khuyến mãi đã soạn sẵn.',
    category: 'marketing', difficulty: 'easy' as const, featured: false,
    steps: ['Gắn nhãn promo', 'Chờ 5 giây', 'Gửi ưu đãi'],
  },
  {
    icon: '🔄', title: 'Re-engagement: Nhắn lại khách im lặng',
    desc: 'Đọc danh sách khách chưa nhắn >30 ngày từ Sheets, gửi tin gợi lại quan tâm.',
    category: 'marketing', difficulty: 'advanced' as const, featured: true,
    steps: ['Chạy thủ công', 'Đọc DS khách cũ', 'Lặp từng người', 'Gửi tin re-engage'],
  },
  {
    icon: '📊', title: 'Tạo poll khảo sát nhóm hàng tuần',
    desc: 'Mỗi thứ Hai tự động tạo bình chọn trong nhóm Zalo để khảo sát ý kiến thành viên.',
    category: 'marketing', difficulty: 'easy' as const, featured: false,
    steps: ['Thứ Hai lúc 9h', 'Tạo bình chọn nhóm', 'Ghi log'],
  },

  // ── thong-bao (6) ──────────────────────────────────────────────────────────
  {
    icon: '📲', title: 'Chuyển tiếp tin nhắn → Telegram',
    desc: 'Nhận tin nhắn từ Zalo, lọc từ khoá quan trọng rồi forward sang Telegram Bot ngay.',
    category: 'thong-bao', difficulty: 'medium' as const, featured: true,
    steps: ['Lọc từ khoá', 'Soạn nội dung', 'Gửi Telegram', 'Ghi log'],
  },
  {
    icon: '🔔', title: 'Thông báo đa kênh (Discord + Email)',
    desc: 'Nhận tin trên Zalo, đồng thời gửi thông báo vào Discord và Email để không bỏ lỡ.',
    category: 'thong-bao', difficulty: 'advanced' as const, featured: true,
    steps: ['Nhận tin nhắn', 'Soạn nội dung', 'Gửi Discord + Email', 'Phản hồi khách'],
  },
  {
    icon: '📝', title: 'Lưu khách hàng mới vào Notion',
    desc: 'Khi chấp nhận kết bạn, tự động lấy thông tin và tạo trang mới trong Notion Database.',
    category: 'thong-bao', difficulty: 'medium' as const, featured: false,
    steps: ['Lời mời kết bạn', 'Chấp nhận', 'Lấy thông tin', 'Ghi Notion', 'Gửi chào'],
  },
  {
    icon: '📡', title: 'Tổng hợp tin nhắn mỗi giờ → Telegram',
    desc: 'Mỗi giờ tự động gửi tóm tắt tình trạng hệ thống vào nhóm Telegram để team theo dõi.',
    category: 'thong-bao', difficulty: 'easy' as const, featured: false,
    steps: ['Mỗi giờ 1 lần', 'Lấy giờ hiện tại', 'Soạn tóm tắt', 'Gửi Telegram'],
  },
  {
    icon: '🚨', title: 'Cảnh báo tin nhắn nhạy cảm / spam',
    desc: 'Phát hiện từ khoá nhạy cảm trong nhóm, gửi cảnh báo ngay cho admin qua Telegram.',
    category: 'thong-bao', difficulty: 'medium' as const, featured: false,
    steps: ['Lọc từ khoá nhạy cảm', 'Soạn cảnh báo', 'Alert Telegram admin', 'Ghi log'],
  },
  {
    icon: '🔄', title: 'Đồng bộ khách mới → Sheets + Telegram',
    desc: 'Khi chấp nhận kết bạn, tự động ghi Sheets VÀ thông báo Telegram. Không bỏ sót khách.',
    category: 'thong-bao', difficulty: 'medium' as const, featured: false,
    steps: ['Kết bạn mới', 'Ghi Google Sheets', 'Thông báo Telegram', 'Gửi chào khách'],
  },

  // ── nang-cao (5) ───────────────────────────────────────────────────────────
  {
    icon: '🔗', title: 'Gọi Webhook / API khi nhận tin',
    desc: 'Khi nhận tin nhắn, tự động gọi API bên ngoài (CRM, ERP...) để đồng bộ dữ liệu.',
    category: 'nang-cao', difficulty: 'advanced' as const, featured: false,
    steps: ['Nhận tin nhắn', 'Tạo request body', 'Gọi API bên ngoài', 'Ghi log kết quả'],
  },
  {
    icon: '💾', title: 'Chuyển tiếp & lưu trữ tin nhắn quan trọng',
    desc: 'Lọc từ khoá quan trọng, chuyển tiếp sang chat lưu trữ và ghi Sheets. Không mất tin.',
    category: 'nang-cao', difficulty: 'medium' as const, featured: false,
    steps: ['Lọc từ khoá quan trọng', 'Chuyển tiếp tin', 'Soạn log', 'Ghi Sheets lưu trữ'],
  },
  {
    icon: '🚀', title: 'Kết bạn → Gắn nhãn → Chăm sóc sau 3 ngày',
    desc: 'Trọn bộ: Chấp nhận kết bạn → Gửi chào → Gắn nhãn Lead → 3 ngày sau gửi follow-up.',
    category: 'nang-cao', difficulty: 'advanced' as const, featured: true,
    steps: ['Kết bạn', 'Gửi chào mừng', 'Gắn nhãn "Lead mới"', 'Chờ 3 ngày → Follow-up'],
  },
  {
    icon: '🔀', title: 'Trả lời khác nhau: Chat riêng vs Nhóm',
    desc: 'Cùng 1 tin nhắn nhưng trả lời khác nhau: chat riêng → tư vấn 1:1, nhóm → mời inbox.',
    category: 'nang-cao', difficulty: 'medium' as const, featured: false,
    steps: ['Nhận tin nhắn', 'Chat riêng hay nhóm?', 'Trả lời phù hợp theo loại'],
  },
  {
    icon: '📅', title: 'Lập lịch gửi tin nhắn broadcast',
    desc: 'Đặt lịch gửi broadcast vào khung giờ vàng (T3 & T5 lúc 11h). Đọc DS từ Sheets tự động.',
    category: 'nang-cao', difficulty: 'advanced' as const, featured: false,
    steps: ['T3 & T5 lúc 11h', 'Đọc DS khách hàng', 'Chọn nội dung ngẫu nhiên', 'Gửi hàng loạt'],
  },
];

// ── Node types available ────────────────────────────────────────────────────────
const nodeTypes = [
  { icon: '⚡', label: '7 Trigger', desc: 'Tin nhắn, kết bạn, nhóm, react, nhãn, lịch hẹn, thủ công' },
  { icon: '💬', label: '17 Zalo Actions', desc: 'Gửi tin, ảnh, file, quản lý bạn bè & nhóm, bình chọn...' },
  { icon: '🧠', label: '6 Logic Nodes', desc: 'IF/Switch, Delay, ForEach, biến, Stop If' },
  { icon: '🤖', label: 'AI & ChatGPT', desc: 'Tạo nội dung, phân loại tin nhắn tự động' },
  { icon: '📊', label: 'Google Sheets', desc: 'Đọc, ghi, cập nhật bảng tính tự động' },
  { icon: '🔔', label: 'Đa kênh', desc: 'Telegram, Discord, Email SMTP, Notion' },
];

const difficultyLabel: Record<string, { text: string; cls: string }> = {
  easy:     { text: 'Dễ',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium:   { text: 'Trung bình', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  advanced: { text: 'Nâng cao',   cls: 'bg-slate-100 text-slate-800 border-slate-200' },
};

const WorkflowShowcase: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // "all" tab → chỉ hiện các mẫu có featured: true; category tab → tất cả trong danh mục
  const filtered = activeCategory
    ? showcaseWorkflows.filter(w => w.category === activeCategory)
    : showcaseWorkflows.filter(w => w.featured);

  return (
    <section id="workflow" className="orbit-shell py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-0 w-[500px] h-[500px] opacity-[0.14] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22), transparent)' }} />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] opacity-[0.14] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.18), transparent)' }} />
        <div className="absolute inset-0 opacity-[0.35] orbit-grid"
          style={{
            backgroundSize: '40px 40px',
          }} />
      </div>

      <div className="max-w-6xl mx-auto relative">
        <div className="mb-16 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <div className="orbit-badge mb-4 aos-element">
              ⚡ Workflow Builder
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-950 mb-5 aos-element delay-1">
              Tạo automation theo <span className="gradient-text">luồng công việc thật</span>
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl aos-element delay-2 leading-relaxed">
              Không chỉ là hiệu ứng kéo-thả: builder của Zaplo tập trung vào use case vận hành Zalo thực tế — phản hồi lead, theo dõi đơn, chăm sóc sau bán, cảnh báo nội bộ và tích hợp hệ thống ngoài.
            </p>
          </div>

          <div className="editorial-band aos-element delay-2 p-6 md:p-7">
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { value: '50+', label: 'mẫu dựng sẵn' },
                { value: '1 click', label: 'cài template' },
                { value: '24/7', label: 'chạy nền liên tục' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-3xl font-black">{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-3 mb-14 aos-element delay-2">
          {nodeTypes.map((nt) => (
            <div key={nt.label} className="planet-card rounded-2xl p-4 text-center hover:-translate-y-1 transition-all duration-300 group">
              <div className="text-2xl mb-2">{nt.icon}</div>
              <p className="text-slate-900 text-xs font-bold mb-1 group-hover:text-indigo-600 transition-colors">{nt.label}</p>
              <p className="text-slate-500 text-[10px] leading-tight">{nt.desc}</p>
            </div>
          ))}
        </div>

        <div className="mb-16 aos-element delay-3">
          <div className="stellar-panel rounded-[2rem] p-8 relative overflow-hidden">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full opacity-30 blur-3xl"
              style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent)' }} />

            <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
              <div>
                <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-8">
                  Ví dụ: AI tư vấn bán hàng tự động
                </p>

                <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-3 relative">
                  {[
                    { icon: '📩', label: 'Nhận tin nhắn', color: '#1d4ed8', group: 'Trigger' },
                    { icon: '🚫', label: 'Lọc điều kiện', color: '#0f172a', group: 'Logic' },
                    { icon: '⌨️', label: 'Đang gõ...', color: '#0891b2', group: 'Action' },
                    { icon: '🤖', label: 'AI tạo trả lời', color: '#0f766e', group: 'AI' },
                    { icon: '💬', label: 'Gửi tin nhắn', color: '#2563eb', group: 'Action' },
                  ].map((node, idx, arr) => (
                    <div key={node.label} className="flex items-center gap-3">
                      <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-lg border border-white/70"
                          style={{ backgroundColor: node.color + '14', boxShadow: `0 16px 34px ${node.color}20` }}
                        >
                          {node.icon}
                        </div>
                        <p className="text-slate-900 text-xs font-semibold text-center leading-tight">{node.label}</p>
                        <span className="text-[9px] font-medium px-2 py-0.5 rounded-full border border-slate-200 text-slate-500 bg-white/80">
                          {node.group}
                        </span>
                      </div>

                      {idx < arr.length - 1 && (
                        <svg className="w-6 h-6 text-slate-400 flex-shrink-0 hidden md:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      )}
                      {idx < arr.length - 1 && (
                        <svg className="w-5 h-5 text-slate-400 flex-shrink-0 md:hidden rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                {[
                  'Dùng template sẵn rồi sửa nhanh theo đúng nghiệp vụ của shop/team.',
                  'Nhìn được trigger, logic và action trong cùng một flow nên dễ debug hơn.',
                  'Phù hợp cho bán hàng, CSKH, nội bộ, chăm sóc sau bán và cảnh báo realtime.',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-4 text-sm leading-relaxed text-slate-700 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <p className="text-center text-slate-600 text-xs mt-8">
              Mỗi node được kết nối bằng kéo-thả · Chạy nền 24/7 · Lịch sử chạy chi tiết để debug
            </p>
          </div>
        </div>

        <div className="text-center mb-8 aos-element delay-3">
          <h3 className="text-2xl font-bold text-slate-950 mb-2">📦 Kho mẫu Workflow có sẵn</h3>
          <p className="text-slate-600 text-sm mb-6">
            50+ workflow dựng sẵn — chọn, xem trước, cài đặt trong 1 click
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <button
              onClick={() => setActiveCategory(null)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 border ${
                !activeCategory
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg shadow-indigo-500/10'
                  : 'bg-white/75 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-slate-900'
              }`}
            >
              Tất cả
            </button>
            {categories.map(cat => (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(activeCategory === cat.key ? null : cat.key)}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 border ${
                  activeCategory === cat.key
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg shadow-indigo-500/10'
                    : 'bg-white/75 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-slate-900'
                }`}
              >
                {cat.icon} {cat.label}
                <span className="ml-1.5 text-[10px] opacity-60">({cat.count})</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
          {filtered.map((wf) => {
            const diff = difficultyLabel[wf.difficulty];
            const cat = categories.find(c => c.key === wf.category);
            return (
              <div
                key={wf.title}
                className="planet-card rounded-[1.75rem] p-6 hover:-translate-y-1 transition-all duration-300 group"
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-11 h-11 rounded-2xl bg-white/80 border border-slate-200 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform shadow-[0_12px_32px_rgba(148,163,184,0.15)]">
                    {wf.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-slate-950 font-semibold text-sm leading-tight mb-1.5">{wf.title}</h4>
                    <div className="flex items-center gap-2 flex-wrap">
                      {cat && (
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium bg-gradient-to-r ${cat.color} text-white/90`}>
                          {cat.icon} {cat.label}
                        </span>
                      )}
                      <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${diff.cls}`}>
                        {diff.text}
                      </span>
                    </div>
                  </div>
                </div>

                <p className="text-slate-600 text-xs leading-relaxed mb-4">{wf.desc}</p>

                <div className="flex flex-wrap items-center gap-1.5">
                  {wf.steps.map((step, si) => (
                    <span key={si} className="flex items-center gap-1.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-medium">
                        {step}
                      </span>
                      {si < wf.steps.length - 1 && (
                        <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className="aos-element delay-4">
          <div className="stellar-panel rounded-[2rem] p-8 md:p-10 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-30 blur-3xl"
                 style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent)' }} />

            <div className="flex flex-col md:flex-row items-center gap-8 md:gap-12">
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
                {[
                  { value: '50+',  label: 'Mẫu có sẵn',        icon: '📦' },
                  { value: '6',    label: 'Danh mục',           icon: '📂' },
                  { value: '50+',  label: 'Loại node',          icon: '🧩' },
                  { value: '24/7', label: 'Chạy nền tự động',   icon: '⚡' },
                ].map(stat => (
                    <div key={stat.label}>
                      <div className="text-3xl mb-1">{stat.icon}</div>
                      <div className="text-2xl md:text-3xl font-black text-slate-950">{stat.value}</div>
                      <div className="text-xs text-slate-500 mt-1">{stat.label}</div>
                    </div>
                ))}
              </div>

              <div className="flex-shrink-0 text-center md:text-left">
                <h3 className="text-xl font-bold text-slate-950 mb-2">
                  Bắt đầu tự động hoá ngay
                </h3>
                <p className="text-slate-600 text-sm mb-5 max-w-xs">
                  Tải Zaplo, mở Kho mẫu Workflow, chọn & cài đặt chỉ 1 click.
                </p>
                <DownloadDropdown
                  label="Tải xuống ngay"
                  variant="primary"
                  align="left"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WorkflowShowcase;

