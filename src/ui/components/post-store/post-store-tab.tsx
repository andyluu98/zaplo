/**
 * post-store-tab.tsx
 * Tab "Kho bài" — quản lý bài đăng: list, bulk delete, thêm/sửa thủ công, AI tạo hàng loạt.
 */

import React, { useCallback, useEffect, useState } from 'react';
import ipc from '@/lib/ipc';
import { useAppStore } from '@/store/appStore';
import AiGenerateModal from './ai-generate-modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Post {
  id: number;
  title: string;
  content: string;
  image_count: number;
  image_folder_id?: number | null;
  image_random?: boolean;
  source?: string;
  created_at?: number;
}

interface Assistant { id: string; name: string; }
interface ImageFolder { id?: number; name: string; image_count?: number; }

// ─── Edit Modal ───────────────────────────────────────────────────────────────

interface EditModalProps {
  post: Partial<Post> | null;
  zaloId?: string;
  onClose: () => void;
  onSaved: () => void;
}

function EditModal({ post, zaloId, onClose, onSaved }: EditModalProps) {
  const showNotification = useAppStore(s => s.showNotification);
  const [title, setTitle] = useState(post?.title ?? '');
  const [content, setContent] = useState(post?.content ?? '');
  const [imageCount, setImageCount] = useState<number>(post?.image_count ?? 1);
  const [folderId, setFolderId] = useState<number | ''>(post?.image_folder_id ?? '');
  const [imgMode, setImgMode] = useState<'fixed' | 'random'>(post?.image_random ? 'random' : 'fixed');
  const [folders, setFolders] = useState<ImageFolder[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!zaloId) return;
    ipc.posting?.folderList({ zaloId }).then(res => {
      if (res?.success) setFolders(res.folders ?? []);
    }).catch(() => {});
  }, [zaloId]);

  async function handleSave() {
    if (!content.trim()) {
      showNotification('Vui lòng nhập nội dung bài', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload: {
        id?: number; title: string; content: string; image_count: number;
        image_folder_id: number | null; image_random: boolean;
      } = {
        title: title.trim() || content.trim().slice(0, 57) + (content.trim().length > 57 ? '…' : ''),
        content: content.trim(),
        image_count: Math.max(0, imageCount),
        image_folder_id: folderId === '' ? null : Number(folderId),
        image_random: imgMode === 'random',
      };
      if (post?.id) payload.id = post.id;
      const res = await ipc.postStore.save({ post: payload });
      if (!res?.success) throw new Error(res?.error || 'Lưu thất bại');
      showNotification(post?.id ? 'Đã cập nhật bài' : 'Đã thêm bài mới', 'success');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi: ${msg}`, 'error');
    } finally {
      setSaving(false);
    }
  }

  const sel = 'w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-lg shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white font-semibold text-lg mb-4">
          {post?.id ? 'Sửa bài' : '+ Bài mới'}
        </h2>

        <label className="block text-gray-400 text-xs mb-1">Tiêu đề</label>
        <input
          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3"
          placeholder="Tiêu đề (tự động từ nội dung nếu để trống)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          disabled={saving}
        />

        <label className="block text-gray-400 text-xs mb-1">Nội dung</label>
        <textarea
          className="w-full bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2 mb-3 resize-none"
          rows={6}
          placeholder="Nội dung bài đăng..."
          value={content}
          onChange={e => setContent(e.target.value)}
          disabled={saving}
        />

        {/* Nguồn ảnh */}
        <label className="block text-gray-400 text-xs mb-1">Nguồn ảnh</label>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <select
            className={sel + ' flex-1 min-w-[140px]'}
            value={folderId}
            onChange={e => setFolderId(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={saving}
          >
            <option value="">— Tất cả —</option>
            {folders.filter(f => f.id != null).map(f => (
              <option key={f.id} value={f.id}>
                {f.name}{f.image_count != null ? ` (${f.image_count})` : ''}
              </option>
            ))}
          </select>
          <select
            className={sel + ' w-32'}
            value={imgMode}
            onChange={e => setImgMode(e.target.value as 'fixed' | 'random')}
            disabled={saving}
          >
            <option value="fixed">Cố định</option>
            <option value="random">Ngẫu nhiên</option>
          </select>
          <input
            type="number"
            min={0}
            className="w-16 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2"
            value={imageCount}
            onChange={e => setImageCount(Math.max(0, parseInt(e.target.value) || 0))}
            disabled={saving}
          />
          <span className="text-gray-400 text-xs">ảnh</span>
        </div>
        {!zaloId && (
          <p className="text-gray-500 text-xs mb-3">Chọn tài khoản để xem danh sách thư mục ảnh.</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-600 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !content.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Post Card ─────────────────────────────────────────────────────────────────

interface PostCardProps {
  post: Post;
  selected: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function PostCard({ post, selected, onToggle, onEdit, onDelete }: PostCardProps) {
  return (
    <div className={`bg-gray-800/60 border rounded-xl p-4 flex flex-col gap-2 transition-colors ${selected ? 'border-blue-500' : 'border-gray-700'}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="mt-1 accent-blue-500 cursor-pointer shrink-0"
        />
        <p className="text-white font-semibold text-sm leading-snug line-clamp-1 flex-1">
          {post.title || '(Không có tiêu đề)'}
        </p>
      </div>
      <p className="text-gray-400 text-xs leading-relaxed line-clamp-2 pl-6">
        {post.content}
      </p>
      <div className="flex items-center justify-between pl-6 mt-1">
        <span className="text-gray-500 text-xs">
          🖼️ {post.image_count} ảnh
          {post.image_folder_id ? (post.image_random ? ' · ngẫu nhiên từ thư mục' : ' · cố định từ thư mục') : ' (ngẫu nhiên)'}
        </span>
        <div className="flex gap-2">
          <button
            onClick={onEdit}
            className="text-gray-400 hover:text-white text-xs px-2 py-1 bg-gray-700 rounded-lg transition-colors"
          >
            Sửa
          </button>
          <button
            onClick={onDelete}
            className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-gray-700 rounded-lg transition-colors"
          >
            Xóa
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export default function PostStoreTab({ zaloId }: { zaloId?: string }) {
  const showNotification = useAppStore(s => s.showNotification);

  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [assistants, setAssistants] = useState<Assistant[]>([]);

  // Modal state
  const [editPost, setEditPost] = useState<Partial<Post> | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadPosts = useCallback(async () => {
    try {
      const res = await ipc.postStore.list();
      if (res?.success) {
        setPosts(res.posts ?? []);
        setTotal(res.total ?? res.posts?.length ?? 0);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi tải kho bài: ${msg}`, 'error');
    }
  }, [showNotification]);

  useEffect(() => {
    loadPosts();
    ipc.ai.listAssistants().then(res => {
      if (res?.success) setAssistants(res.assistants ?? []);
    }).catch(() => {});
  }, [loadPosts]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = query.trim()
    ? posts.filter(p =>
        p.title?.toLowerCase().includes(query.toLowerCase()) ||
        p.content?.toLowerCase().includes(query.toLowerCase())
      )
    : posts;

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(p => selectedIds.has(p.id));

  // ── Selection ─────────────────────────────────────────────────────────────

  function toggleOne(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.delete(p.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filtered.forEach(p => next.add(p.id));
        return next;
      });
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDeleteOne(id: number) {
    if (!window.confirm('Xóa bài này?')) return;
    try {
      const res = await ipc.postStore.delete({ id });
      if (!res?.success) throw new Error(res?.error || 'Xóa thất bại');
      showNotification('Đã xóa bài', 'success');
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      await loadPosts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi: ${msg}`, 'error');
    }
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`Xóa ${ids.length} bài đã chọn?`)) return;
    try {
      const res = await ipc.postStore.deleteMany({ ids });
      if (!res?.success) throw new Error(res?.error || 'Xóa thất bại');
      showNotification(`Đã xóa ${ids.length} bài`, 'success');
      setSelectedIds(new Set());
      await loadPosts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi: ${msg}`, 'error');
    }
  }

  async function handleDeleteAll() {
    if (!window.confirm(`Xóa toàn bộ ${total} bài? Hành động này không thể hoàn tác.`)) return;
    try {
      const res = await ipc.postStore.deleteAll();
      if (!res?.success) throw new Error(res?.error || 'Xóa thất bại');
      showNotification('Đã xóa toàn bộ kho bài', 'success');
      setSelectedIds(new Set());
      await loadPosts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      showNotification(`Lỗi: ${msg}`, 'error');
    }
  }

  // ── Open modals ───────────────────────────────────────────────────────────

  function openNew() {
    setEditPost({});
    setShowEditModal(true);
  }

  function openEdit(post: Post) {
    setEditPost(post);
    setShowEditModal(true);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowAiModal(true)}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
        >
          ✨ AI tạo nhiều bài
        </button>

        <button
          onClick={openNew}
          className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors whitespace-nowrap"
        >
          + Bài mới
        </button>

        {/* Tìm kiếm */}
        <input
          className="flex-1 min-w-[160px] bg-gray-900 border border-gray-600 rounded-lg text-white text-sm px-3 py-2"
          placeholder="Tìm theo tiêu đề / nội dung..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />

        {/* Chọn tất cả */}
        <label className="flex items-center gap-1.5 text-gray-300 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={allFilteredSelected}
            onChange={toggleAll}
            className="accent-blue-500"
          />
          Chọn tất cả
        </label>

        {/* Xóa đã chọn */}
        {selectedIds.size > 0 && (
          <button
            onClick={handleDeleteSelected}
            className="px-3 py-2 bg-gray-700 text-red-400 hover:text-red-300 text-sm rounded-lg transition-colors whitespace-nowrap"
          >
            🗑 Xóa đã chọn ({selectedIds.size})
          </button>
        )}

        {/* Xóa tất cả */}
        <button
          onClick={handleDeleteAll}
          className="px-3 py-2 bg-gray-700 text-red-400 hover:text-red-300 text-sm rounded-lg transition-colors whitespace-nowrap"
        >
          🗑 Xóa tất cả
        </button>

        <span className="text-gray-500 text-sm whitespace-nowrap ml-auto">Tổng: {total} bài</span>
      </div>

      {/* Grid bài */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
            {query ? 'Không tìm thấy bài nào' : 'Kho bài trống — hãy thêm bài hoặc dùng AI tạo'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map(post => (
              <PostCard
                key={post.id}
                post={post}
                selected={selectedIds.has(post.id)}
                onToggle={() => toggleOne(post.id)}
                onEdit={() => openEdit(post)}
                onDelete={() => handleDeleteOne(post.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showEditModal && (
        <EditModal
          post={editPost}
          zaloId={zaloId}
          onClose={() => setShowEditModal(false)}
          onSaved={loadPosts}
        />
      )}

      {showAiModal && (
        <AiGenerateModal
          assistants={assistants}
          onDone={loadPosts}
          onClose={() => setShowAiModal(false)}
        />
      )}
    </div>
  );
}
