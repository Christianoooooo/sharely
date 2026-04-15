import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { useToast } from '@/hooks/use-toast';
import { fmtSize, fmtDate } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark, faTrash } from '@fortawesome/free-solid-svg-icons';

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

export default function AdminFiles() {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [files, setFiles] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [searchInput, setSearchInput] = useState('');

  const q = searchParams.get('q') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/files?q=${encodeURIComponent(q)}&page=${page}`);
    if (r.ok) {
      const data = await r.json();
      setFiles(data.files);
      setTotal(data.total);
      setPages(data.pages);
    }
  }, [q, page]);

  useEffect(() => { load(); }, [load]);

  async function deleteFile(shortId, name) {
    const r = await fetch(`/api/file/${shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: `Deleted "${name}"` });
      load();
    } else {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  }

  function handleSearch(e) {
    e.preventDefault();
    setSearchParams({ q: searchInput, page: 1 });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">All Files</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total} total</p>
        </div>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by filename…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button type="button" onClick={() => { setSearchInput(''); setSearchParams({ page: 1 }); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button type="submit" variant="secondary">Search</Button>
      </form>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>File</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Uploader</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {files.map((f) => (
                <TableRow key={f._id}>
                  <TableCell>
                    <Link to={`/f/${f.shortId}`} className="hover:underline text-primary font-medium truncate block max-w-[220px]">
                      {f.originalName}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{f.displayType}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">{fmtSize(f.size)}</TableCell>
                  <TableCell className="text-muted-foreground">{f.uploader?.username || '—'}</TableCell>
                  <TableCell className="text-muted-foreground">{f.views}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(f.createdAt)}</TableCell>
                  <TableCell>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <FontAwesomeIcon icon={faTrash} className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete file?</AlertDialogTitle>
                          <AlertDialogDescription>"{f.originalName}" will be permanently deleted.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteFile(f.shortId, f.originalName)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
              {files.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">No files found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {pages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                disabled={page <= 1}
                onClick={() => setSearchParams({ q, page: page - 1 })}
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
                    onClick={() => setSearchParams({ q, page: item })}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              )
            )}
            <PaginationItem>
              <PaginationNext
                disabled={page >= pages}
                onClick={() => setSearchParams({ q, page: page + 1 })}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
