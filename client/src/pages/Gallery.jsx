import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fmtSize } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faMagnifyingGlass, faXmark, faImage, faVideo, faMusic, faFileLines, faCode, faFile, faLink, faDownload, faArrowUpRightFromSquare, faTrash, faEllipsisVertical, faCheckSquare, faTag, faFolderPlus, faMinus, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import { Checkbox } from '@/components/ui/checkbox';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/UserAvatar';
import { useWebSocket } from '@/hooks/useWebSocket';

function buildPageItems(page, pages) {
  if (pages <= 7) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }
  const items = [];
  items.push(1);
  if (page - 1 > 2) items.push('...');
  for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) {
    items.push(i);
  }
  if (page + 1 < pages - 1) items.push('...');
  items.push(pages);
  return items;
}

const TYPE_ICONS = {
  image: faImage,
  video: faVideo,
  audio: faMusic,
  pdf: faFileLines,
  code: faCode,
  text: faFileLines,
  file: faFile,
};

const TYPE_GRADIENTS = {
  video:  'from-violet-900/80 to-violet-700/60',
  pdf:    'from-red-900/80 to-red-700/60',
  audio:  'from-emerald-900/80 to-emerald-700/60',
  code:   'from-sky-900/80 to-sky-700/60',
  text:   'from-slate-800/80 to-slate-600/60',
  file:   'from-zinc-800/80 to-zinc-600/60',
};

function FilePlaceholder({ file, icon }) {
  const gradient = TYPE_GRADIENTS[file.displayType] || TYPE_GRADIENTS.file;
  const ext = file.originalName.includes('.')
    ? file.originalName.split('.').pop().toUpperCase().slice(0, 4)
    : null;

  return (
    <div className={`w-full h-full bg-gradient-to-br ${gradient} flex flex-col items-center justify-center gap-2 group-hover:brightness-110 transition-all`}>
      <FontAwesomeIcon icon={icon} className="h-10 w-10 text-white/70" />
      {ext && (
        <span className="text-[10px] font-bold tracking-widest text-white/50 uppercase">{ext}</span>
      )}
    </div>
  );
}

function FileThumbnail({ file, icon }) {
  const [thumbError, setThumbError] = useState(false);

  if (file.displayType === 'image') {
    return (
      <img
        src={`/f/${file.shortId}/raw`}
        alt={file.originalName}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        loading="lazy"
      />
    );
  }

  if ((file.displayType === 'video' || file.displayType === 'pdf') && file.hasThumbnail && !thumbError) {
    return (
      <div className="relative w-full h-full">
        <img
          src={`/f/${file.shortId}/thumb`}
          alt={file.originalName}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          loading="lazy"
          onError={() => setThumbError(true)}
        />
        {file.displayType === 'video' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <FontAwesomeIcon icon={icon} className="h-8 w-8 text-white drop-shadow" />
          </div>
        )}
      </div>
    );
  }

  return <FilePlaceholder file={file} icon={icon} />;
}

function FileCard({ file, user, onDelete, selectMode, selected, onToggleSelect }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const icon = TYPE_ICONS[file.displayType] || faFile;
  const canDelete = user && (user.role === 'admin' || user.id === file.uploader?._id);

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/f/${file.shortId}`);
    toast({ title: t('fileView.urlCopied') });
  }

  async function handleDelete() {
    const r = await fetch(`/api/file/${file.shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('fileView.fileDeleted') });
      onDelete?.();
    } else {
      toast({ title: t('fileView.deleteFailed'), variant: 'destructive' });
    }
  }

  if (selectMode) {
    return (
      <div
        onClick={() => onToggleSelect(file.shortId)}
        className={`group rounded-lg border bg-card overflow-hidden flex flex-col cursor-pointer transition-colors ${selected ? 'border-primary ring-2 ring-primary/40' : 'hover:border-primary/60'}`}
      >
        <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden relative">
          <FileThumbnail file={file} icon={TYPE_ICONS[file.displayType] || faFile} />
          <div className="absolute top-2 left-2" onClick={(e) => e.stopPropagation()}>
            <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(file.shortId)} />
          </div>
        </div>
        <div className="p-3 space-y-1">
          <p className="text-sm font-medium truncate" title={file.originalName}>{file.originalName}</p>
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs px-1.5 py-0">{file.displayType}</Badge>
            <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
          </div>
          {file.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {file.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs px-1 py-0">{tag}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <Link
            to={`/f/${file.shortId}`}
            className="group rounded-lg border bg-card overflow-hidden flex flex-col hover:border-primary/60 transition-colors"
          >
            <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
              <FileThumbnail file={file} icon={icon} />
            </div>
            <div className="p-3 space-y-1">
              <p className="text-sm font-medium truncate" title={file.originalName}>
                {file.originalName}
              </p>
              <div className="flex items-center justify-between">
                <Badge variant="secondary" className="text-xs px-1.5 py-0">
                  {file.displayType}
                </Badge>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
                  {/* Touch-friendly actions menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.preventDefault()}>
                      <button className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent">
                        <FontAwesomeIcon icon={faEllipsisVertical} className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onSelect={() => navigate(`/f/${file.shortId}`)}>
                        <FontAwesomeIcon icon={faFile} className="h-4 w-4" />
                        {t('gallery.contextOpen')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={copyLink}>
                        <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
                        {t('gallery.contextCopyLink')}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => window.open(`/f/${file.shortId}/raw`, '_blank')}>
                        <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
                        {t('gallery.contextOpenRaw')}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/f/${file.shortId}/download`} download>
                          <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
                          {t('gallery.contextDownload')}
                        </a>
                      </DropdownMenuItem>
                      {canDelete && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() => setConfirmDelete(true)}
                            className="text-destructive focus:text-destructive"
                          >
                            <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                            {t('fileView.delete')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              {file.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-0.5">
                  {file.tags.slice(0, 3).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs px-1 py-0">{tag}</Badge>
                  ))}
                </div>
              )}
              {file.uploader && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <UserAvatar avatarUrl={file.uploader.avatarUrl} size="xs" />
                  <p className="text-xs text-muted-foreground truncate">{file.uploader.username}</p>
                </div>
              )}
            </div>
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          <ContextMenuItem onSelect={() => navigate(`/f/${file.shortId}`)}>
            <FontAwesomeIcon icon={faFile} className="h-4 w-4" />
            {t('gallery.contextOpen')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={copyLink}>
            <FontAwesomeIcon icon={faLink} className="h-4 w-4" />
            {t('gallery.contextCopyLink')}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => window.open(`/f/${file.shortId}/raw`, '_blank')}>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-4 w-4" />
            {t('gallery.contextOpenRaw')}
          </ContextMenuItem>
          <ContextMenuItem asChild>
            <a href={`/f/${file.shortId}/download`} download>
              <FontAwesomeIcon icon={faDownload} className="h-4 w-4" />
              {t('gallery.contextDownload')}
            </a>
          </ContextMenuItem>
          {canDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem
                onSelect={() => setConfirmDelete(true)}
                className="text-destructive focus:text-destructive"
              >
                <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                {t('fileView.delete')}
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('fileView.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('fileView.deleteDescription', { name: file.originalName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('fileView.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('fileView.confirmDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function Gallery() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';
  const tag = searchParams.get('tag') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(q);

  // Bulk selection
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkCollOpen, setBulkCollOpen] = useState(false);
  const [bulkMoveCollOpen, setBulkMoveCollOpen] = useState(false);
  const [myCollections, setMyCollections] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [predefinedTags, setPredefinedTags] = useState([]);

  // File tags (for filter chips) – always loaded so filter chips are always visible
  useEffect(() => {
    fetch('/api/tags').then((r) => r.ok ? r.json() : { tags: [] }).then((d) => setAllTags(d.tags || []));
  }, []);

  // Predefined tags & user collections (loaded lazily when select mode activates)
  useEffect(() => {
    if (!selectMode) return;
    fetch('/api/user/predefined-tags').then((r) => r.ok ? r.json() : { tags: [] }).then((d) => setPredefinedTags(d.tags || []));
    fetch('/api/collections').then((r) => r.ok ? r.json() : { collections: [] }).then((d) => setMyCollections(d.collections || []));
  }, [selectMode]);

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
  }

  function toggleSelect(shortId) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(shortId) ? next.delete(shortId) : next.add(shortId);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(files.map((f) => f.shortId)));
  }

  async function bulkAction(action, extra = {}) {
    const shortIds = Array.from(selected);
    const r = await fetch('/api/files/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, shortIds, ...extra }),
    });
    if (!r.ok) { toast({ title: 'Failed', variant: 'destructive' }); return; }
    if (action === 'delete') {
      toast({ title: t('gallery.bulkDeleted', { count: shortIds.length }) });
      fetchFiles();
    } else if (action === 'tag') {
      toast({ title: t('gallery.bulkTagged') });
      fetchFiles();
    } else if (action === 'removeTag') {
      toast({ title: t('gallery.bulkTagRemoved') });
      fetchFiles();
    } else if (action === 'addToCollection') {
      toast({ title: t('gallery.bulkAddedToCollection') });
    } else if (action === 'moveToCollection') {
      toast({ title: t('gallery.bulkMoved') });
      fetchFiles();
    }
    setSelected(new Set());
    setBulkDeleteOpen(false);
    setBulkCollOpen(false);
    setBulkMoveCollOpen(false);
  }

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, q, type });
    if (tag) params.set('tag', tag);
    try {
      const r = await fetch(`/api/gallery?${params}`);
      if (r.ok) {
        const data = await r.json();
        setFiles(data.files);
        setTotal(data.total);
        setPages(data.pages);
      }
    } finally {
      setLoading(false);
    }
  }, [page, q, type, tag]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  useWebSocket((event, data) => {
    const uid = user?.id ? String(user.id) : null;
    if (!uid || data?.uploaderId !== uid) return;
    if (event === 'file:uploaded') fetchFiles();
    if (event === 'file:deleted') {
      setFiles((prev) => prev.filter((f) => f.shortId !== data.shortId));
      setTotal((prev) => Math.max(0, prev - 1));
    }
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearchParams({ q: searchInput, type, ...(tag && { tag }), page: 1 });
  }

  function clearSearch() {
    setSearchInput('');
    setSearchParams({ type, ...(tag && { tag }), page: 1 });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">{t('gallery.title')}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('gallery.filesCount', { count: total })}
            {user?.role !== 'admin' ? ` ${t('gallery.filesOwned')}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant={selectMode ? 'secondary' : 'outline'} onClick={toggleSelectMode} className="gap-1.5">
            <FontAwesomeIcon icon={faCheckSquare} className="h-3.5 w-3.5" />
            {selectMode ? t('gallery.cancelSelect') : t('gallery.selectMode')}
          </Button>
          <Button asChild>
            <Link to="/upload"><FontAwesomeIcon icon={faUpload} className="h-4 w-4 mr-2" />{t('gallery.upload')}</Link>
          </Button>
        </div>
      </div>

      {/* Search & filter */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('gallery.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-10 pl-9 pr-9"
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={type} onValueChange={(v) => setSearchParams({ q, type: v, ...(tag && { tag }), page: 1 })}>
          <SelectTrigger className="h-10 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('gallery.allTypes')}</SelectItem>
            <SelectItem value="image">{t('gallery.images')}</SelectItem>
            <SelectItem value="video">{t('gallery.videos')}</SelectItem>
            <SelectItem value="audio">{t('gallery.audio')}</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="code">{t('gallery.code')}</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary" className="h-10">{t('gallery.search')}</Button>
      </form>

      {/* Tag filter chips */}
      {allTags.length === 0 && tag && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="secondary" className="gap-1 cursor-pointer" onClick={() => setSearchParams({ q, type, page: 1 })}>
            <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
            {tag}
          </Badge>
        </div>
      )}
      {allTags.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{t('gallery.filterByTag')}:</span>
          {allTags.map((t_) => (
            <Badge
              key={t_}
              variant={tag === t_ ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setSearchParams({ q, type, tag: tag === t_ ? '' : t_, page: 1 })}
            >
              {t_}
            </Badge>
          ))}
          {tag && (
            <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setSearchParams({ q, type, page: 1 })}>
              <FontAwesomeIcon icon={faXmark} className="h-3 w-3 mr-0.5" />{t('gallery.allTags')}
            </button>
          )}
        </div>
      )}

      {/* Bulk toolbar */}
      {selectMode && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg border bg-muted/40">
          <span className="text-sm font-medium mr-auto">
            {selected.size > 0 ? t('gallery.selectedCount', { count: selected.size }) : t('gallery.selectMode')}
          </span>
          <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs">{t('common.selectAll') || 'Select all'}</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())} disabled={selected.size === 0} className="text-xs">{t('common.deselectAll') || 'Deselect all'}</Button>

          {/* Tag hinzufügen */}
          {predefinedTags.length > 0 ? (
            <Select onValueChange={(tag) => bulkAction('tag', { tags: [tag] })} disabled={selected.size === 0} value="">
              <SelectTrigger className="h-8 w-44 text-xs" disabled={selected.size === 0}>
                <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <SelectValue placeholder={t('gallery.bulkTag')} />
              </SelectTrigger>
              <SelectContent>
                {predefinedTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
              </SelectContent>
            </Select>
          ) : (
            <Button size="sm" variant="outline" disabled className="gap-1.5">
              <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5" />{t('gallery.bulkTag')}
            </Button>
          )}

          {/* Tag entfernen */}
          {(() => {
            const removableTags = [...new Set(
              files.filter((f) => selected.has(f.shortId)).flatMap((f) => f.tags || []),
            )].sort();
            return removableTags.length > 0 ? (
              <Select onValueChange={(tag) => bulkAction('removeTag', { tags: [tag] })} disabled={selected.size === 0} value="">
                <SelectTrigger className="h-8 w-44 text-xs" disabled={selected.size === 0}>
                  <span className="flex items-center gap-1 shrink-0">
                    <FontAwesomeIcon icon={faMinus} className="h-2.5 w-2.5" />
                    <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5 mr-1" />
                  </span>
                  <SelectValue placeholder={t('gallery.bulkRemoveTag')} />
                </SelectTrigger>
                <SelectContent>
                  {removableTags.map((tag) => <SelectItem key={tag} value={tag}>{tag}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Button size="sm" variant="outline" disabled className="gap-1.5">
                <FontAwesomeIcon icon={faMinus} className="h-2.5 w-2.5" />
                <FontAwesomeIcon icon={faTag} className="h-3.5 w-3.5" />{t('gallery.bulkRemoveTag')}
              </Button>
            );
          })()}

          {/* Zur Sammlung hinzufügen */}
          {bulkCollOpen ? (
            <div className="flex gap-1 items-center">
              <Select onValueChange={(collId) => { bulkAction('addToCollection', { collectionId: collId }); setBulkCollOpen(false); }}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder={t('addToCollection.title')} /></SelectTrigger>
                <SelectContent>
                  {myCollections.map((c) => <SelectItem key={c.shortId} value={c.shortId}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setBulkCollOpen(false)}><FontAwesomeIcon icon={faXmark} /></Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={selected.size === 0 || myCollections.length === 0} onClick={() => setBulkCollOpen(true)} className="gap-1.5">
              <FontAwesomeIcon icon={faFolderPlus} className="h-3.5 w-3.5" />{t('gallery.bulkAddToCollection')}
            </Button>
          )}

          {/* In Sammlung verschieben */}
          {bulkMoveCollOpen ? (
            <div className="flex gap-1 items-center">
              <Select onValueChange={(collId) => { bulkAction('moveToCollection', { collectionId: collId }); setBulkMoveCollOpen(false); }}>
                <SelectTrigger className="h-8 w-44 text-xs"><SelectValue placeholder={t('gallery.bulkMoveToCollection')} /></SelectTrigger>
                <SelectContent>
                  {myCollections.map((c) => <SelectItem key={c.shortId} value={c.shortId}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setBulkMoveCollOpen(false)}><FontAwesomeIcon icon={faXmark} /></Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" disabled={selected.size === 0 || myCollections.length === 0} onClick={() => setBulkMoveCollOpen(true)} className="gap-1.5">
              <FontAwesomeIcon icon={faArrowRight} className="h-3.5 w-3.5" />{t('gallery.bulkMoveToCollection')}
            </Button>
          )}

          {/* Delete */}
          <Button size="sm" variant="destructive" disabled={selected.size === 0} onClick={() => setBulkDeleteOpen(true)} className="gap-1.5">
            <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />{t('gallery.bulkDelete')}
          </Button>
        </div>
      )}

      {/* Bulk delete confirmation */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('gallery.bulkDeleteConfirmTitle', { count: selected.size })}</AlertDialogTitle>
            <AlertDialogDescription>{t('gallery.bulkDeleteConfirmDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('fileView.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkAction('delete')} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('gallery.bulkDelete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-lg border bg-card overflow-hidden animate-pulse">
              <div className="aspect-square bg-muted/50" />
              <div className="p-3 space-y-2">
                <div className="h-3 bg-muted rounded w-3/4" />
                <div className="h-3 bg-muted rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-muted-foreground">
          <FontAwesomeIcon icon={faFile} className="h-16 w-16 opacity-20" />
          <p className="text-lg">{t('gallery.noFiles')}</p>
          <Button asChild variant="outline">
            <Link to="/upload">{t('gallery.uploadFirst')}</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {files.map((f) => (
            <FileCard
              key={f._id}
              file={f}
              user={user}
              onDelete={fetchFiles}
              selectMode={selectMode}
              selected={selected.has(f.shortId)}
              onToggleSelect={toggleSelect}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={page <= 1}
                onClick={() => setSearchParams({ q, type, page: page - 1 })}
              />
            </PaginationItem>
            {buildPageItems(page, pages).map((item, idx) =>
              item === '...' ? (
                <PaginationItem key={`ellipsis-${idx}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    isActive={item === page}
                    onClick={() => setSearchParams({ q, type, page: item })}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                disabled={page >= pages}
                onClick={() => setSearchParams({ q, type, page: page + 1 })}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
