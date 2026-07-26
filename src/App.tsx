import React, { useEffect, useState } from 'react';
import { Shield, Activity, Database, GitBranch, ArrowRight, Loader2 } from 'lucide-react';
import { Projects } from './components/Projects';
import { Settings } from './components/Settings';
import { Triage } from './components/Triage';
import { Console } from './components/Console';
import { HistoryChart } from './components/HistoryChart';
import { Reports } from './components/Reports';

interface Stats {
  monitoredProjects: number;
  criticalVulnerabilities: number;
  lastSync: string | null;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<'overview' | 'projects' | 'triage' | 'reports' | 'settings'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [triageProjectId, setTriageProjectId] = useState<number | null>(null);
  const [reportModal, setReportModal] = useState<any | null>(null);

  useEffect(() => {
    fetchStats(true);
  }, []);

  const fetchStats = async (initial = false) => {
    try {
      let res;
      if (initial) {
        // Au démarrage, on force un temps d'attente d'au moins 2s pour que l'animation soit fluide
        [res] = await Promise.all([
          fetch('/api/stats'),
          new Promise(resolve => setTimeout(resolve, 2000))
        ]);
      } else {
        res = await fetch('/api/stats');
      }
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
    setAuditProgress(null);
    try {
      const res = await fetch('/api/projects');
      const allProjects = await res.json();
      const projectsToAudit = allProjects.filter((p: any) => !p.ignored);
      
      let current = 1;
      const total = projectsToAudit.length;
      let totalVulns = 0;
      let counts = { critical: 0, high: 0, moderate: 0, low: 0, info: 0, unknown: 0 };

      for (const p of projectsToAudit) {
        setAuditProgress({ current, total, name: p.name });
        const auditRes = await fetch(`/api/projects/${p.id}/audit`, { method: 'POST' });
        const auditData = await auditRes.json();
        
        if (auditData.run && auditData.run.counts) {
           totalVulns += auditData.run.total || 0;
           counts.critical += auditData.run.counts.critical || 0;
           counts.high += auditData.run.counts.high || 0;
           counts.moderate += auditData.run.counts.moderate || 0;
           counts.low += auditData.run.counts.low || 0;
           counts.info += auditData.run.counts.info || 0;
           counts.unknown += auditData.run.counts.unknown || 0;
        }
        
        current++;
      }
      
      const reportRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           projects_audited: projectsToAudit.length,
           total_vulnerabilities: totalVulns,
           counts: counts
        })
      });
      const generatedReport = await reportRes.json();
      setReportModal(generatedReport);
      
      await fetchStats(); // Refresh stats after audit
    } catch (err) {
      console.error(err);
    } finally {
      setAuditing(false);
      setAuditProgress(null);
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
    <>
      {(loading || auditing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center flex-col gap-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
          {/* Background glow for loader */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
          
          <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 neon-glow shadow-2xl z-10">
            <div className="absolute inset-0 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin"></div>
            <Shield className="w-10 h-10 text-primary" />
          </div>
          
          <div className="z-10 flex flex-col items-center gap-2">
            <h1 className="text-3xl font-bold font-heading text-gradient">AEGIS</h1>
            <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              {loading ? "Initialisation du bouclier..." : (
                auditProgress 
                  ? `Analyse du projet ${auditProgress.name} .... ${auditProgress.current}/${auditProgress.total}`
                  : "Démarrage de l'audit global..."
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`flex flex-col min-h-screen overflow-hidden relative transition-opacity duration-300 ${(loading || auditing) ? 'opacity-50 pointer-events-none blur-sm' : 'opacity-100'}`}>
        
        {/* Navigation */}
      <header className="sticky top-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/50 shadow-sm flex items-center justify-between py-4 px-6 md:px-12 w-full mx-auto">
        <div className="flex items-center gap-2 select-none w-full max-w-6xl mx-auto justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentTab('overview')}>
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 neon-glow">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl font-bold font-heading">Aegis</h1>
          </div>
        
        <nav className="flex items-center gap-1">
          <button 
            onClick={() => setCurrentTab('overview')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentTab === 'overview' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            Vue d'ensemble
          </button>
          <button 
            onClick={() => setCurrentTab('projects')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentTab === 'projects' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            Projets
          </button>
          <button 
            onClick={() => { setTriageProjectId(null); setCurrentTab('triage'); }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentTab === 'triage' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            CVEs
          </button>
          <button 
            onClick={() => setCurrentTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentTab === 'reports' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            Rapports
          </button>
          <button onClick={() => setCurrentTab('settings')} className={`${currentTab === 'settings' ? 'text-foreground font-semibold' : 'hover:text-foreground'} transition-colors whitespace-nowrap ml-4`}>Paramètres</button>
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
        <main className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 flex flex-col gap-8 animate-in fade-in duration-500">
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100 relative z-10">
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

            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 relative z-10">
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

            <div className="glass-panel p-6 rounded-2xl flex flex-col justify-between animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Database className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Base de Données</p>
                  <h3 className="text-xl font-bold text-primary">
                    {loading ? <span className="opacity-50">...</span> : (stats?.lastSync ? 'À jour' : 'En attente')}
                  </h3>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-border/50">
                <p className="text-sm text-muted-foreground">Dernier scan</p>
                <p className="text-sm font-medium tabular-nums">{loading ? '--' : syncDisplay}</p>
              </div>
            </div>

            {/* Décoration d'arrière-plan */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-full bg-primary/10 blur-[120px] rounded-full z-0 pointer-events-none"></div>
          </div>

          <HistoryChart />

        </main>
      )}

      {currentTab === 'projects' && <Projects onViewTriage={(id) => { setTriageProjectId(id); setCurrentTab('triage'); }} />}
      {currentTab === 'triage' && <Triage projectId={triageProjectId} onClearProject={() => setTriageProjectId(null)} />}
      {currentTab === 'reports' && <Reports />}
      {currentTab === 'settings' && <Settings />}

      {/* Report Modal */}
      {reportModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-xl rounded-2xl p-8 flex flex-col gap-6 animate-in zoom-in-95 duration-300 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[80px] rounded-full pointer-events-none"></div>
            
            <div className="text-center">
              <div className="w-16 h-16 bg-primary/20 text-primary rounded-2xl flex items-center justify-center mx-auto mb-4 border border-primary/30">
                <Shield className="w-8 h-8" />
              </div>
              <h3 className="text-2xl font-bold font-heading">Audit Terminé !</h3>
              <p className="text-muted-foreground mt-2">Voici le résumé de l'analyse globale.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-background/50 border border-border/50 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-white">{reportModal.projects_audited}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">Projets</span>
              </div>
              <div className="bg-background/50 border border-border/50 p-4 rounded-xl flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-bold text-red-400">{reportModal.total_vulnerabilities}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">Vulnérabilités</span>
              </div>
            </div>
            
            <button 
              onClick={() => {
                setReportModal(null);
                setCurrentTab('reports');
              }}
              className="mt-2 w-full py-3 bg-primary text-primary-foreground font-bold rounded-xl hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              Voir tous les rapports
            </button>
          </div>
        </div>
      )}

      <Console />
    </div>
    </>
  );
}
