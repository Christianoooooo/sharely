import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtSize, fmtDate } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faFolderOpen, faHardDrive, faTrash } from '@fortawesome/free-solid-svg-icons';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  async function load() {
    const r = await fetch('/api/admin/stats');
    if (r.ok) setStats(await r.json());
  }

  useEffect(() => { load(); }, []);

  async function deleteFile(shortId, name) {
    const r = await fetch(`/api/file/${shortId}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('adminDashboard.deleted', { name }) });
      load();
    } else {
      toast({ title: t('adminDashboard.deleteFailed'), variant: 'destructive' });
    }
  }

  if (!stats) {
    return <div className="text-muted-foreground text-sm animate-pulse py-12 text-center">{t('adminDashboard.loading')}</div>;
  }

  const statCards = [
    { label: t('adminDashboard.statUsers'), value: stats.userCount, icon: faUsers },
    { label: t('adminDashboard.statFiles'), value: stats.fileCount, icon: faFolderOpen },
    { label: t('adminDashboard.statStorage'), value: fmtSize(stats.totalSize), icon: faHardDrive },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">{t('adminDashboard.title')}</h1>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/admin/users">{t('adminDashboard.users')}</Link></Button>
          <Button variant="outline" asChild><Link to="/admin/files">{t('adminDashboard.allFiles')}</Link></Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map(({ label, value, icon }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <FontAwesomeIcon icon={icon} className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent uploads */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('adminDashboard.recentUploads')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminDashboard.tableFile')}</TableHead>
                <TableHead>{t('adminDashboard.tableType')}</TableHead>
                <TableHead>{t('adminDashboard.tableSize')}</TableHead>
                <TableHead>{t('adminDashboard.tableUploader')}</TableHead>
                <TableHead>{t('adminDashboard.tableViews')}</TableHead>
                <TableHead>{t('adminDashboard.tableDate')}</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentFiles.map((f) => (
                <TableRow key={f._id}>
                  <TableCell>
                    <Link to={`/f/${f.shortId}`} className="hover:underline text-primary font-medium truncate block max-w-[200px]">
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
                          <AlertDialogTitle>{t('adminDashboard.deleteFile')}</AlertDialogTitle>
                          <AlertDialogDescription>{t('adminDashboard.deleteFileDesc', { name: f.originalName })}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t('adminDashboard.cancel')}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteFile(f.shortId, f.originalName)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {t('adminDashboard.delete')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
