import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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
import { fmtSize } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faMagnifyingGlass, faXmark, faImage, faVideo, faMusic, faFileLines, faCode, faFile } from '@fortawesome/free-solid-svg-icons';

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

function FileCard({ file }) {
  const icon = TYPE_ICONS[file.displayType] || faFile;
  return (
    <Link
      to={`/f/${file.shortId}`}
      className="group rounded-lg border bg-card overflow-hidden flex flex-col hover:border-primary/60 transition-colors"
    >
      <div className="aspect-square bg-muted/30 flex items-center justify-center overflow-hidden">
        {file.displayType === 'image' ? (
          <img
            src={`/f/${file.shortId}/raw`}
            alt={file.originalName}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            loading="lazy"
          />
        ) : (
          <FontAwesomeIcon icon={icon} className="h-12 w-12 text-muted-foreground/50" />
        )}
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
          <p className="text-xs text-muted-foreground truncate">by {file.uploader.username}</p>
        )}
      </div>
    </Link>
  );
}

export default function Gallery() {
  const { user } = useAuth();
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
          <h1 className="text-2xl font-bold">Gallery</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} file{total !== 1 ? 's' : ''}
            {user?.role !== 'admin' ? ' (yours)' : ''}
          </p>
        </div>
        <Button asChild>
          <Link to="/upload"><FontAwesomeIcon icon={faUpload} className="h-4 w-4 mr-2" />Upload</Link>
        </Button>
      </div>

      {/* Search & filter */}
      <form onSubmit={handleSearch} className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search files…"
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
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="image">Images</SelectItem>
            <SelectItem value="video">Videos</SelectItem>
            <SelectItem value="audio">Audio</SelectItem>
            <SelectItem value="pdf">PDF</SelectItem>
            <SelectItem value="code">Code / Text</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
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
          <p className="text-lg">No files found</p>
          <Button asChild variant="outline">
            <Link to="/upload">Upload your first file</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {files.map((f) => <FileCard key={f._id} file={f} />)}
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
