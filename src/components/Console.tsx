import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Maximize2, Minimize2, X, Folder, Globe } from 'lucide-react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';

interface ConsoleEvent {
  id: number;
  phase: "start" | "end";
  cmd?: string;
  cwd?: string;
  label?: string;
  project?: string;
  exitCode?: number;
  ms?: number;
}

export function Console() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [runningCount, setRunningCount] = useState(0);
  
  const [activeTab, setActiveTab] = useState<string>('Global');
  const [tabs, setTabs] = useState<string[]>(['Global']);
  
  const terminalRef = useRef<HTMLDivElement>(null);
  
  // Maps tabName -> { term: XTerm, fit: FitAddon }
  const terminals = useRef<Record<string, { term: XTerm, fit: FitAddon }>>({});
  
  // Set of running task IDs
  const runningTasks = useRef<Set<number>>(new Set());

  const getOrCreateTerminal = (name: string) => {
    if (terminals.current[name]) return terminals.current[name];

    const term = new XTerm({
      theme: {
        background: '#0a0a0a',
        foreground: '#f3f4f6',
        cursor: 'transparent',
      },
      fontFamily: 'monospace',
      fontSize: 12,
      disableStdin: true,
      cursorBlink: false,
      convertEol: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    
    term.writeln(`\x1b[1;34m[AEGIS]\x1b[0m Live console initialized for ${name}...`);
    
    terminals.current[name] = { term, fit };
    
    // Add to state if it's a new tab (only state triggers re-render of tab list)
    setTabs(prev => prev.includes(name) ? prev : [...prev, name]);
    
    return terminals.current[name];
  };

  // Mount terminal when tab changes or opens
  useEffect(() => {
    if (!isOpen || !terminalRef.current) return;
    
    const container = terminalRef.current;
    container.innerHTML = ''; // Clear previous terminal DOM
    
    const { term, fit } = getOrCreateTerminal(activeTab);
    term.open(container);
    
    setTimeout(() => {
      fit.fit();
    }, 50);
  }, [isOpen, activeTab, isMaximized]);

  // Handle resize events
  useEffect(() => {
    const handleResize = () => {
      if (isOpen) {
        terminals.current[activeTab]?.fit.fit();
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, activeTab]);

  // Handle SSE
  useEffect(() => {
    // Ensure Global is created early
    getOrCreateTerminal('Global');

    const evtSource = new EventSource("/api/console");
    
    evtSource.onmessage = (event) => {
      if (event.data === ": ping" || event.data === ": connected") return;
      
      try {
        const data: ConsoleEvent = JSON.parse(event.data);

        const time = new Date().toLocaleTimeString('fr-FR', { hour12: false });
        const prefix = `\x1b[90m[${time}]\x1b[0m`;
        
        let labelColor = '\x1b[36m'; // cyan
        if (data.label === 'git') labelColor = '\x1b[33m'; // yellow
        else if (data.label === 'github') labelColor = '\x1b[35m'; // magenta
        
        const labelStr = data.label ? `${labelColor}[${data.label.toUpperCase()}]\x1b[0m ` : '';
        const projStr = data.project ? `\x1b[90m(${data.project})\x1b[0m ` : '';

        let logString = '';
        if (data.phase === "start") {
          runningTasks.current.add(data.id);
          logString = `${prefix} ${labelStr}${projStr}Running: \x1b[1m$ ${data.cmd}\x1b[0m`;
        } else {
          runningTasks.current.delete(data.id);
          const success = data.exitCode === 0;
          const statusStr = success ? `\x1b[32msuccess\x1b[0m` : `\x1b[31merror (exit ${data.exitCode})\x1b[0m`;
          logString = `${prefix} ${labelStr}${projStr}Finished: \x1b[1m$ ${data.cmd}\x1b[0m in ${data.ms}ms -> ${statusStr}`;
        }
        
        setRunningCount(runningTasks.current.size);

        // Always write to Global tab
        terminals.current['Global']?.term.writeln(logString);

        // Write to specific project tab if there is one
        if (data.project) {
          const { term } = getOrCreateTerminal(data.project);
          term.writeln(logString);
        }

      } catch (e) {
        console.error("SSE parse error", e);
      }
    };

    return () => {
      evtSource.close();
      // Dispose all terminals on unmount
      Object.values(terminals.current).forEach(({ term }) => term.dispose());
    };
  }, []);

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
    <div className={`fixed bottom-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-t border-l border-border shadow-2xl transition-all duration-300 flex flex-col font-mono text-sm ${isMaximized ? 'w-full h-1/2 rounded-t-2xl' : 'w-full md:w-[600px] h-[400px] md:bottom-6 md:right-6 md:rounded-2xl md:border'}`}>
      
      {/* Console Header */}
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

      {/* Tabs Menu */}
      <div className="flex overflow-x-auto bg-[#050505] border-b border-border/30 hide-scrollbar">
        {tabs.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
              activeTab === t 
                ? 'text-primary border-primary bg-primary/10' 
                : 'text-muted-foreground border-transparent hover:bg-white/5 hover:text-foreground'
            }`}
          >
            {t === 'Global' ? <Globe className="w-3.5 h-3.5" /> : <Folder className="w-3.5 h-3.5" />}
            {t}
          </button>
        ))}
      </div>

      {/* Terminal Viewport */}
      <div className="flex-1 w-full relative overflow-hidden bg-[#0a0a0a]">
        <div ref={terminalRef} className="absolute inset-2" />
      </div>
    </div>
  );
}
