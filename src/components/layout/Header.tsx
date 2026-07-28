import React from 'react';
import { Shield, Loader2, LayoutDashboard, FolderGit2, AlertOctagon, FileBarChart, Terminal, Settings } from 'lucide-react';

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
      
        <nav className="flex items-center gap-1.5 p-1.5 bg-black/20 backdrop-blur-md border border-white/5 rounded-2xl shadow-inner">
          <button 
            onClick={() => setCurrentTab('overview')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${currentTab === 'overview' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <LayoutDashboard className="w-4 h-4" />
            Vue d'ensemble
          </button>
          <button 
            onClick={() => setCurrentTab('projects')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${currentTab === 'projects' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <FolderGit2 className="w-4 h-4" />
            Projets
          </button>
          <button 
            onClick={() => { setTriageProjectId(null); setTriageCveFilter(null); setCurrentTab('triage'); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${currentTab === 'triage' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <AlertOctagon className="w-4 h-4" />
            CVEs
          </button>
          <button 
            onClick={() => setCurrentTab('reports')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${currentTab === 'reports' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <FileBarChart className="w-4 h-4" />
            Rapports
          </button>
          <button 
            onClick={() => setCurrentTab('prompts')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${currentTab === 'prompts' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
          >
            <Terminal className="w-4 h-4" />
            Prompts
          </button>
          
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          
          <button 
            onClick={() => setCurrentTab('settings')}
            className={`flex items-center justify-center p-2 rounded-xl transition-all duration-300 ${currentTab === 'settings' ? 'bg-primary text-primary-foreground shadow-[0_0_15px_rgba(var(--primary),0.3)]' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'}`}
            title="Paramètres"
          >
            <Settings className="w-5 h-5" />
          </button>
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
