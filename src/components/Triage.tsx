import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, AlertOctagon, Info, HelpCircle, Check, X, Shield, RefreshCw, ChevronDown, ChevronUp, Link as LinkIcon, FileText, Copy, CheckCircle2 } from 'lucide-react';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  moderate: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-green-500/10 text-green-500 border-green-500/20',
  info: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  unknown: 'bg-gray-500/10 text-gray-400 border-gray-500/20'
};

const SEVERITY_ICONS: Record<string, React.ReactNode> = {
  critical: <AlertOctagon className="w-5 h-5 text-red-500" />,
  high: <AlertTriangle className="w-5 h-5 text-orange-500" />,
  moderate: <AlertCircle className="w-5 h-5 text-yellow-500" />,
  low: <Info className="w-5 h-5 text-green-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
  unknown: <HelpCircle className="w-5 h-5 text-gray-400" />
};

export function Triage({ projectId, onClearProject }: { projectId?: number | null, onClearProject?: () => void }) {
  const [cves, setCves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ticketModal, setTicketModal] = useState<{ isOpen: boolean; md: string; copied: boolean }>({ isOpen: false, md: '', copied: false });

  const fetchCves = async () => {
    try {
      const res = await fetch('/api/cves');
      const data = await res.json();
      setCves(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCves();
  }, []);

  const toggleExpand = (cve: string) => {
    setExpanded(prev => ({ ...prev, [cve]: !prev[cve] }));
  };

  const updateStatus = async (cve: string, projectId: number, newStatus: string) => {
    try {
      await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cve, projectId, status: newStatus })
      });
      fetchCves();
    } catch (err) {
      console.error(err);
    }
  };

  const createTicket = async (e: React.MouseEvent, cve: string) => {
    e.stopPropagation(); // Eviter le toggleExpand
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cve })
      });
      const data = await res.json();
      setTicketModal({ isOpen: true, md: data.markdown, copied: false });
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(ticketModal.md);
    setTicketModal(prev => ({ ...prev, copied: true }));
    setTimeout(() => setTicketModal(prev => ({ ...prev, copied: false })), 2000);
  };

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-heading flex items-center gap-3">
            Triage des Failles 
            {projectId && (
              <span className="text-sm font-semibold px-3 py-1 bg-primary/20 text-primary rounded-full border border-primary/30 flex items-center gap-2">
                Filtré par projet
                {onClearProject && (
                  <button onClick={onClearProject} className="hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">Gérez le statut des CVEs remontées par l'audit.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : cves.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
          <Shield className="w-16 h-16 text-green-500 opacity-80" />
          <div>
            <h3 className="text-xl font-bold text-green-500">Aucune vulnérabilité</h3>
            <p className="text-muted-foreground">Votre écosystème est sain !</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cves.map((group) => {
            const projectOccurrences = projectId 
              ? group.occurrences.filter((o: any) => o.projectId === projectId)
              : group.occurrences;
              
            if (projectOccurrences.length === 0) return null;

            const isExpanded = expanded[group.cve];
            const pendingCount = projectOccurrences.filter((o: any) => o.status === 'pending').length;
            
            return (
              <div key={group.cve} className={`glass-panel rounded-xl overflow-hidden border transition-colors ${pendingCount > 0 ? 'border-primary/30' : 'border-border/50'}`}>
                
                {/* Header (Clickable to expand) */}
                <div 
                  className="p-5 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                  onClick={() => toggleExpand(group.cve)}
                >
                  <div className="flex items-center gap-4">
                    {SEVERITY_ICONS[group.worst]}
                    <div>
                      <h3 className="font-bold text-lg flex items-center gap-2">
                        {group.ref || "Sans Référence"}
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${SEVERITY_COLORS[group.worst]}`}>
                          {group.worst.toUpperCase()}
                        </span>
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1 max-w-2xl truncate">
                        {group.occurrences[0]?.title}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium">{projectOccurrences.length} occurrence(s)</p>
                      {pendingCount > 0 && <p className="text-xs text-primary font-bold">{pendingCount} à trier</p>}
                    </div>
                    
                    <button 
                      onClick={(e) => createTicket(e, group.cve)}
                      className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-md bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 hover:text-blue-300 transition-colors border border-blue-500/20 text-xs font-medium"
                      title="Générer un ticket Jira pour cette faille"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Jira
                    </button>

                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-5 border-t border-border/50 bg-black/20">
                    <h4 className="font-semibold text-sm mb-3">Occurrences dans vos projets :</h4>
                    <div className="flex flex-col gap-2">
                      {projectOccurrences.map((occ: any, i: number) => (
                      <div key={i} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-card/40 border border-border/50">
                        
                        <div className="flex flex-col gap-1">
                          <h4 className="font-bold text-foreground flex items-center gap-2">
                            {occ.projectName}
                            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-secondary uppercase">{occ.tool}</span>
                          </h4>
                          <p className="text-sm text-muted-foreground font-mono">
                            {occ.package} {occ.versionRange && <span>({occ.versionRange})</span>}
                          </p>
                          {occ.link && (
                            <a href={occ.link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-1">
                              <LinkIcon className="w-3 h-3" /> Lire l'avis de sécurité
                            </a>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateStatus(group.cve, occ.projectId, 'pending')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${occ.status === 'pending' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            >
                              À traiter
                            </button>
                            <button 
                              onClick={() => updateStatus(group.cve, occ.projectId, 'confirmed')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${occ.status === 'confirmed' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-400'}`}
                            >
                              <Check className="w-3 h-3" /> Confirmé
                            </button>
                            <button 
                              onClick={() => updateStatus(group.cve, occ.projectId, 'ignored')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${occ.status === 'ignored' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' : 'text-muted-foreground hover:bg-gray-500/10 hover:text-gray-300'}`}
                            >
                              <X className="w-3 h-3" /> Ignoré (Faux positif)
                            </button>
                          </div>
                          
                          {occ.fixedIn && (
                            <p className="text-xs text-green-400 mt-1">
                              Correction dispo : {occ.fixedIn}
                            </p>
                          )}
                        </div>

                      </div>
                    ))}
                    </div>
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Ticket Modal */}
      {ticketModal.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="glass-panel w-full max-w-3xl rounded-2xl p-6 flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold font-heading flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-400" />
                Ticket Jira (Markdown)
              </h3>
              <button 
                onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto bg-black/50 rounded-xl border border-white/5 p-4 relative font-mono text-sm text-gray-300 whitespace-pre-wrap select-all">
              {ticketModal.md}
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button 
                onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
                className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Fermer
              </button>
              <button 
                onClick={copyToClipboard}
                className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2"
              >
                {ticketModal.copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {ticketModal.copied ? "Copié !" : "Copier le texte"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
