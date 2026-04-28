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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fmtSize } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faMagnifyingGlass, faXmark, faImage, faVideo, faMusic, faFileLines, faCode, faFile, faLink, faDownload, faArrowUpRightFromSquare, faTrash } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/UserAvatar';

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

function FileCard({ file, user, onDelete }) {
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
                <span className="text-xs text-muted-foreground">{fmtSize(file.size)}</span>
              </div>
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const q = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(q);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page, q, type });
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
  }, [page, q, type]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  function handleSearch(e) {
    e.preventDefault();
    setSearchParams({ q: searchInput, type, page: 1 });
  }

  function clearSearch() {
    setSearchInput('');
    setSearchParams({ type, page: 1 });
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
        <Button asChild>
          <Link to="/upload"><FontAwesomeIcon icon={faUpload} className="h-4 w-4 mr-2" />{t('gallery.upload')}</Link>
        </Button>
      </div>

      {/* Search & filter */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder={t('gallery.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button type="button" onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          )}
        </div>
        <Select value={type} onValueChange={(v) => setSearchParams({ q, type: v, page: 1 })}>
          <SelectTrigger className="w-36">
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
        <Button type="submit" variant="secondary">{t('gallery.search')}</Button>
      </form>

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
          {files.map((f) => <FileCard key={f._id} file={f} user={user} onDelete={fetchFiles} />)}
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
