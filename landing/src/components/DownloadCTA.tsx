import { useState } from 'react';
import { DOWNLOAD_URL, DOWNLOAD_URL_MAC_ARM64, DOWNLOAD_URL_MAC_X64, DOWNLOAD_URL_LINUX, APP_VERSION } from '../constants';

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: 'Zaplo là gì?',
    answer:
      'Zaplo là phần mềm quản lý đa tài khoản Zalo trên máy tính. Bạn có thể đăng nhập và sử dụng nhiều tài khoản Zalo cùng lúc trên một giao diện duy nhất — chat, quản lý bạn bè, nhóm, CRM, chiến dịch marketing, tự động hoá workflow, tích hợp các công công cụ bán hàng và  AI Assistant.',
  },
  {
    question: 'Dùng Zaplo có mất phí không?',
    answer:
      'Tất cả các tính năng trong phần mềm đều miễn phí. Chúng tôi sẽ không thu phí vì cơ sở dữ liệu và ảnh/video được lưu trữ trên máy tính của bạn. Bạn có thể thoải mái sử dụng mà không lo về chi phí hay giới hạn tính năng.',
  },
  {
    question: 'Dùng Zaplo có dùng song song với Zalo Desktop hay Zalo App được không?',
    answer:
        'Có. Chính sách Zalo hỗ trợ mỗi tài khoản đăng nhập đồng thời trên 1 điện thoại, 1 Desktop và 1 Web. Zaplo sử dụng nền tảng Web của Zalo, vì vậy bạn vẫn dùng bình thường trên Zalo PC và Zalo App. Lưu ý: sau khi đăng nhập vào Zaplo, bạn sẽ không thể đăng nhập thêm trên Zalo Web (chat.zalo.me) cho cùng tài khoản đó.',
  },
  {
    question: 'Có cho phép nhiều nhân viên hoặc nhiều máy cùng dùng chung 1 tài khoản Zalo không?',
    answer:
        'Có. Zaplo hỗ trợ mô hình làm việc theo team/workspace, cho phép nhiều nhân viên cùng tham gia vận hành với cơ chế phân quyền rõ ràng. Bạn có thể phân quyền theo nhân viên và theo từng module để mỗi người chỉ thấy và thao tác đúng phần được giao, trong khi quản lý vẫn kiểm soát tập trung toàn bộ hoạt động.',
  },
  {
    question: 'Cài đặt trên hệ điều hành nào?',
    answer:
      'Hiện tại Zaplo hỗ trợ Windows, macOS và Ubuntu Linux. Bộ cài gọn nhẹ khoảng 150MB, khi vận hành thực tế chỉ tiêu thụ khoảng 500MB RAM nên chạy nhanh và ổn định.',
  },
  {
    question: 'Dữ liệu của tôi có an toàn không?',
    answer:
      'Toàn bộ dữ liệu (tin nhắn, liên hệ, ảnh, file…) được lưu trữ trực tiếp trên máy tính của bạn, không qua bất kỳ máy chủ trung gian nào. Zaplo không thu thập hay chia sẻ dữ liệu cá nhân cho bên thứ ba.',
  },
  {
    question: 'Tài khoản Zalo có bị khoá khi dùng Zaplo không?',
    answer:
      'Zaplo hoạt động dựa trên giao thức chính thức của Zalo. Tuy nhiên, bạn nên tránh hành vi spam (gửi tin nhắn hàng loạt quá nhiều trong thời gian ngắn). Phần mềm có cơ chế delay thông minh giúp hạn chế rủi ro bị hạn chế tài khoản.',
  }
];

const FaqAccordionItem: React.FC<{
  item: FaqItem;
  isOpen: boolean;
  onToggle: () => void;
  index: number;
}> = ({ item, isOpen, onToggle, index }) => {
  return (
    <div
      className={`planet-card rounded-[1.5rem] overflow-hidden transition-all duration-300 delay-${Math.min(index + 1, 6)} ${
        isOpen ? 'ring-1 ring-indigo-200' : 'hover:border-indigo-200'
      }`}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left cursor-pointer focus:outline-none group"
      >
        <span className="text-base font-semibold text-slate-950 group-hover:text-indigo-600 transition-colors">
          {item.question}
        </span>
        <span
          className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-300 ${
            isOpen
              ? 'bg-indigo-50 text-indigo-600 rotate-180'
              : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          isOpen ? 'max-h-60 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-200 pt-4">
          {item.answer}
        </div>
      </div>
    </div>
  );
};

const DownloadCTA: React.FC = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  };

  return (
    <section id="faq" className="orbit-shell py-28 px-6 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 70% 80% at 50% 50%, rgba(99,102,241,0.12) 0%, transparent 70%)',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-indigo-200/70 animate-[spin_30s_linear_infinite]" />
      </div>

      <div className="max-w-3xl mx-auto relative z-10">
        <div className="text-center mb-14">
          <div className="orbit-badge mb-4 aos-element">
            ❓ FAQ
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-950 mb-4 aos-element delay-1">
            Câu hỏi{' '}
            <span className="gradient-text">thường gặp</span>
          </h2>
          <p className="text-slate-600 text-lg max-w-xl mx-auto aos-element delay-2">
            Giải đáp nhanh những thắc mắc phổ biến nhất khi sử dụng Zaplo.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {faqs.map((faq, idx) => (
            <FaqAccordionItem
              key={idx}
              item={faq}
              isOpen={openIndex === idx}
              onToggle={() => toggle(idx)}
              index={idx}
            />
          ))}
        </div>

        <div className="mt-12 text-center aos-element delay-4">
          <p className="text-slate-500 text-sm mb-3">Chưa tìm thấy câu trả lời?</p>
          <a
            href="https://zalo.me/g/deplao"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary inline-flex items-center gap-2 text-sm px-6 py-3 no-underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            Liên hệ hỗ trợ
          </a>
        </div>

        <div className="mt-16 text-center aos-element delay-5">
          <div className="stellar-panel rounded-[2rem] p-8 md:p-10 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-transparent to-blue-600/10 pointer-events-none" />
            <div className="relative z-10">
              <h3 className="text-2xl md:text-3xl font-bold text-slate-950 mb-3">
                Sẵn sàng trải nghiệm <span className="gradient-text">Zaplo</span>?
              </h3>
              <p className="text-slate-600 text-sm mb-8">
                Tải miễn phí · Cài đặt dễ dàng
              </p>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 flex-wrap">
                <a
                  href={DOWNLOAD_URL}
                  download
                  className="btn-primary inline-flex items-center gap-2.5 no-underline text-sm px-6 py-3.5"
                >
                  <span className="text-base">🪟</span>
                  <span>
                    <span className="block font-semibold">Windows 10/11</span>
                    <span className="text-xs opacity-70">.exe · 64-bit</span>
                  </span>
                </a>

                <a
                  href={DOWNLOAD_URL_MAC_ARM64}
                  download
                  className="btn-secondary inline-flex items-center gap-2.5 no-underline text-sm px-6 py-3.5"
                >
                  <span className="text-base">🍎</span>
                  <span>
                    <span className="block font-semibold">macOS Apple</span>
                    <span className="text-xs opacity-70">chip M series</span>
                  </span>
                </a>

                <a
                  href={DOWNLOAD_URL_MAC_X64}
                  download
                  className="btn-secondary inline-flex items-center gap-2.5 no-underline text-sm px-6 py-3.5"
                >
                  <span className="text-base">💻</span>
                  <span>
                    <span className="block font-semibold">macOS Intel</span>
                    <span className="text-xs opacity-70">chip Intel series</span>
                  </span>
                </a>

                <a
                  href={DOWNLOAD_URL_LINUX}
                  download
                  className="btn-secondary inline-flex items-center gap-2.5 no-underline text-sm px-6 py-3.5"
                >
                  <span className="text-base">🐧</span>
                  <span>
                    <span className="block font-semibold">Ubuntu Linux</span>
                    <span className="text-xs opacity-70">.AppImage · mọi distro</span>
                  </span>
                </a>
              </div>

              <p className="text-slate-500 text-xs mt-5">
                v{APP_VERSION} · ~150 MB
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default DownloadCTA;

