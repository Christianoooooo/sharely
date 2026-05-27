import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFolder, faPlus, faCheck, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { fmtDate } from '@/lib/utils';

export function AddToCollectionDialog({ shortId, children }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(null);
  const [added, setAdded] = useState(new Set());
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setAdded(new Set());
    fetch('/api/collections')
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => setCollections(d.collections))
      .catch(() => setCollections([]))
      .finally(() => setLoading(false));
  }, [open]);

  async function addToCollection(collShortId) {
    setAdding(collShortId);
    try {
      const r = await fetch(`/api/collections/${collShortId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortId }),
      });
      if (r.ok) {
        setAdded((prev) => new Set([...prev, collShortId]));
        toast({ title: t('addToCollection.added') });
      } else {
        toast({ title: t('addToCollection.failed'), variant: 'destructive' });
      }
    } finally {
      setAdding(null);
    }
  }

  async function createAndAdd(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!r.ok) {
        toast({ title: t('collections.createFailed'), variant: 'destructive' });
        return;
      }
      const coll = await r.json();
      setCollections((prev) => [coll, ...prev]);
      setNewName('');
      await addToCollection(coll.shortId);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-sm max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFolder} className="h-4 w-4" />
            {t('addToCollection.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {/* Quick create */}
          <form onSubmit={createAndAdd} className="flex gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('addToCollection.newPlaceholder')}
              className="flex-1"
            />
            <Button type="submit" size="sm" disabled={creating || !newName.trim()} className="gap-1">
              {creating
                ? <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                : <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />}
            </Button>
          </form>

          {loading && (
            <p className="text-sm text-muted-foreground animate-pulse">{t('addToCollection.loading')}</p>
          )}

          {!loading && collections.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">{t('addToCollection.noCollections')}</p>
          )}

          {!loading && collections.map((coll) => {
            const isAdded = added.has(coll.shortId);
            const isAdding = adding === coll.shortId;
            return (
              <div key={coll.shortId} className="flex items-center justify-between gap-2 p-2 rounded border hover:bg-muted/40 transition-colors">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{coll.name}</p>
                  <p className="text-xs text-muted-foreground">{t('collections.fileCount', { count: coll.fileCount })}</p>
                </div>
                <Button
                  size="sm"
                  variant={isAdded ? 'secondary' : 'outline'}
                  onClick={() => !isAdded && addToCollection(coll.shortId)}
                  disabled={isAdding || isAdded}
                  className="gap-1.5 shrink-0"
                >
                  {isAdding
                    ? <FontAwesomeIcon icon={faCircleNotch} className="h-3.5 w-3.5 animate-spin" />
                    : isAdded
                      ? <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                      : <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />}
                  {isAdded ? t('addToCollection.done') : t('addToCollection.add')}
                </Button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
