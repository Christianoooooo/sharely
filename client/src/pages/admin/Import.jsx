import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileSearch, CheckCircle2, AlertCircle, SkipForward, ArrowRight } from 'lucide-react';

// ── Step indicator ─────────────────────────────────────────────────────────────

function Step({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        done ? 'bg-primary text-primary-foreground' :
        active ? 'bg-primary/20 text-primary border border-primary' :
        'bg-muted text-muted-foreground'
      }`}>
        {done ? <CheckCircle2 className="h-4 w-4" /> : n}
      </div>
      <span className={`text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}

// ── Result badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'imported') return <Badge className="bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/15">Imported</Badge>;
  if (status === 'skipped') return <Badge variant="secondary">Skipped</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminImport() {
  const { toast } = useToast();
  const dbInputRef = useRef(null);

  // Step 1: DB upload + preview
  const [dbFile, setDbFile] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null); // { users, localUsers }

  // Step 2: configure mapping
  const [storagePath, setStoragePath] = useState('');
  const [userMapping, setUserMapping] = useState({}); // xbbId → localUsername | ''
  const [defaultUser, setDefaultUser] = useState('');

  // Step 3: import results
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null); // { imported, skipped, errors, details }

  const step = result ? 3 : preview ? 2 : 1;

  // ── Step 1: load preview from DB ───────────────────────────────────────────

  async function handlePreview() {
    if (!dbFile) return;
    setPreviewing(true);
    setPreview(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('db', dbFile);

      const r = await fetch('/api/admin/import/xbackbone/preview', { method: 'POST', body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      // Pre-fill mapping with auto-matched users
      const initialMapping = {};
      for (const xu of data.users) {
        initialMapping[xu.xbbId] = xu.matchedLocalUser || '';
      }
      setUserMapping(initialMapping);
      setPreview(data);
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }

  // ── Step 2 → 3: run import ─────────────────────────────────────────────────

  async function handleImport() {
    if (!dbFile || !storagePath.trim()) {
      toast({ title: 'Storage path is required', variant: 'destructive' });
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append('db', dbFile);
      form.append('storagePath', storagePath.trim());
      if (defaultUser) form.append('defaultUser', defaultUser);

      const r = await fetch('/api/admin/import/xbackbone', { method: 'POST', body: form });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      setResult(data);
      toast({ title: `Import complete — ${data.imported} file(s) imported` });
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  }

  function reset() {
    setDbFile(null);
    setPreview(null);
    setResult(null);
    setStoragePath('');
    setUserMapping({});
    setDefaultUser('');
    if (dbInputRef.current) dbInputRef.current.value = '';
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Import from XBackBone</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Migrate files and metadata from an existing XBackBone instance.
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 flex-wrap">
        <Step n={1} label="Upload database" active={step === 1} done={step > 1} />
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <Step n={2} label="Configure &amp; map users" active={step === 2} done={step > 2} />
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <Step n={3} label="Results" active={step === 3} done={false} />
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upload XBackBone database</CardTitle>
            <CardDescription>
              Select the <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">database.db</code> file
              from your XBackBone installation. This is only used to read metadata — no data is modified.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="db-file">database.db</Label>
              <Input
                id="db-file"
                ref={dbInputRef}
                type="file"
                accept=".db,application/octet-stream"
                onChange={(e) => setDbFile(e.target.files[0] || null)}
              />
            </div>
            <Button onClick={handlePreview} disabled={!dbFile || previewing}>
              {previewing ? (
                <><span className="animate-spin mr-2">⟳</span>Analysing…</>
              ) : (
                <><FileSearch className="h-4 w-4 mr-2" />Analyse database</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          {/* User mapping table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User mapping</CardTitle>
              <CardDescription>
                Users auto-matched by username are pre-filled. Adjust as needed.
                Files whose XBackBone user has no mapping will be assigned to the fallback user (if set).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>XBackBone user</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Map to local user</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.users.map((xu) => (
                    <TableRow key={xu.xbbId}>
                      <TableCell>
                        <div className="font-medium">{xu.xbbUsername || <span className="text-muted-foreground">(no username)</span>}</div>
                        <div className="text-xs text-muted-foreground">{xu.xbbEmail}</div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{xu.fileCount}</TableCell>
                      <TableCell>
                        <select
                          value={userMapping[xu.xbbId] || ''}
                          onChange={(e) => setUserMapping((m) => ({ ...m, [xu.xbbId]: e.target.value }))}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">— use fallback —</option>
                          {preview.localUsers.map((lu) => (
                            <option key={lu} value={lu}>{lu}</option>
                          ))}
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Storage path + fallback + action */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storage configuration</CardTitle>
              <CardDescription>
                The storage directory must be accessible from this server's filesystem.
                For Docker, mount XBackBone's storage volume, e.g.:
                <code className="block font-mono text-xs bg-muted px-2 py-1 rounded mt-1">
                  volumes:<br />
                  &nbsp;&nbsp;- /path/to/xbackbone/storage:/xbackbone/storage:ro
                </code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="storage-path">Storage directory path (server-side)</Label>
                <Input
                  id="storage-path"
                  placeholder="/xbackbone/storage"
                  value={storagePath}
                  onChange={(e) => setStoragePath(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default-user">Fallback user (for unmatched XBackBone users)</Label>
                <select
                  id="default-user"
                  value={defaultUser}
                  onChange={(e) => setDefaultUser(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">— skip unmatched files —</option>
                  {preview.localUsers.map((lu) => (
                    <option key={lu} value={lu}>{lu}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleImport} disabled={!storagePath.trim() || importing}>
                  {importing ? (
                    <><span className="animate-spin mr-2">⟳</span>Importing…</>
                  ) : (
                    <><Upload className="h-4 w-4 mr-2" />Run import</>
                  )}
                </Button>
                <Button variant="outline" onClick={reset} disabled={importing}>Start over</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3 ── */}
      {step === 3 && result && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="text-2xl font-bold">{result.imported}</div>
                    <div className="text-xs text-muted-foreground">Imported</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <SkipForward className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold">{result.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <div>
                    <div className="text-2xl font-bold">{result.errors}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Details table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[480px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Info</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.details.map((d, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs max-w-[260px] truncate">{d.file}</TableCell>
                        <TableCell><StatusBadge status={d.status} /></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {d.status === 'imported' ? `→ ${d.user}` : d.reason}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" onClick={reset}>New import</Button>
        </div>
      )}
    </div>
  );
}
