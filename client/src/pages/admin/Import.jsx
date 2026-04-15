import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUpload, faMagnifyingGlass, faCircleCheck, faCircleExclamation, faForwardStep, faArrowRight } from '@fortawesome/free-solid-svg-icons';

// ── Step indicator ─────────────────────────────────────────────────────────────

function Step({ n, label, active, done }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        done ? 'bg-primary text-primary-foreground' :
        active ? 'bg-primary/20 text-primary border border-primary' :
        'bg-muted text-muted-foreground'
      }`}>
        {done ? <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" /> : n}
      </div>
      <span className={`text-sm ${active ? 'font-medium' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }) {
  if (status === 'imported') return <Badge className="bg-green-500/15 text-green-700 border-green-200 hover:bg-green-500/15">Imported</Badge>;
  if (status === 'skipped') return <Badge variant="secondary">Skipped</Badge>;
  return <Badge variant="destructive">Error</Badge>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function AdminImport() {
  const { toast } = useToast();

  // Paths (step 1)
  const [dbPath, setDbPath] = useState('');
  const [storagePath, setStoragePath] = useState('');
  const [previewing, setPreviewing] = useState(false);

  // User mapping (step 2)
  const [preview, setPreview] = useState(null); // { users, localUsers }
  const [defaultUser, setDefaultUser] = useState('');

  // Results (step 3)
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  const step = result ? 3 : preview ? 2 : 1;

  // ── Step 1 → 2: analyse paths ───────────────────────────────────────────────

  async function handlePreview() {
    if (!dbPath.trim()) {
      toast({ title: 'Database path is required', variant: 'destructive' });
      return;
    }
    setPreviewing(true);
    setPreview(null);
    setResult(null);
    try {
      const r = await fetch('/api/admin/import/xbackbone/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dbPath: dbPath.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);

      // Pre-fill mapping with auto-matched users
      setPreview(data);
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setPreviewing(false);
    }
  }

  // ── Step 2 → 3: run import ─────────────────────────────────────────────────

  async function handleImport() {
    if (!storagePath.trim()) {
      toast({ title: 'Storage path is required', variant: 'destructive' });
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const body = { dbPath: dbPath.trim(), storagePath: storagePath.trim() };
      if (defaultUser) body.defaultUser = defaultUser;

      const r = await fetch('/api/admin/import/xbackbone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
    setDbPath('');
    setStoragePath('');
    setPreview(null);
    setResult(null);
    setDefaultUser('');
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Migrate from XBackBone</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Migrate files and metadata from an existing XBackBone instance.
        </p>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-3 flex-wrap">
        <Step n={1} label="Configure paths" active={step === 1} done={step > 1} />
        <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-muted-foreground shrink-0" />
        <Step n={2} label="Map users" active={step === 2} done={step > 2} />
        <FontAwesomeIcon icon={faArrowRight} className="h-4 w-4 text-muted-foreground shrink-0" />
        <Step n={3} label="Results" active={step === 3} done={false} />
      </div>

      {/* ── STEP 1 ── */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">XBackBone paths</CardTitle>
            <CardDescription>
              Both paths must be accessible on the server filesystem. Mount them as
              read-only Docker volumes if needed, e.g.:
              <code className="block font-mono text-xs bg-muted px-2 py-1 rounded mt-1 whitespace-pre">
                volumes:{'\n'}
                {'  '}- /path/to/xbackbone/database.db:/xbackbone/database.db:ro{'\n'}
                {'  '}- /path/to/xbackbone/storage:/xbackbone/storage:ro
              </code>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="db-path">Path to database.db</Label>
              <Input
                id="db-path"
                placeholder="/xbackbone/database.db"
                value={dbPath}
                onChange={(e) => setDbPath(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="storage-path">Path to storage directory</Label>
              <Input
                id="storage-path"
                placeholder="/xbackbone/storage"
                value={storagePath}
                onChange={(e) => setStoragePath(e.target.value)}
              />
            </div>
            <Button onClick={handlePreview} disabled={!dbPath.trim() || previewing}>
              {previewing ? (
                <><span className="animate-spin mr-2">⟳</span>Analysing…</>
              ) : (
                <><FontAwesomeIcon icon={faMagnifyingGlass} className="h-4 w-4 mr-2" />Analyse database</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2 ── */}
      {step === 2 && preview && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">User mapping</CardTitle>
              <CardDescription>
                Users auto-matched by username are pre-filled. Adjust as needed.
                Files from unmatched XBackBone users are assigned to the fallback user (if set).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>XBackBone user</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead>Matched local user</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.users.map((xu) => (
                    <TableRow key={xu.xbbId}>
                      <TableCell>
                        <div className="font-medium">{xu.xbbUsername || <span className="text-muted-foreground italic">(no username)</span>}</div>
                        {xu.xbbEmail && <div className="text-xs text-muted-foreground">{xu.xbbEmail}</div>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{xu.fileCount}</TableCell>
                      <TableCell>
                        {xu.matchedLocalUser
                          ? <Badge variant="secondary">{xu.matchedLocalUser}</Badge>
                          : <span className="text-xs text-muted-foreground">— uses fallback —</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

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
                <Button onClick={handleImport} disabled={importing}>
                  {importing ? (
                    <><span className="animate-spin mr-2">⟳</span>Importing…</>
                  ) : (
                    <><FontAwesomeIcon icon={faUpload} className="h-4 w-4 mr-2" />Run import</>
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
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5 text-green-600" />
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
                  <FontAwesomeIcon icon={faForwardStep} className="h-5 w-5 text-muted-foreground" />
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
                  <FontAwesomeIcon icon={faCircleExclamation} className="h-5 w-5 text-destructive" />
                  <div>
                    <div className="text-2xl font-bold">{result.errors}</div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

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
