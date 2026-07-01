import React, { useState, useRef, useEffect, useCallback } from 'react';
import { toLocalMediaUrl } from '@/lib/localMedia';
import type { ImageAsset } from '@/../../src/models/automation';

// ── Context Menu ──────────────────────────────────────────────────────────────
interface ContextMenuProps {
  x: number;
  y: number;
  onDelete: () => void;
  onMove: () => void;
  onClose: () => void;
}

function ContextMenu({ x, y, onDelete, onMove, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', left: x, top: y, zIndex: 9999 }}
      className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[160px]"
    >
      <button
        onClick={() => { onDelete(); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-gray-800 flex items-center gap-2"
      >
        🗑 Xóa ảnh
      </button>
      <button
        onClick={() => { onMove(); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 flex items-center gap-2"
      >
        ↪ Di chuyển tới thư mục…
      </button>
    </div>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────
// Memo comparator: only re-render when asset identity or selection changes.
// onDeleteOne / onCheckbox / onContextMenu closures are intentionally ignored —
// they're stable per-asset via useCallback in ImageGrid.
const Tile = React.memo(function Tile({
  asset,
  selected,
  onBodyClick,
  onCheckbox,
  onDeleteOne,
  onContextMenu,
}: {
  asset: ImageAsset;
  selected: boolean;
  onBodyClick: () => void;
  onCheckbox: (e: React.MouseEvent) => void;
  onDeleteOne: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const [errored, setErrored] = useState(false);
  // Thumbnail (240px) for the grid; lightbox uses full-res separately.
  const src = toLocalMediaUrl(asset.rel_path, 240);

  return (
    <div
      onClick={onBodyClick}
      onContextMenu={onContextMenu}
      className={`relative aspect-square rounded-lg overflow-hidden border-2 bg-gray-800 cursor-pointer group ${
        selected ? 'border-blue-600' : 'border-transparent'
      }`}
    >
      {errored ? (
        <div className="w-full h-full flex items-center justify-center text-gray-600">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9l4-4 4 4 4-4 4 4"/>
          </svg>
        </div>
      ) : (
        <img
          src={src}
          alt={asset.rel_path}
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
        />
      )}

      {/* Origin badge (top-left, below checkbox) */}
      <span className={`absolute top-1 left-7 text-[9px] px-1.5 py-0.5 rounded font-semibold leading-none pointer-events-none ${
        asset.origin === 'ai' ? 'bg-purple-600/80 text-white' : 'bg-black/55 text-gray-200'
      }`}>
        {asset.origin === 'ai' ? 'AI' : 'Upload'}
      </span>

      {/* Checkbox — top-left, visible on hover or when selected */}
      <span
        onClick={onCheckbox}
        className={`absolute top-1 left-1 w-[18px] h-[18px] rounded flex items-center justify-center text-[11px] cursor-pointer z-10 transition-opacity ${
          selected
            ? 'bg-blue-600 text-white opacity-100'
            : 'bg-black/50 text-transparent opacity-0 group-hover:opacity-100'
        }`}
      >
        {selected ? '✓' : ''}
      </span>

      {/* Delete (✕) button — top-right, visible on hover */}
      <button
        onClick={onDeleteOne}
        className="absolute top-1 right-1 w-[18px] h-[18px] rounded flex items-center justify-center text-[10px] bg-black/60 text-gray-300 hover:bg-red-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-10 cursor-pointer"
        title="Xóa ảnh này"
      >
        ✕
      </button>

      {/* Dimensions badge */}
      {asset.width && asset.height && (
        <span className="absolute bottom-1 right-1 text-[9px] px-1 py-0.5 rounded bg-black/50 text-gray-300 leading-none pointer-events-none">
          {asset.width}×{asset.height}
        </span>
      )}
    </div>
  );
}, (prev, next) =>
  prev.asset.id === next.asset.id &&
  prev.selected === next.selected
);

// ── Grid props ────────────────────────────────────────────────────────────────
export interface ImageGridProps {
  assets: ImageAsset[];
  loading: boolean;
  folderLabel: string;
  uploading: boolean;
  generating: boolean;
  selectedIds: Set<number>;
  aiPrompt: string;
  onAiPromptChange: (v: string) => void;
  onUpload: () => void;
  onGenerateAI: () => void;
  onTileClick: (asset: ImageAsset) => void;
  onDeleteOne: (id: number) => void;
  onBulkMove: () => void;
  onBulkDelete: () => void;
  onClearSel: () => void;
  onMoveOne: (id: number) => void;
}

// ── ImageGrid ─────────────────────────────────────────────────────────────────
export default function ImageGrid({
  assets, loading, folderLabel, uploading, generating, selectedIds,
  aiPrompt, onAiPromptChange, onUpload, onGenerateAI,
  onTileClick, onDeleteOne, onBulkMove, onBulkDelete, onClearSel, onMoveOne,
}: ImageGridProps) {
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; assetId: number } | null>(null);

  const showBulk = selectedIds.size > 0;

  // Body click → lightbox (full res, no thumbnail)
  const handleBodyClick = useCallback((a: ImageAsset) => {
    setLightbox(toLocalMediaUrl(a.rel_path));
  }, []);

  // Checkbox click → toggle selection
  const handleCheckbox = useCallback((e: React.MouseEvent, a: ImageAsset) => {
    e.stopPropagation();
    onTileClick(a);
  }, [onTileClick]);

  // ✕ button → delete one
  const handleDeleteBtn = useCallback((e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    onDeleteOne(id);
  }, [onDeleteOne]);

  // Right-click → context menu
  const handleContextMenu = useCallback((e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, assetId: id });
  }, []);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-700 flex-wrap flex-shrink-0">
        <strong className="text-sm text-gray-100">{folderLabel}</strong>
        <span className="text-xs text-gray-500">· {assets.length} ảnh</span>
        <span className="flex-1" />
        <button
          onClick={onUpload} disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
        >
          {uploading
            ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Đang tải...</>
            : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>Tải ảnh lên</>}
        </button>
      </div>

      {/* AI generate row */}
      <div className="px-3.5 py-2 border-b border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <input
            type="text" value={aiPrompt}
            onChange={(e) => onAiPromptChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onGenerateAI(); }}
            placeholder={`Mô tả ảnh AI (vào "${folderLabel}")...`}
            disabled={generating}
            className="flex-1 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-purple-500 disabled:opacity-50"
          />
          <button
            onClick={onGenerateAI} disabled={!aiPrompt.trim() || generating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold disabled:opacity-50 whitespace-nowrap"
          >
            {generating
              ? <><svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Đang tạo...</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>✨ Sinh ảnh AI</>}
          </button>
        </div>
      </div>

      {/* Bulk bar — appears whenever selectedIds.size ≥ 1 */}
      {showBulk && (
        <div className="flex items-center gap-2 px-3.5 py-2 bg-[#0e1726] border-b border-gray-700 flex-shrink-0">
          <span className="text-xs text-gray-200">{selectedIds.size} đã chọn</span>
          <span className="flex-1" />
          <button onClick={onBulkMove} className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-xs font-semibold">↪ Di chuyển tới…</button>
          <button onClick={onBulkDelete} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold">🗑 Xóa hàng loạt</button>
          <button onClick={onClearSel} className="px-2.5 py-1 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-xs font-semibold">Bỏ chọn</button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 text-sm">Đang tải...</div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="text-gray-700"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            <p className="text-gray-400 text-sm">Thư mục trống</p>
            <p className="text-gray-600 text-xs">Tải ảnh lên hoặc sinh AI vào thư mục này</p>
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))' }}>
            {assets.map((a) => (
              <Tile
                key={a.id}
                asset={a}
                selected={a.id != null && selectedIds.has(a.id)}
                onBodyClick={() => handleBodyClick(a)}
                onCheckbox={(e) => handleCheckbox(e, a)}
                onDeleteOne={(e) => handleDeleteBtn(e, a.id!)}
                onContextMenu={(e) => handleContextMenu(e, a.id!)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lightbox — full resolution (no width param) */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-zoom-out p-6"
        >
          <img src={lightbox} alt="" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onDelete={() => onDeleteOne(ctxMenu.assetId)}
          onMove={() => onMoveOne(ctxMenu.assetId)}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
