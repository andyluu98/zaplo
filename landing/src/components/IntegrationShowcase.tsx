import { useState } from 'react';

type IntegrationPlatform = {
  icon: string;
  name: string;
  color: string;
  dot: string;
  desc: string;
  features: string[];
  featuredInAll?: boolean;
};

type IntegrationTab = {
  key: string;
  icon: string;
  label: string;
  color: string;
  glow: string;
  activeColor: string;
  platforms: IntegrationPlatform[];
};

// ─── Integration tabs ──────────────────────────────────────────────────────────
const integrationTabs: IntegrationTab[] = [
  {
    key: 'ai',
    icon: '🤖',
    label: 'Trợ lý (AI)',
    color: 'from-cyan-500 to-blue-600',
    glow: 'rgba(6,182,212,0.25)',
    activeColor: 'bg-cyan-50 border-cyan-200 text-cyan-700',
    platforms: [
      {
        icon: '🤖', name: 'OpenAI (ChatGPT)',
        color: 'bg-green-50 border-green-200 text-green-700', dot: 'bg-green-500',
        desc: 'AI phổ biến và mạnh mẽ nhất thế giới',
        features: [' AI Assistant tự động trả lời chat', 'Phân loại tin nhắn bằng AI', 'Gợi ý câu trả lời thông minh', 'Nạp file kiến thức & sản phẩm', 'Tích hợp dữ liệu POS vào prompt'],
        featuredInAll: true,
      },
      {
        icon: '💎', name: 'Google Gemini',
        color: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500',
        desc: 'AI của Google, nhanh, rẻ, context dài',
        features: [' AI Assistant tự động trả lời chat', 'Phân loại tin nhắn bằng AI', 'Gợi ý câu trả lời thông minh', 'Nạp file kiến thức & sản phẩm', 'Context window cực lớn'],
        featuredInAll: true,
      },
      {
        icon: '🔮', name: 'DeepSeek',
        color: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500',
        desc: 'AI Trung Quốc, giá rẻ, lý luận mạnh',
        features: [' AI Assistant tự động trả lời chat', 'Phân loại tin nhắn bằng AI', 'Gợi ý câu trả lời thông minh', 'Nạp file kiến thức & sản phẩm', 'Chi phí cực thấp'],
      },
      {
        icon: '⚡', name: 'Grok (xAI)',
        color: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500',
        desc: 'AI của Elon Musk, nhanh và sáng tạo',
        features: [' AI Assistant tự động trả lời chat', 'Phân loại tin nhắn bằng AI', 'Gợi ý câu trả lời thông minh', 'Nạp file kiến thức & sản phẩm', 'Phản hồi nhanh, sáng tạo'],
      },
    ],
  },
  {
    key: 'pos',
    icon: '🛒',
    label: 'POS & Bán hàng',
    color: 'from-orange-500 to-amber-500',
    glow: 'rgba(249,115,22,0.25)',
    activeColor: 'bg-orange-50 border-orange-200 text-orange-700',
    platforms: [
      {
        icon: '🛒', name: 'KiotViet',
        color: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500',
        desc: 'Phần mềm quản lý bán hàng phổ biến nhất Việt Nam',
        features: ['Tra cứu đơn hàng', 'Tạo đơn hàng', 'Tìm khách hàng', 'Tìm sản phẩm'],
        featuredInAll: true,
      },
      {
        icon: '🏪', name: 'Haravan',
        color: 'bg-indigo-50 border-indigo-200 text-indigo-700', dot: 'bg-indigo-500',
        desc: 'Nền tảng thương mại điện tử & bán lẻ đa kênh',
        features: ['Tra cứu đơn hàng', 'Tạo đơn hàng', 'Tìm khách hàng', 'Tìm sản phẩm'],
      },
      {
        icon: '🟢', name: 'Sapo',
        color: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500',
        desc: 'Quản lý bán hàng đa kênh cho SME',
        features: ['Tra cứu đơn hàng', 'Tạo đơn hàng', 'Tìm sản phẩm'],
      },
      {
        icon: '🥞', name: 'Pancake POS',
        color: 'bg-pink-50 border-pink-200 text-pink-700', dot: 'bg-pink-500',
        desc: 'Nền tảng omnichannel mạnh cho social commerce và bán hàng đa kênh',
        features: ['Tra cứu đơn hàng', 'Tạo đơn hàng', 'Tìm khách hàng', 'Tìm sản phẩm'],
        featuredInAll: true,
      },
      {
        icon: '📦', name: 'Nhanh.vn',
        color: 'bg-yellow-50 border-yellow-200 text-yellow-700', dot: 'bg-yellow-500',
        desc: 'Quản lý đơn hàng & kho hàng tập trung',
        features: ['Tra cứu đơn hàng', 'Tạo đơn hàng', 'Tìm khách hàng', 'Tìm sản phẩm'],
      },
    ],
  },
  {
    key: 'shipping',
    icon: '🚚',
    label: 'Vận chuyển',
    color: 'from-rose-500 to-red-600',
    glow: 'rgba(244,63,94,0.25)',
    activeColor: 'bg-rose-50 border-rose-200 text-rose-700',
    platforms: [
      {
        icon: '🚚', name: 'GHN Express',
        color: 'bg-rose-50 border-rose-200 text-rose-700', dot: 'bg-rose-500',
        desc: 'Đơn vị vận chuyển nhanh hàng đầu Việt Nam',
        features: ['Tạo vận đơn tự động', 'Tra cứu trạng thái giao hàng', 'Tính phí vận chuyển', 'Webhook cập nhật realtime'],
        featuredInAll: true,
      },
      {
        icon: '📬', name: 'GHTK',
        color: 'bg-teal-50 border-teal-200 text-teal-700', dot: 'bg-teal-500',
        desc: 'Giao hàng tiết kiệm — mạng lưới toàn quốc',
        features: ['Tạo vận đơn tự động', 'Tra cứu trạng thái', 'Webhook trạng thái đơn', 'Tính phí vận chuyển'],
      },
    ],
  },
  {
    key: 'payment',
    icon: '💳',
    label: 'Thanh toán',
    color: 'from-violet-500 to-purple-600',
    glow: 'rgba(124,58,237,0.25)',
    activeColor: 'bg-violet-50 border-violet-200 text-violet-700',
    platforms: [
      {
        icon: '💰', name: 'Casso',
        color: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500',
        desc: 'Đối chiếu ngân hàng tự động — kết nối đa ngân hàng',
        features: ['Webhook khi nhận tiền', 'Xác minh thanh toán realtime', 'Lịch sử giao dịch', 'Filter theo mô tả/số tiền'],
        featuredInAll: true,
      },
      {
        icon: '💳', name: 'SePay (VietQR)',
        color: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500',
        desc: 'Thanh toán QR Code — chuẩn VietQR quốc gia',
        features: ['Tạo QR thanh toán động', 'Webhook xác nhận tức thì', 'Xác minh giao dịch', 'Tích hợp đa ngân hàng'],
      },
    ],
  },
];

const allIntegrationTab: IntegrationTab = {
  key: 'all',
  icon: '✨',
  label: 'Tất cả',
  color: 'from-violet-500 to-fuchsia-500',
  glow: 'rgba(168,85,247,0.25)',
  activeColor: 'bg-slate-900 border-slate-900 text-white',
  platforms: integrationTabs.flatMap(tab => {
    const featuredPlatforms = tab.platforms.filter(platform => platform.featuredInAll);
    return featuredPlatforms.length > 0 ? featuredPlatforms : tab.platforms.slice(0, 1);
  }),
};

const integrationTabOptions: IntegrationTab[] = [allIntegrationTab, ...integrationTabs];

// ─── Integration workflow templates ───────────────────────────────────────────
const integrationCategories = [
  { key: 'ai',       icon: '🤖', label: 'AI',        color: 'from-cyan-500 to-blue-600' },
  { key: 'payment',  icon: '⚡', label: 'Thanh toán', color: 'from-violet-500 to-purple-600' },
  { key: 'order',    icon: '🛒', label: 'Đơn hàng',   color: 'from-orange-500 to-amber-500' },
  { key: 'shipping', icon: '🚚', label: 'Vận chuyển',  color: 'from-rose-500 to-red-600' },
  { key: 'customer', icon: '👤', label: 'Khách hàng',  color: 'from-blue-500 to-cyan-500' },
  { key: 'data',     icon: '📊', label: 'Dữ liệu',     color: 'from-emerald-500 to-teal-500' },
];

const integrationTemplates = [
  // ── AI ──
  {
    icon: '🤖', title: ' AI Assistant tư vấn bán hàng tự động',
    desc: 'Khách nhắn tin → AI phân tích ngữ cảnh, tra sản phẩm/đơn hàng trên POS, soạn câu trả lời chuyên nghiệp, gửi tự động qua Zalo.',
    category: 'ai', difficulty: 'easy' as const, featured: true,
    platforms: ['OpenAI / Gemini', 'Zalo'],
    steps: ['Tin nhắn mới', 'AI phân tích', 'Tra dữ liệu POS', 'Gửi trả lời'],
  },
  {
    icon: '🏷️', title: 'AI phân loại tin nhắn → Phân nhánh xử lý',
    desc: 'Tin nhắn đến → AI tự phân loại: hỏi giá, khiếu nại, đặt hàng, khác → mỗi loại đi nhánh workflow riêng, xử lý chính xác.',
    category: 'ai', difficulty: 'medium' as const, featured: true,
    platforms: ['OpenAI / Gemini', 'Zalo'],
    steps: ['Nhận tin nhắn', 'AI phân loại', 'Phân nhánh Switch', 'Xử lý từng loại'],
  },
  {
    icon: '💡', title: 'AI gợi ý trả lời trong khung chat',
    desc: 'Khi khách nhắn tin, AI gợi ý 2-3 câu trả lời hay nhất ngay trong khung soạn. Nhấp chọn → gửi ngay, tiết kiệm thời gian.',
    category: 'ai', difficulty: 'easy' as const, featured: true,
    platforms: ['OpenAI / Gemini / DeepSeek / Grok'],
    steps: ['Tin nhắn đến', 'AI phân tích', 'Hiện gợi ý', 'Nhấp gửi'],
  },
  {
    icon: '📚', title: 'Nạp kiến thức sản phẩm cho AI',
    desc: 'Upload file PDF, Excel, TXT chứa thông tin sản phẩm, bảng giá, FAQ. AI học và trả lời chính xác dựa trên dữ liệu thực.',
    category: 'ai', difficulty: 'easy' as const, featured: false,
    platforms: ['OpenAI / Gemini'],
    steps: ['Upload file kiến thức', 'AI xử lý & học', 'Khách hỏi', 'AI trả lời chính xác'],
  },
  {
    icon: '🔄', title: 'Đa trợ lý — mỗi tài khoản AI khác nhau',
    desc: 'Tạo nhiều  AI Assistant với prompt/model khác nhau. Gán riêng cho từng tài khoản Zalo: shop A dùng OpenAI, shop B dùng Gemini.',
    category: 'ai', difficulty: 'medium' as const, featured: false,
    platforms: ['Đa nền tảng AI'],
    steps: ['Tạo trợ lý A, B', 'Gán cho tài khoản', 'Khách nhắn', 'Đúng AI xử lý'],
  },
  {
    icon: '❓', title: 'AI FAQ Bot — Trả lời câu hỏi thường gặp',
    desc: 'Cung cấp bộ FAQ trong prompt hoặc nạp file kiến thức, AI tự trả lời chính xác dựa trên thông tin bạn cung cấp.',
    category: 'ai', difficulty: 'easy' as const, featured: false,
    platforms: ['OpenAI / Gemini / DeepSeek / Grok'],
    steps: ['Nhận tin nhắn', 'Bỏ qua rỗng', 'AI trả lời từ FAQ', 'Gửi câu trả lời'],
  },
  {
    icon: '📑', title: 'AI tóm tắt cuộc hội thoại',
    desc: 'Lấy 20 tin nhắn gần nhất, dùng AI tóm tắt nội dung chính, yêu cầu và action items — tiết kiệm thời gian đọc lại.',
    category: 'ai', difficulty: 'medium' as const, featured: false,
    platforms: ['OpenAI / Gemini'],
    steps: ['Chạy thủ công', 'Lấy 20 tin nhắn', 'AI tóm tắt', 'Ghi log kết quả'],
  },
  {
    icon: '✍️', title: 'AI soạn nội dung marketing',
    desc: 'Nhập chủ đề sản phẩm → AI tự soạn bài viết marketing hấp dẫn để gửi hoặc đăng nhóm Zalo.',
    category: 'ai', difficulty: 'medium' as const, featured: false,
    platforms: ['OpenAI / Gemini / DeepSeek'],
    steps: ['Nhận "viết [chủ đề]"', 'AI soạn bài marketing', 'Gửi nội dung'],
  },
  // ── payment ──
  {
    icon: '⚡', title: 'Xác nhận thanh toán tự động',
    desc: 'Casso/SePay webhook nhận tiền → lọc mô tả chứa mã đơn → tra POS → Zalo gửi xác nhận ngay cho khách.',
    category: 'payment', difficulty: 'medium' as const, featured: false,
    platforms: ['Casso', 'POS'],
    steps: ['Webhook Casso', 'Lọc mô tả', 'Tra đơn POS', 'Zalo xác nhận'],
  },
  {
    icon: '💳', title: 'VietQR → Gắn nhãn "Đã thanh toán"',
    desc: 'SePay xác nhận thanh toán → tìm hội thoại theo SĐT → gắn nhãn "Đã thanh toán" → ghi Google Sheets.',
    category: 'payment', difficulty: 'medium' as const, featured: true,
    platforms: ['SePay', 'Zalo'],
    steps: ['Webhook SePay', 'Tìm hội thoại', 'Gắn nhãn', 'Ghi Sheets'],
  },
  {
    icon: '📊', title: 'Tổng hợp giao dịch ngày → Telegram',
    desc: 'Mỗi tối 18h, lấy danh sách giao dịch từ Casso, tổng hợp, gửi báo cáo vào nhóm Telegram.',
    category: 'payment', difficulty: 'advanced' as const, featured: false,
    platforms: ['Casso', 'Telegram'],
    steps: ['Cron 18h hàng ngày', 'Lấy giao dịch Casso', 'Tổng hợp dữ liệu', 'Báo cáo Telegram'],
  },
  // ── order ──
  {
    icon: '🔔', title: 'Tạo đơn hàng mới → Thông báo khách',
    desc: 'Khi tạo đơn hàng từ chat, tự động gửi tin nhắn xác nhận đơn với chi tiết sản phẩm, địa chỉ giao, dự kiến giao hàng.',
    category: 'order', difficulty: 'easy' as const, featured: true,
    platforms: ['POS', 'Zalo'],
    steps: ['Tạo đơn POS', 'Lấy chi tiết đơn', 'Soạn tin xác nhận', 'Gửi Zalo khách'],
  },
  {
    icon: '🔍', title: 'Tra đơn theo từ khoá trong chat',
    desc: 'Khách nhắn "tra đơn [mã/SĐT]" → tự động tra POS → gửi kết quả chi tiết đơn hàng ngay trong hội thoại.',
    category: 'order', difficulty: 'medium' as const, featured: false,
    platforms: ['POS', 'Zalo'],
    steps: ['Nhận "tra đơn"', 'Trích xuất mã/SĐT', 'Tra đơn POS', 'Gửi kết quả'],
  },
  {
    icon: '📦', title: 'Cập nhật trạng thái đơn → Zalo',
    desc: 'Khi trạng thái đơn thay đổi (Đang xử lý → Đang giao → Đã giao), tự động nhắn khách qua Zalo.',
    category: 'order', difficulty: 'medium' as const, featured: true,
    platforms: ['POS', 'Zalo'],
    steps: ['Webhook POS', 'Phân nhánh trạng thái', 'Soạn tin phù hợp', 'Gửi Zalo'],
  },
  {
    icon: '✅', title: 'Đơn POS → Ghi Google Sheets',
    desc: 'Mỗi đơn hàng mới trên POS sẽ tự động ghi vào Google Sheets để theo dõi tập trung.',
    category: 'order', difficulty: 'medium' as const, featured: false,
    platforms: ['POS', 'Google Sheets'],
    steps: ['Webhook đơn mới', 'Lấy chi tiết đơn', 'Format dữ liệu', 'Ghi Google Sheets'],
  },
  // ── shipping ──
  {
    icon: '🚚', title: 'Tạo vận đơn GHN sau khi đặt hàng',
    desc: 'Đơn hàng xác nhận → tự động tạo vận đơn GHN Express → cập nhật mã tracking vào POS → nhắn khách.',
    category: 'shipping', difficulty: 'advanced' as const, featured: true,
    platforms: ['GHN', 'POS', 'Zalo'],
    steps: ['Xác nhận đơn', 'Tạo vận đơn GHN', 'Cập nhật POS', 'Gửi tracking Zalo'],
  },
  {
    icon: '📬', title: 'GHTK giao thành công → Chăm sóc sau bán',
    desc: 'Webhook GHTK giao hàng thành công → gắn nhãn "Đã giao" → 2 ngày sau tự động hỏi thăm trải nghiệm.',
    category: 'shipping', difficulty: 'medium' as const, featured: false,
    platforms: ['GHTK', 'Zalo'],
    steps: ['Webhook "Đã giao"', 'Gắn nhãn Zalo', 'Chờ 2 ngày', 'Gửi hỏi thăm'],
  },
  // ── customer ──
  {
    icon: '👤', title: 'Kết bạn → Tạo khách hàng lên POS',
    desc: 'Khi chấp nhận kết bạn, tự động lấy thông tin Zalo, tạo khách hàng mới trên POS, gửi chào mừng.',
    category: 'customer', difficulty: 'medium' as const, featured: true,
    platforms: ['POS', 'Zalo'],
    steps: ['Kết bạn mới', 'Lấy thông tin Zalo', 'Tạo KH POS', 'Gửi chào mừng'],
  },
  {
    icon: '🏷️', title: 'Đồng bộ nhãn KH giữa Zalo & POS',
    desc: 'Khi gắn nhãn "VIP" trên Zalo, tự động tìm KH trên POS, cập nhật tag, ghi Sheets theo dõi.',
    category: 'customer', difficulty: 'advanced' as const, featured: false,
    platforms: ['POS', 'Zalo'],
    steps: ['Gắn nhãn Zalo', 'Tìm KH POS', 'Cập nhật tag', 'Ghi Sheets'],
  },
  // ── data ──
  {
    icon: '📊', title: 'Dashboard doanh thu tự động',
    desc: 'Mỗi ngày lấy dữ liệu đơn hàng từ POS, tính toán doanh thu, cập nhật Google Sheets dashboard.',
    category: 'data', difficulty: 'advanced' as const, featured: true,
    platforms: ['POS', 'Google Sheets'],
    steps: ['Cron 23h hàng ngày', 'Lấy đơn hàng POS', 'Tính doanh thu', 'Cập nhật Sheets'],
  },
  {
    icon: '🔄', title: 'Đồng bộ tồn kho POS → Cảnh báo Telegram',
    desc: 'Mỗi giờ lấy tồn kho từ POS, phát hiện sản phẩm sắp hết hàng, cảnh báo ngay vào Telegram.',
    category: 'data', difficulty: 'advanced' as const, featured: false,
    platforms: ['POS', 'Telegram'],
    steps: ['Cron mỗi giờ', 'Lấy tồn kho POS', 'Phát hiện sắp hết', 'Cảnh báo Telegram'],
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const difficultyLabel: Record<string, { text: string; cls: string }> = {
  easy:     { text: 'Dễ',         cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  medium:   { text: 'Trung bình', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  advanced: { text: 'Nâng cao',   cls: 'bg-slate-100 text-slate-800 border-slate-200' },
};

// ─── Platform card ─────────────────────────────────────────────────────────────
function PlatformCard({ platform }: { platform: IntegrationPlatform }) {
  return (
    <div className="planet-card rounded-[1.5rem] p-5 transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-center gap-2 mb-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${platform.color}`}>
          <span className="text-base leading-none">{platform.icon}</span>
          <span>{platform.name}</span>
          <span className={`w-1.5 h-1.5 rounded-full ${platform.dot} opacity-90`} />
        </div>
      </div>
      <p className="text-slate-600 text-xs mb-3 leading-relaxed">{platform.desc}</p>
      <ul className="space-y-1.5">
        {platform.features.map(f => (
          <li key={f} className="flex items-center gap-2 text-xs text-slate-700">
            <span className="w-1 h-1 rounded-full bg-indigo-300 flex-shrink-0" />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function IntegrationShowcase() {
  const [activeTab, setActiveTab] = useState('all');
  const [activeTemplateCategory, setActiveTemplateCategory] = useState<string | null>(null);

  const currentTab = integrationTabOptions.find(t => t.key === activeTab) || allIntegrationTab;

  const filteredTemplates = activeTemplateCategory
    ? integrationTemplates.filter(t => t.category === activeTemplateCategory)
    : integrationTemplates.filter(t => t.featured);

  return (
    <section id="integration" className="orbit-shell py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[500px] h-[500px] opacity-[0.16] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(249,115,22,0.18), transparent)' }} />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] opacity-[0.16] blur-3xl"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.18), transparent)' }} />
        <div className="absolute inset-0 opacity-[0.28] orbit-grid"
          style={{
            backgroundSize: '40px 40px',
          }} />
      </div>

      <div className="max-w-6xl mx-auto relative">

        <div className="mb-12 grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
          <div>
            <div className="orbit-badge mb-4 aos-element">
              🔌 Kết nối & tích hợp
            </div>
            <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-950 mb-4 aos-element delay-1">
              Tra đơn, tạo vận đơn, xác nhận thanh toán,  AI Assistant hỗ trợ ngay trong <span className="gradient-text">luồng chat</span>
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl leading-relaxed aos-element delay-2">
              Zaplo kết nối trực tiếp với POS, vận chuyển, thanh toán và  AI Assistant để đội vận hành không phải nhảy qua lại giữa nhiều phần mềm khác nhau.
            </p>
          </div>

          <div className="editorial-band aos-element delay-2 p-6 md:p-7">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { value: '13', label: 'nền tảng' },
                { value: '4', label: 'nhóm tích hợp' },
                { value: '4', label: 'AI platform' },
                { value: '24/7', label: 'webhook realtime' },
              ].map((item) => (
                <div key={item.label}>
                  <div className="text-3xl font-black">{item.value}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.16em] text-white/70">{item.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-3 mb-8 aos-element delay-2">
          {integrationTabOptions.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 border ${
                activeTab === tab.key
                  ? tab.activeColor + ' shadow-lg'
                  : 'bg-white/80 border-slate-200 text-slate-600 hover:border-orange-200 hover:text-slate-900 shadow-[0_10px_30px_rgba(148,163,184,0.08)]'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
              <span className="ml-1 text-[11px] opacity-60">({tab.platforms.length})</span>
            </button>
          ))}
        </div>

        <div className="mb-6 aos-element delay-2">

          <div className={`grid gap-4 ${
            currentTab.platforms.length <= 2
              ? 'grid-cols-1 md:grid-cols-2'
              : currentTab.platforms.length === 3
                ? 'grid-cols-1 md:grid-cols-3'
                : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
          }`}>
            {currentTab.platforms.map(p => (
              <PlatformCard key={p.name} platform={p} />
            ))}

            {currentTab.key === 'ai' && (
              <div className="planet-card rounded-[1.5rem] p-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-lg mb-3">🧠</div>
                <h4 className="text-slate-950 font-bold text-sm mb-2">Tính năng AI nổi bật</h4>
                <div className="space-y-2">
                  {[
                    { icon: '💬', label: 'Tự động trả lời chat thông minh' },
                    { icon: '🏷️', label: 'Phân loại tin nhắn theo ý định' },
                    { icon: '💡', label: 'Gợi ý câu trả lời trong khung soạn' },
                    { icon: '📄', label: 'Nạp file kiến thức (PDF, Excel, TXT)' },
                    { icon: '🛒', label: 'Kết nối dữ liệu POS vào prompt' },
                    { icon: '⚡', label: '4 nền tảng AI, 20+ model tùy chọn' },
                    { icon: '👥', label: 'Đa trợ lý, gán riêng mỗi tài khoản' },
                    { icon: '📊', label: 'Thống kê token & chi phí theo ngày' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentTab.key === 'pos' && (
              <div className="planet-card rounded-[1.5rem] p-5 md:col-span-2 lg:col-span-1">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 flex items-center justify-center text-lg mb-3">🛠️</div>
                <h4 className="text-slate-950 font-bold text-sm mb-2">Tính năng trong chat</h4>
                <div className="space-y-2">
                  {[
                    { icon: '🔍', label: 'Tra cứu nhanh ngay trong hội thoại' },
                    { icon: '✏️', label: 'Tạo đơn 3 bước — không cần mở app' },
                    { icon: '📌', label: 'Ghim tính năng hay dùng ra toolbar' },
                    { icon: '🖼️', label: 'Kết quả có ảnh sản phẩm, tồn kho' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentTab.key === 'shipping' && (
              <div className="planet-card rounded-[1.5rem] p-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center text-lg mb-3">⚡</div>
                <h4 className="text-slate-950 font-bold text-sm mb-2">Webhook tự động</h4>
                <div className="space-y-2">
                  {[
                    { icon: '📡', label: 'Nhận cập nhật trạng thái realtime' },
                    { icon: '🔔', label: 'Trigger workflow khi giao hàng xong' },
                    { icon: '💬', label: 'Tự động thông báo Zalo cho khách' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {currentTab.key === 'payment' && (
              <div className="planet-card rounded-[1.5rem] p-5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-lg mb-3">🔗</div>
                <h4 className="text-slate-950 font-bold text-sm mb-2">Kết nối Webhook</h4>
                <div className="space-y-2">
                  {[
                    { icon: '🖥️', label: 'HTTP server nhúng sẵn — port 9888' },
                    { icon: '🌐', label: 'Built-in localtunnel, không cần cài thêm' },
                    { icon: '⚡', label: 'Trigger workflow tức thì khi nhận tiền' },
                  ].map(item => (
                    <div key={item.label} className="flex items-center gap-2 text-xs text-slate-700">
                      <span className="text-sm">{item.icon}</span>
                      {item.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-16 aos-element delay-3">
          {[
            { value: '13',   label: 'Nền tảng hỗ trợ', icon: '🔌' },
            { value: '4',    label: 'Nhóm tích hợp',   icon: '📦' },
            { value: '4',    label: 'Nền tảng AI',      icon: '🤖' },
            { value: '24/7', label: 'Webhook tự động',  icon: '⚡' },
          ].map(stat => (
            <div key={stat.label} className="planet-card rounded-2xl p-4 text-center">
              <div className="text-xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-black text-slate-950">{stat.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="aos-element delay-3">
          <div className="text-center mb-8">
            <div className="orbit-badge mb-4">
              🧩 Integration Templates
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-slate-950 mb-2">
              Workflow tích hợp{' '}
              <span className="gradient-text">có sẵn</span>
            </h3>
            <p className="text-slate-600 text-sm max-w-xl mx-auto">
              Các kịch bản kết nối đã được dựng sẵn — chọn, tuỳ chỉnh và cài đặt chỉ 1 click.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-2 mb-8">
            <button
              onClick={() => setActiveTemplateCategory(null)}
              className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 border ${
                !activeTemplateCategory
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg shadow-indigo-500/10'
                  : 'bg-white/80 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-slate-900'
              }`}
            >
              ⭐ Nổi bật
              <span className="ml-1.5 text-[10px] opacity-60">({integrationTemplates.filter(t => t.featured).length})</span>
            </button>
            {integrationCategories.map(cat => {
              const count = integrationTemplates.filter(t => t.category === cat.key).length;
              return (
                <button
                  key={cat.key}
                  onClick={() => setActiveTemplateCategory(activeTemplateCategory === cat.key ? null : cat.key)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 border ${
                    activeTemplateCategory === cat.key
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-lg shadow-indigo-500/10'
                      : 'bg-white/80 border-slate-200 text-slate-600 hover:border-indigo-200 hover:text-slate-900'
                  }`}
                >
                  {cat.icon} {cat.label}
                  <span className="ml-1.5 text-[10px] opacity-60">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-14">
            {filteredTemplates.map(tpl => {
              const diff = difficultyLabel[tpl.difficulty];
              const cat = integrationCategories.find(c => c.key === tpl.category);
              return (
                <div
                  key={tpl.title}
                  className="planet-card rounded-[1.75rem] p-6 hover:-translate-y-1 transition-all duration-300 group"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-2xl bg-white/80 border border-slate-200 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-110 transition-transform shadow-[0_12px_32px_rgba(148,163,184,0.15)]">
                      {tpl.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-slate-950 font-semibold text-sm leading-tight mb-1.5">{tpl.title}</h4>
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

                  <p className="text-slate-600 text-xs leading-relaxed mb-4">{tpl.desc}</p>

                  <div className="flex flex-wrap items-center gap-1.5 mb-3">
                    {tpl.platforms.map((p, i) => (
                        <span key={p} className="flex items-center gap-1.5">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold">
                            {p}
                          </span>
                          {i < tpl.platforms.length - 1 && (
                              <span className="text-[10px] text-slate-500">-</span>
                          )}
                        </span>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {tpl.steps.map((step, si) => (
                      <span key={si} className="flex items-center gap-1.5">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-50 border border-slate-200 text-slate-600 font-medium">
                          {step}
                        </span>
                        {si < tpl.steps.length - 1 && (
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
        </div>

      </div>
    </section>
  );
}

