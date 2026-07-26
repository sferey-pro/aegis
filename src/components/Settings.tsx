import React, { useState, useEffect } from 'react';
import { Save, Settings as SettingsIcon, Key, RefreshCw } from 'lucide-react';

export function Settings() {
  const [settings, setSettings] = useState({
    GITHUB_TOKEN: '',
    AUDIT_MAX_AGE_HOURS: '24',
    CRITICAL_ONLY: 'false'
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettings({
          GITHUB_TOKEN: data.GITHUB_TOKEN || '',
          AUDIT_MAX_AGE_HOURS: data.AUDIT_MAX_AGE_HOURS || '24',
          CRITICAL_ONLY: data.CRITICAL_ONLY || 'false'
        });
        setLoading(false);
      });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
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

          </div>

          <div className="flex justify-end items-center gap-4">
            {saved && <span className="text-sm text-green-500 font-medium animate-in fade-in slide-in-from-right-4">Paramètres sauvegardés avec succès !</span>}
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
    </div>
  );
}
