import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Setup({ onComplete }) {
  const { t } = useTranslation();
  const [mongoUri, setMongoUri] = useState('mongodb://localhost:27017/sharely');
  const [port, setPort] = useState('3579');
  const [baseUrl, setBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mongoUri,
          port,
          baseUrl: baseUrl || `http://localhost:${port}`,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Setup failed');
      }
      onComplete();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold">Sharely</h1>
          <p className="text-muted-foreground">First-time setup — configure your server connection.</p>
        </div>

        <form onSubmit={handleSave} className="space-y-4 bg-card rounded-lg border p-6">
          <div className="space-y-2">
            <Label htmlFor="mongoUri">MongoDB URI</Label>
            <Input
              id="mongoUri"
              value={mongoUri}
              onChange={e => setMongoUri(e.target.value)}
              placeholder="mongodb://localhost:27017/sharely"
              required
            />
            <p className="text-xs text-muted-foreground">
              Local: <code>mongodb://localhost:27017/sharely</code> or a MongoDB Atlas URI.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="port">Server Port</Label>
            <Input
              id="port"
              type="number"
              min="1024"
              max="65535"
              value={port}
              onChange={e => setPort(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="baseUrl">Public Base URL <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              id="baseUrl"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              placeholder={`http://localhost:${port}`}
            />
            <p className="text-xs text-muted-foreground">
              Used in shareable file URLs. Leave blank to use localhost.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? 'Saving…' : 'Save & Start'}
          </Button>
        </form>
      </div>
    </div>
  );
}
