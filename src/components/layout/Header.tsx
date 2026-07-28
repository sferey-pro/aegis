import React from 'react';
import { Shield, Loader2 } from 'lucide-react';

export function Header({
  currentTab,
  setCurrentTab,
  setTriageProjectId,
  setTriageCveFilter,
  handleRunAudit,
  auditing
}: {
  currentTab: string;
  setCurrentTab: (tab: any) => void;
  setTriageProjectId: (id: number | null) => void;
  setTriageCveFilter: (cve: string | null) => void;
  handleRunAudit: () => void;
  auditing: boolean;
}) {
  return (
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
  );
}
