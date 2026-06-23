const steps = [
  {
    number: '01',
    icon: '⬇️',
    color: 'from-violet-600 to-purple-700',
    title: 'Tải & Cài Đặt',
    desc: 'Tải file cài đặt Zaplo. Chạy installer và cài đặt trong vài giây. Không cần kỹ thuật phức tạp.',
    detail: 'Windows · macOS · Linux · AppImage',
  },
  {
    number: '02',
    icon: '📱',
    color: 'from-blue-600 to-cyan-600',
    title: 'Kết Nối Zalo',
    desc: 'Đăng nhập tài khoản Zalo bằng QR code quét từ điện thoại, hoặc nhập cookie. Thêm bao nhiêu tài khoản tùy ý.',
    detail: 'QR Login · Multi-account',
  },
  {
    number: '03',
    icon: '🚀',
    color: 'from-emerald-500 to-teal-600',
    title: 'Bắt Đầu Ngay',
    desc: 'Chat, quản lý bạn bè, nhóm, CRM, Workllow,  AI Assistant... không giới hạn tính năng.',
    detail: 'Không giới hạn · Full features',
  },
];

const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="orbit-shell py-28 px-6 relative"
      style={{ background: 'linear-gradient(180deg, transparent, rgba(255,255,255,0.3) 40%, transparent)' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <div className="orbit-badge mb-4 aos-element">
            🎯 Bắt Đầu Dễ Dàng
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-slate-950 mb-4 aos-element delay-1">
            Chỉ <span className="gradient-text">3 bước</span> để bắt đầu
          </h2>
          <p className="text-slate-600 text-lg aos-element delay-2">
            Từ tải xuống đến dùng được trong chưa đầy 5 phút.
          </p>
        </div>

        <div className="relative">
          <div className="hidden md:block absolute top-16 left-[16.67%] right-[16.67%] h-px"
            style={{ background: 'linear-gradient(90deg, rgba(99,102,241,0.26), rgba(14,165,233,0.26), rgba(16,185,129,0.26))' }} />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            {steps.map((step, idx) => (
              <div key={step.title} className={`text-center aos-element delay-${idx + 2}`}>
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${step.color} flex items-center justify-center text-2xl font-black text-white shadow-lg relative z-10`}>
                    {step.number}
                  </div>
                  <div className={`absolute inset-0 rounded-full bg-gradient-to-br ${step.color} opacity-30 blur-md scale-125`} />
                </div>

                <div className="planet-card rounded-[1.75rem] p-6 transition-all duration-300 glass-hover">
                  <div className="text-3xl mb-3">{step.icon}</div>
                  <h3 className="text-xl font-bold mb-3 text-slate-950">{step.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4">{step.desc}</p>
                  <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2 font-mono border border-slate-200">
                    {step.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 text-center aos-element">
          <p className="text-slate-500 text-sm">
            Gặp vấn đề? Liên hệ hỗ trợ qua Facebook hoặc Telegram — đội ngũ sẽ phản hồi bạn sớm nhất.
          </p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;

