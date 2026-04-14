import { useState, useEffect } from 'react';
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
import { useToast } from '@/components/ui/use-toast';
import { fmtSize, fmtDate } from '@/lib/utils';
import { RefreshCw, Trash2, UserPlus, Power } from 'lucide-react';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });

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
      toast({ title: `User "${newUser.username}" created` });
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
      toast({ title: `${username} ${isActive ? 'deactivated' : 'activated'}` });
      load();
    }
  }

  async function deleteUser(id, username) {
    const r = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
    if (r.ok) {
      toast({ title: `User "${username}" and their files deleted` });
      load();
    } else {
      toast({ title: 'Delete failed', variant: 'destructive' });
    }
  }

  async function regenKey(id, username) {
    const r = await fetch(`/api/admin/users/${id}/regen-key`, { method: 'POST' });
    if (r.ok) {
      toast({ title: `API key regenerated for ${username}` });
      load();
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>

      {/* Create user */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />Create User
          </CardTitle>
          <CardDescription>New users are created with a random API key</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={createUser} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label>Username</Label>
              <Input
                value={newUser.username}
                onChange={(e) => setNewUser((p) => ({ ...p, username: e.target.value }))}
                minLength={3} maxLength={32} required
              />
            </div>
            <div className="space-y-1.5 flex-1 min-w-[140px]">
              <Label>Password</Label>
              <Input
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser((p) => ({ ...p, password: e.target.value }))}
                minLength={6} required
              />
            </div>
            <div className="space-y-1.5 w-32">
              <Label>Role</Label>
              <Select value={newUser.role} onValueChange={(v) => setNewUser((p) => ({ ...p, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
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
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Files</TableHead>
                <TableHead>Storage</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u._id} className={!u.isActive ? 'opacity-50' : ''}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{u.fileCount}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtSize(u.storageUsed)}</TableCell>
                  <TableCell>
                    <Badge variant={u.isActive ? 'outline' : 'destructive'} className={u.isActive ? 'border-green-500/50 text-green-400' : ''}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{fmtDate(u.createdAt)}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded" title={u.apiKey}>
                      {u.apiKey?.slice(0, 8)}…
                    </code>
                  </TableCell>
                  <TableCell>
                    {u._id !== me?.id && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title={u.isActive ? 'Deactivate' : 'Activate'}
                          onClick={() => toggleUser(u._id, u.username, u.isActive)}
                        >
                          <Power className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8"
                          title="Regenerate API key"
                          onClick={() => regenKey(u._id, u.username)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete user?</AlertDialogTitle>
                              <AlertDialogDescription>
                                User "{u.username}" and all their files ({u.fileCount}) will be permanently deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteUser(u._id, u.username)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    )}
                    {u._id === me?.id && <span className="text-xs text-muted-foreground pr-2">(you)</span>}
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
