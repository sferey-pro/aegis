import React, { useEffect, useState, useRef } from 'react';
import { Terminal, X, Minimize2, Maximize2, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface ConsoleEvent {
  id: number;
  phase: "start" | "end";
  cmd?: string;
  cwd?: string;
  label?: "git" | "audit" | "github";
  project?: string;
  exitCode?: number;
  ms?: number;
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
}

export function Console() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);
  
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
            }].slice(-100); // Keep last 100
          } else {
            return prev.map(log => {
              if (log.id === data.id) {
                return {
                  ...log,
                  status: data.exitCode === 0 ? "success" : "error",
                  exitCode: data.exitCode,
                  ms: data.ms
                };
              }
              return log;
            });
          }
        });
      } catch (e) {
        // Parse error
      }
    };

    return () => evtSource.close();
  }, []);

  useEffect(() => {
    if (isOpen) {
      const container = logsEndRef.current?.parentElement;
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
        if (isAtBottom) {
          logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
      } else {
        // Initial open
        logsEndRef.current?.scrollIntoView();
      }
    }
  }, [logs, isOpen]);

  // Si fermée, affiche un petit bouton flottant avec point de notification si des process tournent
  if (!isOpen) {
    const runningCount = logs.filter(l => l.status === "running").length;
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
    <div className={`fixed bottom-0 right-0 z-50 bg-black/90 backdrop-blur-xl border-t border-l border-border shadow-2xl transition-all duration-300 flex flex-col font-mono text-sm ${isMaximized ? 'w-full h-1/2 rounded-t-2xl' : 'w-full md:w-[600px] h-[400px] md:bottom-6 md:right-6 md:rounded-2xl md:border'}`}>
      
      {/* En-tête Terminal */}
      <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-b border-border/50 select-none">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Terminal className="w-4 h-4" />
          <span className="font-semibold text-xs tracking-wider">AEGIS LIVE CONSOLE</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMaximized(!isMaximized)} className="text-muted-foreground hover:text-white transition-colors hidden md:block">
            {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button onClick={() => setIsOpen(false)} className="text-muted-foreground hover:text-red-500 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {logs.length === 0 ? (
          <div className="text-muted-foreground/50 h-full flex items-center justify-center italic">
            En attente de commandes réseau ou audit...
          </div>
        ) : (
          logs.map(log => (
            <div key={log.id} className="flex gap-3 group break-all">
              {/* Statut icône */}
              <div className="mt-0.5 shrink-0">
                {log.status === "running" && <Loader2 className="w-4 h-4 text-primary animate-spin" />}
                {log.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                {log.status === "error" && <AlertCircle className="w-4 h-4 text-red-500" />}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-2">
                  {/* Label tag */}
                  <span className={`px-1.5 py-0.5 text-[10px] uppercase font-bold rounded ${
                    log.label === 'git' ? 'bg-orange-500/20 text-orange-400' : 
                    log.label === 'github' ? 'bg-purple-500/20 text-purple-400' : 
                    'bg-blue-500/20 text-blue-400'
                  }`}>
                    {log.label}
                  </span>
                  
                  {/* Projet tag */}
                  {log.project && (
                    <span className="text-xs text-muted-foreground border border-border/50 rounded px-1">
                      {log.project}
                    </span>
                  )}
                  
                  {/* Commande */}
                  <span className={`text-white font-medium ${log.status === "error" ? "text-red-400" : ""}`}>
                    $ {log.cmd}
                  </span>
                </div>
                
                {/* Infos secondaires (CWD + temps) */}
                <div className="flex gap-4 mt-1 text-xs text-muted-foreground/50">
                  <span className="truncate max-w-[70%]" title={log.cwd}>in {log.cwd.replace(process.env.HOME || '~', '~')}</span>
                  {log.ms !== undefined && (
                    <span>
                      {log.ms}ms {log.exitCode !== 0 && <span className="text-red-400 ml-2">exit {log.exitCode}</span>}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
