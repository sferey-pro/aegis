import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Maximize2, Minimize2, X, Folder, Globe, Loader2, CheckCircle, XCircle, Trash2 } from 'lucide-react';

interface ConsoleEvent {
  id: number;
  phase: "start" | "end";
  cmd?: string;
  cwd?: string;
  label?: string;
  project?: string;
  exitCode?: number;
  ms?: number;
  errorText?: string;
}

interface LogEntry {
  id: number;
  cmd: string;
  cwd: string;
  label: string;
  project?: string;
  status: "running" | "success" | "error";
  exitCode?: number;
  ms?: number;
  startTime: number;
  errorText?: string;
}

export function Console() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<string>('Global');
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  
  // Extract unique projects to create tabs
  const projectTabs = Array.from(new Set(logs.map(l => l.project).filter(Boolean))) as string[];
  const tabs = ['Global', ...projectTabs];

  useEffect(() => {
    const evtSource = new EventSource("/api/console");
    
    evtSource.onmessage = (event) => {
      // Ignore ping and connected messages
      if (event.data === ": ping" || event.data === ": connected") return;
      
      try {
        const data: ConsoleEvent = JSON.parse(event.data);
        
        setLogs(prev => {
          if (data.phase === "start") {
            return [...prev, {
              id: data.id,
              cmd: data.cmd || "unknown",
              cwd: data.cwd || "",
              label: data.label || "unknown",
              project: data.project,
              status: "running",
              startTime: Date.now()
            }].slice(-200); // Keep last 200 logs
          } else {
            return prev.map(log => {
              if (log.id === data.id) {
                return {
                  ...log,
                  status: data.exitCode === 0 ? "success" : "error",
                  exitCode: data.exitCode,
                  ms: data.ms,
                  errorText: data.errorText
                };
              }
              return log;
            });
          }
        });
      } catch (e) {
        console.error("SSE parse error", e);
      }
    };

    return () => evtSource.close();
  }, []);

  // Auto-scroll logic
  useEffect(() => {
    if (isOpen) {
      const container = logsEndRef.current?.parentElement;
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isAtBottom) {
          logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        logsEndRef.current?.scrollIntoView();
      }
    }
  }, [logs, isOpen, activeTab]);

  const runningCount = logs.filter(l => l.status === "running").length;
  
  // Filter logs for the active tab
  const filteredLogs = activeTab === 'Global' 
    ? logs 
    : logs.filter(l => l.project === activeTab);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full bg-card border border-border shadow-2xl hover:bg-secondary transition-all group z-50 neon-glow"
        title="Ouvrir la Console Live"
      >
        <Terminal className="w-6 h-6 text-primary group-hover:scale-110 transition-transform" />
        {runningCount > 0 && (
          <span className="absolute top-0 right-0 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-primary text-[9px] font-bold items-center justify-center text-primary-foreground">
              {runningCount}
            </span>
          </span>
        )}
      </button>
    );
  }

  return (
    <div className={`fixed bottom-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-t border-l border-border shadow-2xl transition-all duration-300 flex flex-col font-mono text-sm ${isMaximized ? 'w-full h-[80vh] sm:w-[90vw] mx-auto sm:left-0 sm:right-0 sm:bottom-0 rounded-t-xl' : 'w-full md:w-[700px] h-[450px] md:bottom-6 md:right-6 md:rounded-2xl md:border'}`}>
      
      {/* Console Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-border/50 select-none">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span className="font-semibold text-xs tracking-wider">AEGIS LIVE CONSOLE</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLogs([])} 
            className="text-muted-foreground hover:text-white transition-colors"
            title="Effacer la console"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={() => setIsMaximized(!isMaximized)} className="text-muted-foreground hover:text-white transition-colors hidden md:block">
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="flex overflow-x-auto bg-[#050505] border-b border-border/30 hide-scrollbar shrink-0">
        {tabs.map(t => {
          const tabRunning = t === 'Global' 
            ? runningCount 
            : logs.filter(l => l.project === t && l.status === 'running').length;
            
          return (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 relative ${
                activeTab === t 
                  ? 'text-primary border-primary bg-primary/10' 
                  : 'text-muted-foreground border-transparent hover:bg-white/5 hover:text-foreground'
              }`}
            >
              {t === 'Global' ? <Globe className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
              {t}
              {tabRunning > 0 && (
                <span className="ml-1 flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Logs Viewport */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-[#0a0a0a]">
        {filteredLogs.length === 0 ? (
          <div className="text-muted-foreground/50 h-full flex items-center justify-center italic">
            En attente de commandes réseau ou audit...
          </div>
        ) : (
          filteredLogs.map(log => (
            <div key={log.id} className="flex gap-3 group break-words whitespace-pre-wrap">
              <div className="w-4 flex-shrink-0 mt-0.5">
                {log.status === "running" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                {log.status === "success" && <CheckCircle className="w-4 h-4 text-green-500" />}
                {log.status === "error" && <XCircle className="w-4 h-4 text-red-500" />}
              </div>
              
              <div className="flex-1 flex flex-col min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-xs px-2 py-0.5 rounded bg-white/10 text-white/90">
                    {log.label.toUpperCase()}
                  </span>
                  
                  {activeTab === 'Global' && log.project && (
                    <span className="text-xs text-muted-foreground bg-white/5 px-2 py-0.5 rounded">
                      {log.project}
                    </span>
                  )}
                  
                  <code className="text-yellow-200/90 font-bold">$ {log.cmd}</code>
                  
                  {log.status !== "running" && log.ms !== undefined && (
                    <span className="text-xs text-muted-foreground">({log.ms}ms)</span>
                  )}
                  
                  {log.status === "error" && log.exitCode !== undefined && (
                    <span className="text-xs text-red-400 bg-red-400/10 px-2 py-0.5 rounded">
                      code {log.exitCode}
                    </span>
                  )}
                </div>
                
                {log.cwd && (
                  <div className="text-xs text-muted-foreground/70 mt-1 pl-1 border-l-2 border-white/10">
                    {log.cwd}
                  </div>
                )}
                {log.status === "error" && log.errorText && (
                  <div className="text-xs text-red-400 mt-1 pl-2 border-l-2 border-red-500/50 bg-red-500/10 p-2 rounded break-all">
                    {log.errorText}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
