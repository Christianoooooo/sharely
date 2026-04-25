import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faMagnifyingGlass, faXmark, faDownload } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';

const ACTION_COLORS = {
  login: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  logout: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  register: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  upload: 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  delete_file: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  delete_account: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
  export_data: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  change_password: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  regen_api_key: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  sharex_config: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  admin_create_user: 'bg-blue-200 text-blue-900 dark:bg-blue-900 dark:text-blue-100',
  admin_delete_user: 'bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100',
  admin_toggle_user: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
  admin_change_role: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  admin_regen_key: 'bg-orange-200 text-orange-900 dark:bg-orange-900 dark:text-orange-100',
  admin_change_password: 'bg-yellow-200 text-yellow-900 dark:bg-yellow-900 dark:text-yellow-100',
};

const ALL_ACTIONS = Object.keys(ACTION_COLORS);

function buildPageItems(page, pages) {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1);
  const items = [1];
  if (page - 1 > 2) items.push('...');
  for (let i = Math.max(2, page - 1); i <= Math.min(pages - 1, page + 1); i++) items.push(i);
  if (page + 1 < pages - 1) items.push('...');
  items.push(pages);
  return items;
}

function fmtTs(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AdminAuditLog() {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [userInput, setUserInput] = useState('');
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    const params = new URLSearchParams();
    if (user) params.set('user', user);
    if (action) params.set('action', action);
    const r = await fetch(`/api/admin/audit-log/export?${params}`);
    if (r.ok) {
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
    setExporting(false);
  }

  const user = searchParams.get('user') || '';
  const action = searchParams.get('action') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (user) params.set('user', user);
    if (action) params.set('action', action);
    params.set('page', page);
    const r = await fetch(`/api/admin/audit-log?${params}`);
    if (r.ok) {
      const data = await r.json();
      setLogs(data.logs);
      setTotal(data.total);
      setPages(data.pages);
    }
  }, [user, action, page]);

  useEffect(() => { setUserInput(user); }, [user]);
  useEffect(() => { load(); }, [load]);

  function handleUserSearch(e) {
    e.preventDefault();
    setSearchParams({ user: userInput, action, page: 1 });
  }

  function setAction(a) {
    setSearchParams({ user, action: a, page: 1 });
  }

  function clearFilters() {
    setUserInput('');
    setSearchParams({});
  }

  const hasFilter = user || action;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t('adminAuditLog.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('adminAuditLog.total_one', { count: total })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <FontAwesomeIcon icon={faDownload} className="mr-1.5 h-3 w-3" />
            {exporting ? t('adminAuditLog.exporting') : t('adminAuditLog.exportCsv')}
          </Button>
          {hasFilter && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <FontAwesomeIcon icon={faXmark} className="mr-1 h-3 w-3" />
              {t('adminAuditLog.clearFilters')}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <form onSubmit={handleUserSearch} className="flex gap-2">
          <Input
            placeholder={t('adminAuditLog.filterUserPlaceholder')}
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            className="w-44"
          />
          <Button type="submit" variant="outline" size="icon">
            <FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4" />
          </Button>
        </form>

        <div className="flex flex-wrap gap-1">
          <Button
            variant={!action ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setAction('')}
          >
            {t('adminAuditLog.allActions')}
          </Button>
          {ALL_ACTIONS.map((a) => (
            <Button
              key={a}
              variant={action === a ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setAction(a)}
            >
              {t(`adminAuditLog.action_${a}`, { defaultValue: a })}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminAuditLog.colTimestamp')}</TableHead>
                <TableHead>{t('adminAuditLog.colUser')}</TableHead>
                <TableHead>{t('adminAuditLog.colAction')}</TableHead>
                <TableHead>{t('adminAuditLog.colIp')}</TableHead>
                <TableHead>{t('adminAuditLog.colMeta')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t('adminAuditLog.noEntries')}
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log._id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {fmtTs(log.timestamp)}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    {log.username ?? <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] ?? 'bg-muted text-muted-foreground'}`}>
                      {t(`adminAuditLog.action_${log.action}`, { defaultValue: log.action })}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {log.ip ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                    {log.meta && Object.keys(log.meta).length > 0
                      ? Object.entries(log.meta)
                          .map(([k, v]) => `${k}: ${v}`)
                          .join(', ')
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {pages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => page > 1 && setSearchParams({ user, action, page: page - 1 })}
                className={page <= 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {buildPageItems(page, pages).map((item, i) => (
              <PaginationItem key={i}>
                {item === '...' ? (
                  <PaginationEllipsis />
                ) : (
                  <PaginationLink
                    isActive={item === page}
                    onClick={() => setSearchParams({ user, action, page: item })}
                    className="cursor-pointer"
                  >
                    {item}
                  </PaginationLink>
                )}
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                onClick={() => page < pages && setSearchParams({ user, action, page: page + 1 })}
                className={page >= pages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
