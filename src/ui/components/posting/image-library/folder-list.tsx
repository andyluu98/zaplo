import React from 'react';
import type { ImageFolder } from '@/../../src/models/automation';

type FolderKey = number | null | 'all';

export interface FolderListProps {
  folders: ImageFolder[];
  currentFolderId: FolderKey;
  allCount: number;          // tổng ảnh (mọi folder + chưa phân loại)
  uncategorizedCount: number; // ảnh folder_id NULL
  onSelect: (id: FolderKey) => void;
  onAdd: () => void;
  onRename: (folder: ImageFolder) => void;
  onDelete: (folder: ImageFolder) => void;
}

function Row({
  active, icon, name, count, onClick, onRename, onDelete,
}: {
  active: boolean; icon: string; name: string; count: number;
  onClick: () => void; onRename?: () => void; onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer text-xs transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
      }`}
    >
      <span className="text-sm leading-none">{icon}</span>
      <span className="truncate flex-1">{name}</span>
      {onRename && (
        <button
          onClick={(e) => { e.stopPropagation(); onRename(); }}
          className="opacity-0 group-hover:opacity-90 hover:text-white"
          title="Đổi tên"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/></svg>
        </button>
      )}
      {onDelete && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="opacity-0 group-hover:opacity-90 hover:text-red-400"
          title="Xóa thư mục"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      )}
      <span className="ml-auto text-[11px] opacity-85">{count}</span>
    </div>
  );
}

export default function FolderList({
  folders, currentFolderId, allCount, uncategorizedCount,
  onSelect, onAdd, onRename, onDelete,
}: FolderListProps) {
  return (
    <div className="w-[230px] flex-shrink-0 border-r border-gray-700 p-2.5 flex flex-col gap-1 overflow-y-auto">
      <Row
        active={currentFolderId === 'all'} icon="🗂️" name="Tất cả" count={allCount}
        onClick={() => onSelect('all')}
      />
      <Row
        active={currentFolderId === null} icon="📥" name="Chưa phân loại" count={uncategorizedCount}
        onClick={() => onSelect(null)}
      />
      <div className="text-[10px] text-gray-600 uppercase tracking-wide px-2 pt-2 pb-0.5">Thư mục</div>
      {folders.map((f) => (
        <Row
          key={f.id}
          active={currentFolderId === f.id}
          icon="📁"
          name={f.name}
          count={f.image_count ?? 0}
          onClick={() => onSelect(f.id ?? 'all')}
          onRename={() => onRename(f)}
          onDelete={() => onDelete(f)}
        />
      ))}
      <button
        onClick={onAdd}
        className="mt-1.5 flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-xs font-semibold"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Thêm thư mục
      </button>
    </div>
  );
}
