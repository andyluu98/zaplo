import React, { useEffect, useState } from 'react';
import ipc from '@/lib/ipc';

// Tab "Giới hạn an toàn": chỉnh số comment/bài mỗi ngày + giãn cách. Tránh FB khóa nick.

export default function FbWriteLimits() {
  const [comment, setComment] = useState(1000);
  const [post, setPost] = useState(1000);
  const [delayMin, setDelayMin] = useState(4);
  const [delayMax, setDelayMax] = useState(9);
  const [saved, setSaved] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await ipc.facebookWrite?.getLimits();
        const c = res?.config;
        if (c?.perDay) { setComment(c.perDay.comment ?? 10); setPost(c.perDay.post_personal ?? 3); }
        if (Array.isArray(c?.delayMs)) { setDelayMin(Math.round(c.delayMs[0] / 1000)); setDelayMax(Math.round(c.delayMs[1] / 1000)); }
      } catch {}
    })();
  }, []);

  const save = async () => {
    setSaved('');
    try {
      await ipc.facebookWrite?.setLimits({
        config: {
          perDay: { comment, post_personal: post, post_group: post, reply_dm: 200 },
          delayMs: [delayMin * 1000, delayMax * 1000],
        },
      });
      setSaved('Đã lưu cài đặt ✅');
    } catch (e: any) { setSaved('Lỗi: ' + (e?.message || e)); }
  };

  return (
    <div className="h-full overflow-y-auto p-5">
      <div className="max-w-lg bg-gray-800/60 border border-gray-700 rounded-xl p-5">
        <div className="text-[12.5px] text-amber-300 bg-amber-500/8 border border-amber-500/25 rounded-lg px-3 py-2 mb-4">
          Giới hạn để tránh FB khóa nick. Khuyến nghị dùng nick phụ. Mức mặc định: Cân bằng.
        </div>
        <Slider label={`Comment tối đa / ngày: ${comment}`} min={1} max={1000} value={comment} onChange={setComment} />
        <Slider label={`Bài đăng tối đa / ngày: ${post}`} min={1} max={1000} value={post} onChange={setPost} />
        <Slider label={`Giãn cách tối thiểu (giây): ${delayMin}`} min={2} max={15} value={delayMin} onChange={setDelayMin} />
        <Slider label={`Giãn cách tối đa (giây): ${delayMax}`} min={delayMin} max={30} value={delayMax} onChange={setDelayMax} />
        <button onClick={save} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">Lưu cài đặt</button>
        {saved && <span className="ml-3 text-sm text-gray-300">{saved}</span>}
      </div>
    </div>
  );
}

function Slider({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (v: number) => void }) {
  return (
    <div className="mb-4">
      <label className="block text-xs text-gray-400 mb-2">{label}</label>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
        className="w-full accent-blue-500" />
    </div>
  );
}
