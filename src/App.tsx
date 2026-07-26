import React, { useEffect, useState } from 'react';
import { Shield, Activity, Database, GitBranch, ArrowRight, Loader2, AlertOctagon, AlertTriangle } from 'lucide-react';
import { Projects } from './components/Projects';
import { Settings } from './components/Settings';
import { Triage } from './components/Triage';
import { Console } from './components/Console';
import { HistoryChart } from './components/HistoryChart';
import { Reports } from './components/Reports';
import { PromptsLibrary } from './components/PromptsLibrary';

interface Stats {
  monitoredProjects: number;
  criticalVulnerabilities: number;
  lastSync: string | null;
  healthGrade?: string;
  topProjects?: Array<{ id: number; name: string; critical: number; high: number }>;
  topCves?: Array<{ cve: string; title: string; count: number; worst: string }>;
}

export function App() {
  const [currentTab, setCurrentTab] = useState<'overview' | 'projects' | 'triage' | 'reports' | 'prompts' | 'settings'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [auditProgress, setAuditProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [triageProjectId, setTriageProjectId] = useState<number | null>(null);
  const [triageCveFilter, setTriageCveFilter] = useState<string | null>(null);
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

      <div className={`flex flex-col min-h-screen overflow-x-hidden relative transition-opacity duration-300 ${(loading || auditing) ? 'opacity-50 pointer-events-none blur-sm' : 'opacity-100'}`}>
        
        {/* Navigation */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/60 backdrop-blur-xl border-b border-border/50 shadow-sm flex items-center justify-between py-4 px-6 md:px-12 w-full">
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
            onClick={() => { setTriageProjectId(null); setTriageCveFilter(null); setCurrentTab('triage'); }}
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
          <button 
            onClick={() => setCurrentTab('prompts')}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${currentTab === 'prompts' ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            Prompts
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
        </div>
      </header>

      {/* Contenu Principal (Routing basique) */}
      <div className="pt-[88px] flex-1 flex flex-col w-full">
      {currentTab === 'overview' && (
        <main className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 flex flex-col gap-8 animate-in fade-in duration-500">
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {stats?.healthGrade && (
              <div className="glass-panel p-6 rounded-3xl flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-border/80 transition-all shadow-lg hover:shadow-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest z-10">Santé Globale</p>
                <div className={`relative z-10 w-24 h-24 mt-2 rounded-2xl flex items-center justify-center text-5xl font-black shadow-lg ${stats.healthGrade === 'A' ? 'bg-green-500/20 text-green-400 shadow-green-500/20 border border-green-500/30' : stats.healthGrade === 'B' ? 'bg-blue-500/20 text-blue-400 shadow-blue-500/20 border border-blue-500/30' : stats.healthGrade === 'C' ? 'bg-yellow-500/20 text-yellow-400 shadow-yellow-500/20 border border-yellow-500/30' : stats.healthGrade === 'D' ? 'bg-orange-500/20 text-orange-400 shadow-orange-500/20 border border-orange-500/30' : 'bg-red-500/20 text-red-500 shadow-red-500/20 border border-red-500/30'}`}>
                  {stats.healthGrade}
                </div>
              </div>
            )}

            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-red-500/30 transition-all shadow-lg hover:shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shadow-lg shadow-red-500/10">
                  <Activity className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Failles Critiques</p>
              </div>
              <div className="mt-auto relative z-10">
                <h3 className="text-5xl font-black font-heading text-red-500 drop-shadow-sm">
                  {loading ? <span className="opacity-50 text-3xl">...</span> : (stats?.criticalVulnerabilities ?? 0)}
                </h3>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-blue-500/30 transition-all shadow-lg hover:shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
                  <GitBranch className="w-6 h-6 text-blue-400" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Projets Surveillés</p>
              </div>
              <div className="mt-auto relative z-10">
                <h3 className="text-5xl font-black font-heading text-foreground drop-shadow-sm">
                  {loading ? <span className="opacity-50 text-3xl">...</span> : (stats?.monitoredProjects ?? 0)}
                </h3>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-3xl flex flex-col gap-4 animate-in fade-in zoom-in-95 duration-300 relative group overflow-hidden border-border/40 hover:border-green-500/30 transition-all shadow-lg hover:shadow-xl">
              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="flex items-center gap-3 relative z-10">
                <div className="w-12 h-12 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center shadow-lg shadow-green-500/10">
                  <Database className="w-6 h-6 text-green-400" />
                </div>
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">Base de Données</p>
              </div>
              <div className="mt-auto flex flex-col gap-1 relative z-10">
                <h3 className="text-2xl font-bold text-green-400">
                  {loading ? <span className="opacity-50">...</span> : (stats?.lastSync ? 'Synchronisée' : 'En attente')}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{loading ? '--' : syncDisplay}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 relative z-10">
            {stats?.topProjects && stats.topProjects.length > 0 && (
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 relative border-border/40 shadow-xl">
                <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                  <Shield className="w-6 h-6 text-orange-400" />
                  <h3 className="font-bold text-xl font-heading">Top Projets à Risque</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {stats.topProjects.map((tp, i) => (
                    <div 
                      key={i} 
                      onClick={() => {
                        setTriageProjectId(tp.id);
                        setCurrentTab('triage');
                      }}
                      className="group flex items-center justify-between bg-black/20 p-4 rounded-2xl border border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-secondary text-muted-foreground flex items-center justify-center font-bold text-xs group-hover:bg-primary/20 group-hover:text-primary transition-colors">#{i+1}</div>
                        <span className="font-semibold text-base" title={tp.name}>{tp.name}</span>
                      </div>
                      <div className="flex gap-2">
                        {tp.critical > 0 && <span className="flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 px-2.5 py-1 rounded-lg text-xs font-bold"><AlertOctagon className="w-3.5 h-3.5" /> {tp.critical}</span>}
                        {tp.high > 0 && <span className="flex items-center gap-1 bg-orange-500/10 text-orange-400 border border-orange-500/20 px-2.5 py-1 rounded-lg text-xs font-bold"><AlertTriangle className="w-3.5 h-3.5" /> {tp.high}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats?.topCves && stats.topCves.length > 0 && (
              <div className="glass-panel p-6 rounded-3xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-300 relative border-border/40 shadow-xl">
                <div className="flex items-center gap-3 border-b border-border/40 pb-4">
                  <Activity className="w-6 h-6 text-red-400" />
                  <h3 className="font-bold text-xl font-heading">Vulnérabilités les plus fréquentes</h3>
                </div>
                <div className="flex flex-col gap-3">
                  {stats.topCves.map((tc, i) => (
                    <div 
                      key={i} 
                      onClick={() => {
                        setTriageCveFilter(tc.cve);
                        setCurrentTab('triage');
                      }}
                      className="group flex flex-col gap-2 bg-black/20 p-4 rounded-2xl border border-white/5 hover:bg-white/5 hover:border-white/10 cursor-pointer transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-primary font-semibold group-hover:underline">{tc.cve}</span>
                        <span className="font-bold text-xs bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-lg">Présente {tc.count} fois</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate" title={tc.title}>{tc.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Décoration d'arrière-plan optimisée */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] h-[90%] bg-primary/5 blur-[100px] rounded-full z-0 pointer-events-none"></div>


          <HistoryChart />

        </main>
      )}

      {currentTab === 'projects' && <Projects onViewTriage={(id) => { setTriageProjectId(id); setCurrentTab('triage'); }} />}
      {currentTab === 'triage' && <Triage projectId={triageProjectId} cveFilter={triageCveFilter} onClearProject={() => setTriageProjectId(null)} onClearCve={() => setTriageCveFilter(null)} />}
      {currentTab === 'reports' && <Reports />}
      {currentTab === 'prompts' && <PromptsLibrary />}
      {currentTab === 'settings' && <Settings />}
      </div>

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

      <footer className="w-full text-center py-8 mt-12 border-t border-border/10 text-muted-foreground/60 text-sm animate-in fade-in duration-500">
        <p className="font-bold text-foreground/50 mb-1 tracking-wider uppercase text-xs">Aegis Security</p>
        <p>Parce que coder sans faille relève du mythe, mais les corriger avant le week-end est un art.</p>
      </footer>

      <Console />
    </div>
    </>
  );
}
