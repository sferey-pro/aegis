import React from 'react';
import { Shield, Activity, Database, GitBranch, ArrowRight } from 'lucide-react';

export default function App() {
  return (
    <div className="flex flex-col min-h-screen p-6 md:p-12 overflow-hidden relative">
      
      {/* Navbar */}
      <header className="flex items-center justify-between py-4 w-full max-w-6xl mx-auto z-10">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 neon-glow">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold font-heading">Aegis</h1>
        </div>
        
        <nav className="hidden md:flex gap-8 text-sm font-medium text-muted-foreground">
          <a href="#" className="hover:text-foreground transition-colors">Overview</a>
          <a href="#" className="hover:text-foreground transition-colors">Projects</a>
          <a href="#" className="hover:text-foreground transition-colors">CVE Triage</a>
          <a href="#" className="hover:text-foreground transition-colors">Settings</a>
        </nav>
        
        <button className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-all hover:scale-105 active:scale-95 shadow-lg shadow-primary/20">
          Run Global Audit
        </button>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-6xl mx-auto mt-16 z-10 flex flex-col lg:flex-row gap-12 items-center">
        
        {/* Left Column: Hero Copy */}
        <div className="flex-1 space-y-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary border border-border text-xs font-medium text-muted-foreground animate-in slide-in-from-bottom-2 duration-500">
            <span className="flex w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            System Online & Active
          </div>
          
          <h2 className="text-5xl md:text-6xl font-bold leading-[1.1]">
            Continuous <br />
            <span className="text-gradient">Security Audit</span>
          </h2>
          
          <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
            Aegis aggregates your Node and PHP ecosystem vulnerabilities.
            Detect, triage, and enforce security policies directly from Git.
          </p>
          
          <div className="flex flex-wrap gap-4 pt-4">
            <button className="flex items-center gap-2 px-6 py-3 rounded-lg bg-foreground text-background font-medium hover:bg-foreground/90 transition-all group">
              View Dashboard
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            <button className="px-6 py-3 rounded-lg bg-secondary border border-border font-medium hover:bg-secondary/80 transition-colors">
              Configure Git
            </button>
          </div>
        </div>

        {/* Right Column: Visual Widgets */}
        <div className="flex-1 w-full relative">
          <div className="relative z-10 grid gap-6 md:grid-cols-2">
            
            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <Activity className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Critical Vulnerabilities</p>
                <h3 className="text-3xl font-bold mt-1">12</h3>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200 md:translate-y-6">
              <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                <GitBranch className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Monitored Projects</p>
                <h3 className="text-3xl font-bold mt-1">8</h3>
              </div>
            </div>

            <div className="glass-panel p-6 rounded-2xl flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300 md:col-span-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Database className="w-5 h-5 text-primary" />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Database Sync</p>
                  <h3 className="text-xl font-bold mt-1">Up to date</h3>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Last check</p>
                  <p className="text-sm font-medium">Just now</p>
                </div>
              </div>
            </div>

          </div>
          
          {/* Decorative background element behind cards */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-primary/20 blur-[100px] rounded-full z-0 pointer-events-none"></div>
        </div>
      </main>
    </div>
  );
}
