import React, { useEffect, useState } from 'react';
import type { ImageFolder } from '@/../../src/models/automation';

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4">
      {children}
    </div>
  );
}

function ModalShell({ title, onClose, children, footer, width = 'w-[420px]' }: {
  title: string; onClose: () => void; children: React.ReactNode; footer: React.ReactNode; width?: string;
}) {
  return (
    <div className={`${width} max-w-[94vw] max-h-[88vh] flex flex-col overflow-hidden rounded-2xl bg-gray-900 border border-gray-700`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <b className="text-sm text-gray-100">{title}</b>
        <button onClick={onClose} className="px-2 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400 hover:text-white text-xs">✕</button>
      </div>
      <div className="px-4 py-4 overflow-y-auto">{children}</div>
      <div className="px-4 py-3 border-t border-gray-700 flex justify-end gap-2">{footer}</div>
    </div>
  );
}

const btnGray = 'px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-xs font-semibold';
const btnBlue = 'px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold';
const btnRed  = 'px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold';
const inputCls = 'w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500';

// ── Add folder ──────────────────────────────────────────────────────────────

export interface AddFolderModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string, description: string) => void;
}

export function AddFolderModal({ open, onClose, onSubmit }: AddFolderModalProps) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  useEffect(() => { if (open) { setName(''); setDesc(''); } }, [open]);
  if (!open) return null;
  return (
    <Overlay>
      <ModalShell
        title="Thêm thư mục" onClose={onClose}
        footer={<>
          <button className={btnGray} onClick={onClose}>Hủy</button>
          <button className={btnBlue} onClick={() => name.trim() && onSubmit(name.trim(), desc.trim())}>Tạo thư mục</button>
        </>}
      >
        <input className={inputCls} placeholder="Tên thư mục (vd: Căn hộ Q7, Menu quán…)" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <input className={`${inputCls} mt-2`} placeholder="Mô tả (tùy chọn)" value={desc} onChange={(e) => setDesc(e.target.value)} />
      </ModalShell>
    </Overlay>
  );
}

// ── Delete folder (move | purge) ─────────────────────────────────────────────

export interface DeleteFolderModalProps {
  open: boolean;
  folder: ImageFolder | null;
  onClose: () => void;
  onSubmit: (mode: 'move' | 'purge') => void;
}

function DeleteModeRadio({ value, title, hint, checked, onSelect }: {
  value: 'move' | 'purge'; title: string; hint: string; checked: boolean; onSelect: (v: 'move' | 'purge') => void;
}) {
  return (
    <label
      onClick={() => onSelect(value)}
      className={`flex gap-2 items-start p-2.5 rounded-lg border mb-2 cursor-pointer ${
        checked ? 'border-blue-600 bg-[#0e1726]' : 'border-gray-700'
      }`}
    >
      <input type="radio" name="delmode" checked={checked} readOnly className="mt-0.5" />
      <div>
        <b className="text-sm text-gray-100">{title}</b>
        <div className="text-xs text-gray-500">{hint}</div>
      </div>
    </label>
  );
}

export function DeleteFolderModal({ open, folder, onClose, onSubmit }: DeleteFolderModalProps) {
  const [mode, setMode] = useState<'move' | 'purge'>('move');
  useEffect(() => { if (open) setMode('move'); }, [open]);
  if (!open || !folder) return null;

  return (
    <Overlay>
      <ModalShell
        title={`Xóa thư mục "${folder.name}"?`} onClose={onClose} width="w-[440px]"
        footer={<>
          <button className={btnGray} onClick={onClose}>Hủy</button>
          <button className={btnRed} onClick={() => onSubmit(mode)}>Xóa</button>
        </>}
      >
        <div className="text-xs text-gray-400 mb-2.5">
          Thư mục có <b>{folder.image_count ?? 0}</b> ảnh — xử lý ảnh bên trong:
        </div>
        <DeleteModeRadio value="move" title='Chuyển ảnh sang "Chưa phân loại"' hint="Giữ ảnh, chỉ xóa thư mục." checked={mode === 'move'} onSelect={setMode} />
        <DeleteModeRadio value="purge" title="Xóa luôn cả ảnh" hint="Xóa vĩnh viễn. Không hoàn tác." checked={mode === 'purge'} onSelect={setMode} />
      </ModalShell>
    </Overlay>
  );
}

// ── Move images ──────────────────────────────────────────────────────────────

export interface MoveImagesModalProps {
  open: boolean;
  count: number;
  folders: ImageFolder[];
  onClose: () => void;
  onSubmit: (folderId: number | null) => void;
}

export function MoveImagesModal({ open, count, folders, onClose, onSubmit }: MoveImagesModalProps) {
  const [target, setTarget] = useState<string>('unc'); // 'unc' = Chưa phân loại
  useEffect(() => { if (open) setTarget('unc'); }, [open]);
  if (!open) return null;
  return (
    <Overlay>
      <ModalShell
        title={`Di chuyển ${count} ảnh tới…`} onClose={onClose}
        footer={<>
          <button className={btnGray} onClick={onClose}>Hủy</button>
          <button className={btnBlue} onClick={() => onSubmit(target === 'unc' ? null : Number(target))}>Di chuyển</button>
        </>}
      >
        <select className={inputCls} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="unc">📥 Chưa phân loại</option>
          {folders.map((f) => (
            <option key={f.id} value={String(f.id)}>📁 {f.name}</option>
          ))}
        </select>
      </ModalShell>
    </Overlay>
  );
}
