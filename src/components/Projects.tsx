import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Folder, RefreshCw, GitBranch, CloudDownload, ArrowDownToLine, AlertTriangle } from 'lucide-react';

export function Projects({ onViewTriage }: { onViewTriage?: (id: number) => void }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [availableTags, setAvailableTags] = useState<any[]>([]);
  const [filterTag, setFilterTag] = useState<string | null>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    audit_path: '',
    type: 'node',
    tool: 'npm',
    tags: [] as string[]
  });

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      setAvailableTags(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      setProjects(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    fetchTags();
  }, []);

  const resetForm = () => {
    setIsAdding(false);
    setEditingId(null);
    setFormData({ name: '', path: '', audit_path: '', type: 'node', tool: 'npm', tags: [] });
  };

  const handleEdit = (p: any) => {
    setFormData({
      name: p.name,
      path: p.path,
      audit_path: p.audit_path || '',
      type: p.type,
      tool: p.tool,
      tags: p.tags || []
    });
    setEditingId(p.id);
    setIsAdding(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...formData };
      
      if (editingId) {
        await fetch(`/api/projects/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      
      resetForm();
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce projet ?')) return;
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const toggleIgnore = async (project: any) => {
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ignored: !project.ignored })
      });
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFetch = async (id: number) => {
    try {
      await fetch(`/api/projects/${id}/git-fetch`, { method: 'POST' });
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePull = async (id: number) => {
    try {
      await fetch(`/api/projects/${id}/git-pull`, { method: 'POST' });
      fetchProjects();
    } catch (err) {
      console.error(err);
    }
  };

  const [isFetchingAll, setIsFetchingAll] = useState(false);

  const handleFetchAll = async () => {
    setIsFetchingAll(true);
    try {
      const activeProjects = projects.filter(p => !p.ignored && p.git?.isRepo);
      for (const p of activeProjects) {
        await fetch(`/api/projects/${p.id}/git-fetch`, { method: 'POST' });
      }
      await fetchProjects();
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetchingAll(false);
    }
  };

  const handleDetectTool = async () => {
    if (!formData.path) return;
    try {
      const res = await fetch('/api/projects/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: formData.path, audit_path: formData.audit_path })
      });
      const data = await res.json();
      if (data.tool) {
        setFormData(prev => ({ 
          ...prev, 
          tool: data.tool, 
          type: data.tool === 'composer' ? 'composer' : 'node' 
        }));
      }
    } catch (err) {
      console.error("Auto-detect failed", err);
    }
  };

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-heading">Projets</h2>
          <p className="text-muted-foreground mt-1">Gérez les dépôts surveillés par Aegis.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={handleFetchAll}
            disabled={isFetchingAll || projects.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            {isFetchingAll ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            Vérifier les mises à jour Git
          </button>
          <button 
            onClick={() => { if(isAdding) resetForm(); else setIsAdding(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <Plus className="w-4 h-4" />
            {isAdding ? "Annuler" : "Ajouter un Projet"}
          </button>
        </div>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-2xl mb-8 flex flex-col gap-4 border-primary/30 animate-in slide-in-from-top-4">
          <h3 className="text-xl font-bold mb-2 text-primary">{editingId ? "Modifier le Projet" : "Nouveau Projet"}</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Nom du projet</label>
              <input 
                required
                type="text" 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
                placeholder="Ex: Mon API Node"
              />
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Chemin absolu (Racine Git)</label>
              <input 
                required
                type="text" 
                value={formData.path}
                onChange={e => setFormData({...formData, path: e.target.value})}
                onBlur={handleDetectTool}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
                placeholder="Ex: /home/user/projects/api"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Sous-dossier d'audit (Optionnel)</label>
              <input 
                type="text" 
                value={formData.audit_path}
                onChange={e => setFormData({...formData, audit_path: e.target.value})}
                onBlur={handleDetectTool}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
                placeholder="Ex: backend/src (vide si racine)"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium">Outil d'audit</label>
              <select 
                value={formData.tool}
                onChange={e => setFormData({...formData, tool: e.target.value, type: e.target.value === 'composer' ? 'composer' : 'node'})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
              >
                <option value="npm">NPM</option>
                <option value="yarn">Yarn</option>
                <option value="bun">Bun</option>
                <option value="composer">Composer</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-sm font-medium">Tags (Configurations)</label>
              <div className="flex flex-wrap gap-2">
                {availableTags.map(t => {
                  const isSelected = formData.tags.includes(t.name);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setFormData({...formData, tags: formData.tags.filter(tag => tag !== t.name)});
                        } else {
                          setFormData({...formData, tags: [...formData.tags, t.name]});
                        }
                      }}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                        isSelected 
                          ? 'border-primary bg-primary/20 text-primary' 
                          : 'border-border bg-background hover:bg-secondary text-muted-foreground'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full inline-block mr-2" style={{ backgroundColor: `var(--color-${t.color}-500, var(--primary))` }}></span>
                      {t.name}
                    </button>
                  );
                })}
                {availableTags.length === 0 && <span className="text-xs text-muted-foreground italic">Aucun tag configuré dans les Paramètres.</span>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-4">
            <button 
              type="button" 
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Annuler
            </button>
            <button 
              type="submit"
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {editingId ? "Enregistrer" : "Créer le projet"}
            </button>
          </div>
        </form>
      )}

      {availableTags.length > 0 && projects.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6 animate-in fade-in">
          <span className="text-sm font-semibold text-muted-foreground mr-2 self-center">Filtre :</span>
          <button 
            onClick={() => setFilterTag(null)}
            className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border transition-all ${filterTag === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background text-muted-foreground border-border hover:bg-secondary'}`}
          >
            Tous
          </button>
          {availableTags.map(t => (
            <button 
              key={t.id}
              onClick={() => setFilterTag(t.name)}
              className={`px-3 py-1 text-xs font-bold uppercase tracking-wider rounded-full border transition-all flex items-center gap-1.5 ${filterTag === t.name ? 'bg-primary/20 text-primary border-primary' : 'bg-background text-muted-foreground border-border hover:bg-secondary'}`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: `var(--color-${t.color}-500, var(--primary))` }}></span>
              {t.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
          <Folder className="w-12 h-12 text-muted-foreground opacity-50" />
          <div>
            <h3 className="text-xl font-bold">Aucun projet</h3>
            <p className="text-muted-foreground">Ajoutez votre premier projet pour commencer l'audit.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {(filterTag ? projects.filter(p => p.tags && p.tags.includes(filterTag)) : projects).map(p => {
            const hasCritical = p.lastRun?.counts?.critical > 0;
            return (
            <div 
              key={p.id} 
              className={`glass-panel p-5 rounded-xl flex flex-col gap-3 transition-all duration-300 ${
                p.ignored ? 'opacity-50 grayscale' : 
                hasCritical ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-red-500/5 cursor-pointer hover:-translate-y-1' :
                'hover:-translate-y-1 hover:border-primary/40 hover:shadow-xl hover:shadow-primary/5 cursor-pointer'
              }`}
              onClick={(e) => {
                // Prevent routing if clicking on a button inside the card
                if ((e.target as HTMLElement).closest('button')) return;
                if (onViewTriage) onViewTriage(p.id);
              }}
            >
              
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Shield className={`w-5 h-5 ${p.ignored ? 'text-muted-foreground' : 'text-primary'}`} />
                  <h3 className="font-bold text-lg leading-tight truncate max-w-[200px]" title={p.name}>{p.name}</h3>
                </div>
                
                <span className="text-xs font-semibold px-2 py-1 rounded bg-secondary text-secondary-foreground border border-border uppercase">
                  {p.tool}
                </span>
              </div>
              
              <div className="text-sm text-muted-foreground mt-2 truncate" title={p.path}>
                <span className="font-mono text-xs">{p.path}</span>
                {p.audit_path && <span className="font-mono text-xs text-primary ml-1">/{p.audit_path}</span>}
              </div>

              {p.tags && p.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.tags.map((tag: string, i: number) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-wider border border-primary/20">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {p.git?.isRepo && (
                <div className="flex items-center justify-between mt-2 p-2 bg-black/20 rounded-lg border border-border/50 text-xs">
                  <div className="flex items-center gap-2">
                    <GitBranch className="w-3.5 h-3.5 text-orange-400" />
                    <span className="font-mono truncate max-w-[80px]" title={p.git.branch || 'detached'}>
                      {p.git.branch || 'detached'}
                    </span>
                    {p.git.behind > 0 && (
                      <span className="text-red-400 font-bold flex items-center gap-0.5 ml-1" title={`${p.git.behind} commits de retard sur l'upstream`}>
                        <ArrowDownToLine className="w-3 h-3" /> {p.git.behind}
                      </span>
                    )}
                    {p.git.dirty && <AlertTriangle className="w-3 h-3 text-yellow-500 ml-1" title="Arbre de travail sale (modifications non commitées)" />}
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => handleFetch(p.id)}
                      className="p-1.5 rounded hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
                      title="Git Fetch"
                    >
                      <CloudDownload className="w-3.5 h-3.5" />
                    </button>
                    {p.git.behind > 0 && (
                      <button 
                        onClick={() => handlePull(p.id)}
                        className="p-1.5 rounded bg-blue-500/20 text-blue-400 hover:bg-blue-500/40 transition-colors font-bold flex items-center gap-1"
                        title="Git Pull (Fast-Forward uniquement)"
                      >
                        Pull
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                <button 
                  onClick={() => toggleIgnore(p)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p.ignored ? 'Activer' : 'Ignorer'}
                </button>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => handleEdit(p)}
                    className="p-2 text-muted-foreground hover:text-primary transition-colors rounded-md hover:bg-primary/10"
                    title="Modifier"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                  </button>
                  <button 
                    onClick={() => handleDelete(p.id)}
                    className="p-2 text-muted-foreground hover:text-destructive transition-colors rounded-md hover:bg-destructive/10"
                    title="Supprimer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
