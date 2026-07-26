import React, { useState, useEffect } from 'react';
import { Tag, Plus, Trash2, RefreshCw } from 'lucide-react';

export function TagsManager() {
  const [tags, setTags] = useState<{id: number, name: string, color: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('indigo');
  const [error, setError] = useState('');

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      setTags(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTags();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), color: newColor })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      setNewName('');
      fetchTags();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      fetchTags();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="glass-panel p-8 rounded-2xl animate-in slide-in-from-bottom-6 duration-700 delay-100 mt-8">
      <div className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
          <Tag className="w-6 h-6 text-indigo-500" />
        </div>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-heading">Tags de Projets</h2>
          <p className="text-muted-foreground mt-1">Gérez les étiquettes prédéfinies que vous pouvez associer aux projets pour les classer (ex: Prod, Backend).</p>
        </div>
      </div>

      <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-6 bg-black/20 p-4 rounded-xl border border-border/50">
        <div className="flex flex-col flex-1 w-full gap-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Nom du tag</label>
          <input 
            type="text" 
            value={newName}
            onChange={e => setNewName(e.target.value)}
            className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
            placeholder="Ex: API"
            required
          />
        </div>
        <div className="flex flex-col w-full sm:w-auto gap-1">
          <label className="text-xs font-semibold uppercase text-muted-foreground">Couleur</label>
          <select 
            value={newColor}
            onChange={e => setNewColor(e.target.value)}
            className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors min-w-[120px]"
          >
            <option value="indigo">Indigo</option>
            <option value="red">Rouge</option>
            <option value="green">Vert</option>
            <option value="blue">Bleu</option>
            <option value="yellow">Jaune</option>
            <option value="purple">Violet</option>
            <option value="pink">Rose</option>
          </select>
        </div>
        <button type="submit" className="mt-5 flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4" /> Ajouter
        </button>
      </form>
      
      {error && <p className="text-red-400 text-sm mb-4 bg-red-400/10 p-3 rounded-lg border border-red-400/20">{error}</p>}

      {loading ? (
        <div className="flex justify-center p-8"><RefreshCw className="w-6 h-6 text-primary animate-spin" /></div>
      ) : tags.length === 0 ? (
        <p className="text-center text-muted-foreground p-8 bg-black/10 rounded-xl border border-border/50">Aucun tag configuré.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {tags.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary text-secondary-foreground border border-border text-sm font-semibold">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: `var(--color-${t.color}-500, var(--primary))` }}></span>
              {t.name}
              <button type="button" onClick={() => handleDelete(t.id)} className="ml-1 text-muted-foreground hover:text-red-400 transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
