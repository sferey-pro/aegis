import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Folder, RefreshCw } from 'lucide-react';

export function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    audit_path: '',
    type: 'node',
    tool: 'npm'
  });

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
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      setIsAdding(false);
      setFormData({ name: '', path: '', audit_path: '', type: 'node', tool: 'npm' });
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

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-heading">Projets</h2>
          <p className="text-muted-foreground mt-1">Gérez les dépôts surveillés par Aegis.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          <Plus className="w-4 h-4" />
          Ajouter un Projet
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 rounded-2xl mb-8 flex flex-col gap-4 border-primary/30 animate-in slide-in-from-top-4">
          <h3 className="text-xl font-bold mb-2 text-primary">Nouveau Projet</h3>
          
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
              Créer le projet
            </button>
          </div>
        </form>
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
          {projects.map(p => (
            <div key={p.id} className={`glass-panel p-5 rounded-xl flex flex-col gap-3 transition-opacity ${p.ignored ? 'opacity-50 grayscale' : ''}`}>
              
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

              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                <button 
                  onClick={() => toggleIgnore(p)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {p.ignored ? 'Activer' : 'Ignorer'}
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
          ))}
        </div>
      )}
    </div>
  );
}
