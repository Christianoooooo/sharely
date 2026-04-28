import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { fmtSize, fmtDate } from '@/lib/utils';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate, faTrash, faUserPlus, faPowerOff, faPencil, faCheck, faXmark, faKey } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { UserAvatar } from '@/components/UserAvatar';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [editingFolder, setEditingFolder] = useState(null); // { id, value }
  const folderInputRef = useRef(null);
  const [editingRole, setEditingRole] = useState(null); // { id, value }
  const [pwDialog, setPwDialog] = useState(null); // { id, username }
  const [newPw, setNewPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [newKeyDialog, setNewKeyDialog] = useState(null); // { username, apiKey }

  async function load() {
    const r = await fetch('/api/admin/users');
    if (r.ok) {
      const data = await r.json();
      setUsers(data.users);
    }
  }

  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: t('adminUsers.created', { username: newUser.username }) });
      setNewUser({ username: '', password: '', role: 'user' });
      load();
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }

  async function toggleUser(id, username, isActive) {
    const r = await fetch(`/api/admin/users/${id}/toggle`, { method: 'PATCH' });
    if (r.ok) {
      toast({ title: isActive ? t('adminUsers.deactivated', { username }) : t('adminUsers.activated', { username }) });
      load();
    }
  }

  async function deleteUser(id, username) {
    const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: t('adminUsers.deleted', { username }) });
      load();
    } else {
      toast({ title: t('adminUsers.deleteFailed'), variant: 'destructive' });
    }
  }

  async function regenKey(id, username) {
    const r = await fetch(`/api/admin/users/${id}/regen-key`, { method: 'POST' });
    if (r.ok) {
      const data = await r.json();
      setNewKeyDialog({ username, apiKey: data.apiKey });
      load();
    }
  }

  function startEditFolder(id, current) {
    setEditingFolder({ id, value: current || '' });
    setTimeout(() => folderInputRef.current?.focus(), 0);
  }

  function cancelEditFolder() {
    setEditingFolder(null);
  }

  async function saveRole(id) {
    const { value } = editingRole;
    const r = await fetch(`/api/admin/users/${id}/role`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: value }),
    });
    const data = await r.json();
    if (r.ok) {
      toast({ title: t('adminUsers.roleChanged', { username: users.find((u) => u._id === id)?.username, role: value }) });
      setEditingRole(null);
      load();
    } else {
      toast({ title: data.error, variant: 'destructive' });
    }
  }

  function openPwDialog(id, username) {
    setNewPw('');
    setPwDialog({ id, username });
  }

  async function savePassword() {
    if (newPw.length < 12) {
      toast({ title: t('adminUsers.passwordTooShort'), variant: 'destructive' });
      return;
    }
    setSavingPw(true);
    try {
      const r = await fetch(`/api/admin/users/${pwDialog.id}/password`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPw }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      toast({ title: t('adminUsers.pwChanged', { username: pwDialog.username }) });
      setPwDialog(null);
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setSavingPw(false);
    }
  }

  async function saveFolder(id) {
    const folderName = editingFolder.value.trim();
    if (!folderName) { cancelEditFolder(); return; }
    const r = await fetch(`/api/admin/users/${id}/folder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderName }),
    });
    const data = await r.json();
    if (r.ok) {
      toast({ title: t('adminUsers.folderRenamed', { name: data.folderName }) });
      setEditingFolder(null);
      load();
    } else {
      toast({ title: data.error, variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('adminUsers.title')}</h1>

      {/* Create user */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FontAwesomeIcon icon={faUserPlus} className="h-4 w-4" />{t('adminUsers.createUser')}
          </CardTitle>
          <CardDescription>{t('adminUsers.createUserDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label>{t('adminUsers.username')}</Label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                minLength={3} maxLength={32} required
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label>{t('adminUsers.password')}</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                minLength={6} required
              />
            </div>
            <div className="space-y-1.5 w-32">
              <Label>{t('adminUsers.role')}</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t('adminUsers.roleUser')}</SelectItem>
                  <SelectItem value="admin">{t('adminUsers.roleAdmin')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? t('adminUsers.creating') : t('adminUsers.create')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('adminUsers.colUsername')}</TableHead>
                <TableHead>{t('adminUsers.colFolder')}</TableHead>
                <TableHead>{t('adminUsers.colRole')}</TableHead>
                <TableHead>{t('adminUsers.colFiles')}</TableHead>
                <TableHead>{t('adminUsers.colStorage')}</TableHead>
                <TableHead>{t('adminUsers.colStatus')}</TableHead>
                <TableHead>{t('adminUsers.colCreated')}</TableHead>
                <TableHead>{t('adminUsers.colApiKey')}</TableHead>
                <TableHead className="text-right">{t('adminUsers.colActions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id} className={!u.isActive ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <UserAvatar avatarUrl={u.avatarUrl} size="sm" />
                      {u.username}
                    </div>
                  </TableCell>
                  <TableCell>
                    {editingFolder?.id === u._id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          ref={folderInputRef}
                          className="h-7 w-36 text-xs"
                          value={editingFolder.value}
                          onChange={(e) => setEditingFolder((p) => ({ ...p, value: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveFolder(u._id);
                            if (e.key === 'Escape') cancelEditFolder();
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveFolder(u._id)}>
                          <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEditFolder}>
                          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{u.folderName || u.username}</code>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          title={t('adminUsers.titleRenameFolder')}
                          onClick={() => startEditFolder(u._id, u.folderName || u.username)}
                        >
                          <FontAwesomeIcon icon={faPencil} className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingRole?.id === u._id ? (
                      <div className="flex items-center gap-1">
                        <Select value={editingRole.value} onValueChange={(v) => setEditingRole((p) => ({ ...p, value: v }))}>
                          <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">{t('adminUsers.roleUser')}</SelectItem>
                            <SelectItem value="admin">{t('adminUsers.roleAdmin')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveRole(u._id)}>
                          <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5 text-green-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRole(null)}>
                          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 group">
                        <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                        {u._id !== me?.id && (
                          <Button
                            variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            title={t('adminUsers.titleChangeRole')}
                            onClick={() => setEditingRole({ id: u._id, value: u.role })}
                          >
                            <FontAwesomeIcon icon={faPencil} className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.fileCount}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtSize(u.storageUsed)}</TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'outline' : 'destructive'} className={u.isActive ? 'border-green-500/50 text-green-400' : ''}>
                      {u.isActive ? t('adminUsers.statusActive') : t('adminUsers.statusInactive')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                      {u.apiKeyPrefix || '—'}…
                    </code>
                  </TableCell>
                  <TableCell>
                    {u._id !== me?.id && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title={u.isActive ? t('adminUsers.titleDeactivate') : t('adminUsers.titleActivate')}
                          onClick={() => toggleUser(u._id, u.username, u.isActive)}
                        >
                          <FontAwesomeIcon icon={faPowerOff} className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title={t('adminUsers.titleChangePassword')}
                          onClick={() => openPwDialog(u._id, u.username)}
                        >
                          <FontAwesomeIcon icon={faKey} className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title={t('adminUsers.titleRegenKey')}
                          onClick={() => regenKey(u._id, u.username)}
                        >
                          <FontAwesomeIcon icon={faRotate} className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <FontAwesomeIcon icon={faTrash} className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('adminUsers.deleteUser')}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t('adminUsers.deleteUserDesc', { username: u.username, count: u.fileCount })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('adminUsers.cancel')}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(u._id, u.username)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                {t('adminUsers.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                    {u._id === me?.id && <span className="text-xs text-muted-foreground pr-2">{t('adminUsers.selfLabel')}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* New API key dialog */}
      <Dialog open={!!newKeyDialog} onOpenChange={(open) => { if (!open) setNewKeyDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('adminUsers.newKeyTitle', { username: newKeyDialog?.username })}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{t('adminUsers.newKeyDesc')}</p>
          <code
            className="text-xs bg-muted px-3 py-2 rounded block break-all cursor-pointer hover:bg-muted/70 transition-colors"
            onClick={() => { navigator.clipboard.writeText(newKeyDialog?.apiKey || ''); toast({ title: t('common.copiedToClipboard') }); }}
          >
            {newKeyDialog?.apiKey}
          </code>
          <DialogFooter>
            <Button onClick={() => setNewKeyDialog(null)}>{t('adminUsers.newKeyClose')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change password dialog */}
      <Dialog open={!!pwDialog} onOpenChange={(open) => { if (!open) setPwDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('adminUsers.changePwTitle', { username: pwDialog?.username })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5 py-2">
            <Label>{t('adminUsers.newPassword')}</Label>
            <Input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              minLength={6}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') savePassword(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwDialog(null)}>{t('adminUsers.cancel')}</Button>
            <Button onClick={savePassword} disabled={savingPw}>
              {savingPw ? t('adminUsers.saving') : t('adminUsers.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
