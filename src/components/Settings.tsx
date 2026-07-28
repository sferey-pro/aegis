import React, { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Key, RefreshCw, CheckCircle2, Database, Download, AlertTriangle } from 'lucide-react';
import { TagsManager } from './TagsManager';

export function Settings() {
  const [settings, setSettings] = useState({
    GITHUB_TOKEN: '',
    AUDIT_MAX_AGE_HOURS: '24',
    CRITICAL_ONLY: 'false',
    JIRA_BASE_URL: 'https://mon-entreprise.atlassian.net/browse/',
    JIRA_API_KEY: '',
    GITHUB_RL_LIMIT: '',
    GITHUB_RL_REMAINING: '',
    GITHUB_RL_RESET: '',
    DISABLE_CONSOLE: 'false'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Backup states
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupMessage, setBackupMessage] = useState<{text: string, type: 'success'|'error'} | null>(null);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings({
          GITHUB_TOKEN: data.GITHUB_TOKEN || '',
          AUDIT_MAX_AGE_HOURS: data.AUDIT_MAX_AGE_HOURS || '24',
          CRITICAL_ONLY: data.CRITICAL_ONLY || 'false',
          JIRA_BASE_URL: data.JIRA_BASE_URL || 'https://mon-entreprise.atlassian.net/browse/',
          JIRA_API_KEY: data.JIRA_API_KEY || '',
          GITHUB_RL_LIMIT: data.GITHUB_RL_LIMIT || '',
          GITHUB_RL_REMAINING: data.GITHUB_RL_REMAINING || '',
          GITHUB_RL_RESET: data.GITHUB_RL_RESET || '',
          DISABLE_CONSOLE: data.DISABLE_CONSOLE || 'false'
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSnapshot = async (action: 'create' | 'restore') => {
    setBackupLoading(true);
    setBackupMessage(null);
    try {
      const res = await fetch(`/api/snapshots/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setBackupMessage({ text: action === 'create' ? `Snapshot créé (${data.path})` : data.message, type: 'success' });
    } catch (err: any) {
      setBackupMessage({ text: err.message, type: 'error' });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleExportJSON = async () => {
    window.open('/api/config/export', '_blank');
  };

  return (
    <div className="flex-1 w-full max-w-4xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
          <SettingsIcon className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-3xl font-bold font-heading">Paramètres</h2>
          <p className="text-muted-foreground mt-1">Configurez le comportement du moteur d'audit Aegis.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          <div className="glass-panel p-6 rounded-2xl flex flex-col gap-6">
            
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5" />
                <label className="text-lg font-bold">Jeton GitHub (API)</label>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Nécessaire pour interroger la base <i>GitHub Advisory</i> (contournement des limites de taux)
                et enrichir les CVEs avec les scores CVSS réels.
              </p>
              <input 
                type="password" 
                value={settings.GITHUB_TOKEN}
                onChange={e => setSettings({...settings, GITHUB_TOKEN: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors font-mono"
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
              {settings.GITHUB_RL_LIMIT && (
                <div className="mt-2 text-xs flex gap-4 text-muted-foreground bg-black/20 p-2.5 rounded-lg border border-white/5 w-fit">
                  <span>
                    Quota API GitHub : <strong className={Number(settings.GITHUB_RL_REMAINING) === 0 ? "text-red-400" : "text-green-400"}>
                      {settings.GITHUB_RL_REMAINING} / {settings.GITHUB_RL_LIMIT}
                    </strong>
                  </span>
                  {settings.GITHUB_RL_RESET && (
                    <span>Reset : {new Date(Number(settings.GITHUB_RL_RESET) * 1000).toLocaleString('fr-FR')}</span>
                  )}
                </div>
              )}
            </div>

            <hr className="border-border" />

            <div className="flex flex-col gap-2">
              <label className="text-lg font-bold">Cache d'Audit (Heures)</label>
              <p className="text-sm text-muted-foreground mb-2">
                Durée pendant laquelle un projet dont l'état Git n'a pas changé ne sera pas ré-audité inutilement.
              </p>
              <input 
                type="number" 
                value={settings.AUDIT_MAX_AGE_HOURS}
                onChange={e => setSettings({...settings, AUDIT_MAX_AGE_HOURS: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors w-32"
                min="0"
                step="1"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lg font-bold">Options Globales</label>
              
              <label className="flex items-center gap-3 cursor-pointer mt-2 group">
                <input 
                  type="checkbox" 
                  checked={settings.CRITICAL_ONLY === 'true'}
                  onChange={e => setSettings({...settings, CRITICAL_ONLY: e.target.checked ? 'true' : 'false'})}
                  className="w-5 h-5 rounded border-border bg-black/40 text-primary focus:ring-primary focus:ring-offset-background"
                />
                <span className="text-sm font-medium group-hover:text-white transition-colors">
                  Mode Silencieux (N'afficher que les CVEs Critical/High)
                </span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer mt-2 group">
                <input 
                  type="checkbox" 
                  checked={settings.DISABLE_CONSOLE === 'true'}
                  onChange={e => setSettings({...settings, DISABLE_CONSOLE: e.target.checked ? 'true' : 'false'})}
                  className="w-5 h-5 rounded border-border bg-black/40 text-primary focus:ring-primary focus:ring-offset-background"
                />
                <span className="text-sm font-medium group-hover:text-white transition-colors">
                  Désactiver la Console (Coupe le broadcast SSE et allège les performances frontend)
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-lg font-bold">Base URL Jira</label>
              <p className="text-sm text-muted-foreground mb-2">
                Utilisée pour construire les liens cliquables des tickets dans l'onglet CVEs.
              </p>
              <input 
                type="text" 
                value={settings.JIRA_BASE_URL}
                onChange={e => setSettings({...settings, JIRA_BASE_URL: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors"
                placeholder="https://votre-entreprise.atlassian.net/browse/"
              />
            </div>

            <div className="flex flex-col gap-2 relative opacity-70">
              <div className="flex items-center gap-3">
                <label className="text-lg font-bold">Clé d'API Jira</label>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  En chantier
                </span>
              </div>
              <p className="text-sm text-muted-foreground mb-2">
                Clé d'API pour la création automatique des tickets Jira depuis le module de triage. (Non fonctionnel pour le moment)
              </p>
              <input 
                type="password" 
                value={settings.JIRA_API_KEY}
                onChange={e => setSettings({...settings, JIRA_API_KEY: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-primary transition-colors font-mono cursor-not-allowed"
                placeholder="ATATT3xFfGF0..."
                disabled
              />
            </div>

          </div>

          <div className="flex justify-end items-center gap-4">
            {saveSuccess && <span className="text-sm text-green-500 font-medium animate-in fade-in slide-in-from-right-4">Paramètres sauvegardés avec succès !</span>}
            <button 
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Enregistrer
            </button>
          </div>
        </form>
      )}

      <TagsManager />

      <div className="glass-panel p-8 rounded-2xl animate-in slide-in-from-bottom-6 duration-700 delay-300 mt-8">
        <h3 className="text-xl font-bold font-heading mb-6 flex items-center gap-2">
          <Database className="w-5 h-5 text-primary" />
          Sauvegarde & Restauration
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="flex flex-col gap-4">
            <h4 className="font-semibold text-lg">Snapshots SQLite (Recommandé)</h4>
            <p className="text-sm text-muted-foreground">
              Crée une copie parfaite (VACUUM INTO) de la base de données. Pratique avant une migration.
            </p>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={() => handleSnapshot('create')}
                disabled={backupLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Créer Snapshot
              </button>
              <button 
                onClick={() => handleSnapshot('restore')}
                disabled={backupLoading}
                className="flex items-center gap-2 px-4 py-2 rounded-md border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <AlertTriangle className="w-4 h-4" /> Restaurer
              </button>
            </div>
          </div>
          
          <div className="flex flex-col gap-4">
            <h4 className="font-semibold text-lg">Export JSON</h4>
            <p className="text-sm text-muted-foreground">
              Exporte vos projets, annotations et réglages au format JSON lisible.
            </p>
            <div className="flex gap-3 mt-2">
              <button 
                onClick={handleExportJSON}
                className="flex items-center gap-2 px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                <Download className="w-4 h-4" /> Exporter JSON
              </button>
            </div>
          </div>
        </div>
        
        {backupMessage && (
          <div className={`mt-6 p-4 rounded-lg border ${backupMessage.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-green-500/10 border-green-500/20 text-green-400'} flex items-center gap-2`}>
            {backupMessage.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
            {backupMessage.text}
          </div>
        )}
      </div>
    </div>
  );
}
