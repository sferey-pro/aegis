import React, { useEffect, useState } from 'react';
import { Shield, Activity, Database, GitBranch, ArrowRight, Loader2 } from 'lucide-react';
import { Projects } from './components/Projects';

import { Settings } from './components/Settings';

interface Stats {
  monitoredProjects: number;
  criticalVulnerabilities: number;
  lastSync: string | null;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<'overview' | 'projects' | 'triage' | 'settings'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAudit = async () => {
    setAuditing(true);
    try {
      await fetch('/api/audit/run', { method: 'POST' });
      await fetchStats(); // Refresh stats after audit
    } catch (err) {
      console.error(err);
    } finally {
      setAuditing(false);
    }
  };
  
  // Formatage de l'heure
  let syncDisplay = 'Aucune synchronisation';
  if (stats?.lastSync) {
    const d = new Date(stats.lastSync + "Z");
    syncDisplay = d.toLocaleString('fr-FR', { 
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  }

  return (
    <div className="flex flex-col min-h-screen p-6 md:p-12 overflow-hidden relative">
      
      {/* Navigation */}
      <header className="flex items-center justify-between py-4 w-full max-w-6xl mx-auto z-10">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setCurrentTab('overview')}>
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 neon-glow">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Aegis</h1>
        </div>
        
        <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
          <button onClick={() => setCurrentTab('overview')} className={`${currentTab === 'overview' ? 'text-foreground font-semibold' : 'hover:text-foreground'} transition-colors`}>Aperçu</button>
          <button onClick={() => setCurrentTab('projects')} className={`${currentTab === 'projects' ? 'text-foreground font-semibold' : 'hover:text-foreground'} transition-colors`}>Projets</button>
          <button onClick={() => setCurrentTab('triage')} className={`${currentTab === 'triage' ? 'text-foreground font-semibold' : 'hover:text-foreground'} transition-colors`}>Triage CVE</button>
          <button onClick={() => setCurrentTab('settings')} className={`${currentTab === 'settings' ? 'text-foreground font-semibold' : 'hover:text-foreground'} transition-colors`}>Paramètres</button>
        </nav>
        
        <button 
          onClick={handleRunAudit}
          disabled={auditing}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20 disabled:opacity-50 disabled:pointer-events-none"
        >
          {auditing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {auditing ? 'Audit en cours...' : 'Lancer l\'audit global'}
        </button>
      </header>

      {/* Contenu Principal (Routing basique) */}
      {currentTab === 'overview' && (
        <main className="flex-1 w-full max-w-6xl mx-auto mt-16 z-10 flex flex-col lg:flex-row gap-12 items-center animate-in fade-in duration-500">
          
          {/* Colonne Gauche : Textes */}
          <div className="flex-1 space-y-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary border border-border text-xs font-medium text-muted-foreground animate-in slide-in-from-bottom-2 duration-500">
              <span className="flex w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              Système En Ligne & Actif
            </div>
            
            <h2 className="text-5xl md:text-6xl font-bold leading-[1.1]">
              Audit de Sécurité <br />
              <span className="text-gradient">Continu</span>
            </h2>
            
            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              Aegis agrège les vulnérabilités de votre écosystème Node et PHP.
              Détectez, triez et appliquez vos politiques de sécurité directement depuis Git.
            </p>
            
            <div className="flex flex-wrap gap-4 pt-4">
              <button onClick={() => setCurrentTab('triage')} className="flex items-center gap-2 px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition-all group">
                Voir le Triage
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Colonne Droite : Widgets */}
          <div className="flex-1 w-full relative">
            <div className="relative z-10 grid gap-6 md:grid-cols-2">
              
              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Failles Critiques</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {loading ? <span className="opacity-50">...</span> : (stats?.criticalVulnerabilities ?? 0)}
                  </h3>
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
                <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Projets Surveillés</p>
                  <h3 className="text-3xl font-bold mt-1">
                    {loading ? <span className="opacity-50">...</span> : (stats?.monitoredProjects ?? 0)}
                  </h3>
                </div>
              </div>

              <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 md:col-span-2">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Base de Données</p>
                    <h3 className="text-xl font-bold mt-1 text-primary">
                      {loading ? <span className="opacity-50">Chargement...</span> : (stats?.lastSync ? 'À jour' : 'En attente d\'audit')}
                    </h3>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Dernier scan</p>
                    <p className="text-sm font-medium tabular-nums">{loading ? '--' : syncDisplay}</p>
                  </div>
                </div>
              </div>

            </div>
            
            {/* Décoration d'arrière-plan */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/20 blur-[100px] rounded-full z-0 pointer-events-none"></div>
          </div>
        </main>
      )}

      {currentTab === 'projects' && <Projects />}
      
      {currentTab === 'triage' && (
        <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 flex items-center justify-center animate-in fade-in">
          <div className="glass-panel p-12 text-center rounded-2xl">
            <h2 className="text-2xl font-bold">Triage CVE</h2>
            <p className="text-muted-foreground mt-2">Bientôt disponible...</p>
          </div>
        </div>
      )}

      {currentTab === 'settings' && <Settings />}
    </div>
  );
}
