import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, AlertOctagon, Info, HelpCircle, Check, X, Shield, RefreshCw, ChevronDown, ChevronUp, Link as LinkIcon, FileText, Copy, CheckCircle2, Edit2 } from 'lucide-react';

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

const SEV_ORDER: Record<string, number> = { critical: 4, high: 3, moderate: 2, low: 1, info: 0, unknown: -1 };

export function Triage({ projectId, onClearProject, cveFilter, onClearCve }: { projectId?: number | null, onClearProject?: () => void, cveFilter?: string | null, onClearCve?: () => void }) {
  const [cves, setCves] = useState<any[]>([]);
  const [tickets, setTickets] = useState<Record<string, any>>({});
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [ticketModal, setTicketModal] = useState<{ isOpen: boolean; md: string; copied: boolean }>({ isOpen: false, md: '', copied: false });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; cve: string; projectId: number; reason: string } | null>(null);

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

  const fetchTickets = async () => {
    try {
      const res = await fetch('/api/tickets/list');
      const data = await res.json();
      const map: Record<string, any> = {};
      data.forEach((t: any) => map[`${t.project_id}::${t.package}`] = t);
      setTickets(map);
    } catch (e) { console.error(e); }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      setJiraBaseUrl(data.JIRA_BASE_URL || '');
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchCves();
    fetchTickets();
    fetchSettings();
  }, []);

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const packageGroups = React.useMemo(() => {
    const map = new Map<string, any>();
    cves.forEach((cveGroup: any) => {
      if (cveFilter && cveGroup.cve !== cveFilter) return;

      cveGroup.occurrences.forEach((occ: any) => {
        if (projectId && occ.projectId !== projectId) return;
        
        const key = `${occ.projectId}::${occ.package}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            projectId: occ.projectId,
            projectName: occ.projectName,
            package: occ.package,
            tool: occ.tool,
            cves: [],
            worstSeverity: occ.severity,
            pendingCount: 0,
            hasConfirmed: false
          });
        }
        const g = map.get(key);
        if (SEV_ORDER[occ.severity] > SEV_ORDER[g.worstSeverity]) {
          g.worstSeverity = occ.severity;
        }
        if (occ.status === 'pending') g.pendingCount++;
        if (occ.status === 'confirmed') g.hasConfirmed = true;
        
        g.cves.push({
          cve: cveGroup.cve,
          ref: cveGroup.ref,
          title: occ.title || cveGroup.title,
          severity: occ.severity,
          versionRange: occ.versionRange,
          fixedIn: occ.fixedIn,
          link: occ.link,
          status: occ.status,
          note: occ.note
        });
      });
    });
    return Array.from(map.values()).sort((a, b) => b.projectName.localeCompare(a.projectName));
  }, [cves, projectId, cveFilter]);

  const updateStatus = async (cve: string, projectId: number, newStatus: string, note?: string) => {
    try {
      const payload: any = { cve, projectId, status: newStatus };
      if (note !== undefined) payload.note = note;
      await fetch('/api/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      fetchCves();
    } catch (err) {
      console.error(err);
    }
  };

  const handleConfirmCve = (cve: string, projectId: number, initialReason: string = '') => {
    setConfirmModal({ isOpen: true, cve, projectId, reason: initialReason });
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmModal) return;
    await updateStatus(confirmModal.cve, confirmModal.projectId, 'confirmed', confirmModal.reason);
    setConfirmModal(null);
  };

  const linkTicket = async (projectId: number, packageName: string, ref: string, cveList: string[]) => {
    if (!ref.trim()) return;
    try {
      await fetch('/api/tickets/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, packageName, ref, cves: cveList })
      });
      fetchTickets();
    } catch (err) { console.error(err); }
  };

  const unlinkTicket = async (projectId: number, packageName: string) => {
    try {
      await fetch('/api/tickets/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, packageName })
      });
      fetchTickets();
    } catch (err) { console.error(err); }
  };

  const createTicket = async (e: React.MouseEvent, projectId: number, packageName: string) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, packageName })
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
            CVEs 
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
            {cveFilter && (
              <span className="text-sm font-semibold px-3 py-1 bg-orange-500/20 text-orange-500 rounded-full border border-orange-500/30 flex items-center gap-2">
                Filtré par CVE ({cveFilter})
                {onClearCve && (
                  <button onClick={onClearCve} className="hover:text-red-400 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
            )}
          </h2>
          <p className="text-muted-foreground mt-1">Regroupé par Package et par Projet. Créez facilement vos tickets Jira.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : packageGroups.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4">
          <Shield className="w-16 h-16 text-green-500 opacity-80" />
          <div>
            <h3 className="text-xl font-bold text-green-500">Aucune vulnérabilité</h3>
            <p className="text-muted-foreground">Votre écosystème est sain !</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {packageGroups.map((group) => {
            const isExpanded = expanded[group.key];
            
            return (
              <div key={group.key} className={`glass-panel rounded-xl overflow-hidden border transition-colors ${group.hasConfirmed ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] bg-red-950/20' : (group.pendingCount > 0 ? 'border-primary/30' : 'border-border/50')}`}>
                
                {/* Header = Package + Project */}
                <div 
                  className="p-5 cursor-pointer hover:bg-white/5 transition-colors flex items-center justify-between gap-4"
                  onClick={() => toggleExpand(group.key)}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg border ${group.hasConfirmed ? 'bg-red-500/20 border-red-500 text-red-500' : SEVERITY_COLORS[group.worstSeverity]}`}>
                      {group.hasConfirmed ? <AlertOctagon className="w-5 h-5 text-red-500 animate-pulse" /> : SEVERITY_ICONS[group.worstSeverity]}
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className={`font-bold text-lg font-mono ${group.hasConfirmed ? 'text-red-400' : 'text-foreground'}`}>{group.package}</h3>
                        {!group.hasConfirmed && (
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase border ${SEVERITY_COLORS[group.worstSeverity]}`}>
                            {group.worstSeverity}
                          </span>
                        )}
                        {group.hasConfirmed && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase border border-red-500/50 bg-red-500/20 text-red-400 animate-pulse">
                            Urgent à sécuriser
                          </span>
                        )}
                        {group.pendingCount > 0 && (
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/20 text-primary border border-primary/30 flex items-center gap-1">
                            <RefreshCw className="w-3 h-3 animate-spin" /> {group.pendingCount} en attente
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                        Projet : <span className="font-semibold text-foreground">{group.projectName}</span>
                        <span className="px-2 py-0.5 text-[10px] rounded bg-secondary uppercase">{group.tool}</span>
                      </p>
                      
                      {/* Ligne Ticket Jira Associé */}
                      <div className="flex items-center gap-2 mt-3" onClick={e => e.stopPropagation()}>
                        {tickets[group.key] ? (
                          <div className="flex items-center gap-2 text-sm bg-blue-500/10 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/20">
                            <LinkIcon className="w-3.5 h-3.5" />
                            <a href={`${jiraBaseUrl}${tickets[group.key].url}`} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                              {tickets[group.key].url}
                            </a>
                            <button onClick={() => unlinkTicket(group.projectId, group.package)} className="ml-2 hover:text-red-400">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            {group.cves.some((c: any) => !tickets[group.key].cves.includes(c.cve)) && (
                              <span className="flex items-center gap-1 text-orange-400 ml-2" title="De nouvelles failles sont apparues depuis l'association de ce ticket !">
                                <AlertTriangle className="w-4 h-4" /> Nouvelle CVE !
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input 
                              type="text" 
                              placeholder="Associer Ticket (ex: SEC-123) + Entrée"
                              className="bg-black/40 border border-border/50 rounded-md px-3 py-1.5 text-xs outline-none focus:border-blue-500 font-mono w-64"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  linkTicket(group.projectId, group.package, e.currentTarget.value, group.cves.map((c:any) => c.cve));
                                }
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <button 
                      onClick={(e) => createTicket(e, group.projectId, group.package)}
                      className="px-3 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors flex items-center gap-2 text-sm font-semibold"
                    >
                      <FileText className="w-4 h-4" />
                      Ticket Jira
                    </button>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                  </div>
                </div>

                {/* Expanded Details = CVEs */}
                {isExpanded && (
                  <div className="p-5 border-t border-border/50 bg-black/20">
                    <h4 className="font-semibold text-sm mb-3">CVEs détectées sur ce package :</h4>
                    <div className="flex flex-col gap-2">
                      {group.cves.map((cveObj: any, i: number) => (
                      <div key={i} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-card/40 border border-border/50">
                        
                        <div className="flex flex-col gap-1 flex-1">
                          <h4 className="font-bold text-foreground flex items-center gap-2">
                            {cveObj.ref}
                            <span className={`px-2 py-0.5 rounded text-xs uppercase border ${SEVERITY_COLORS[cveObj.severity]}`}>
                              {cveObj.severity}
                            </span>
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {cveObj.title} {cveObj.versionRange && <span className="font-mono">({cveObj.versionRange})</span>}
                          </p>
                          {cveObj.link && (
                            <a href={cveObj.link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1 mt-1">
                              <LinkIcon className="w-3 h-3" /> Lire l'avis de sécurité
                            </a>
                          )}
                        </div>

                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="flex gap-2">
                            <button 
                              onClick={() => updateStatus(cveObj.cve, group.projectId, 'pending')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${cveObj.status === 'pending' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50'}`}
                            >
                              À traiter
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleConfirmCve(cveObj.cve, group.projectId, cveObj.note || ''); }}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${cveObj.status === 'confirmed' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'text-muted-foreground hover:bg-red-500/10 hover:text-red-400'}`}
                            >
                              <Check className="w-3 h-3" /> Confirmé
                            </button>
                            <button 
                              onClick={() => updateStatus(cveObj.cve, group.projectId, 'ignored')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1 ${cveObj.status === 'ignored' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' : 'text-muted-foreground hover:bg-gray-500/10 hover:text-gray-300'}`}
                            >
                              <X className="w-3 h-3" /> Ignoré (Faux positif)
                            </button>
                          </div>
                          
                          {cveObj.fixedIn && (
                            <p className="text-xs text-green-400 mt-1">
                              Correction dispo : {cveObj.fixedIn}
                            </p>
                          )}
                          {cveObj.note && (
                            <div className="text-xs text-muted-foreground mt-2 bg-black/30 p-2.5 rounded border border-white/5 relative group">
                              <span className="font-semibold block mb-0.5 text-foreground/80">Raison / Note :</span>
                              <p className="pr-6 whitespace-pre-wrap">{cveObj.note}</p>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handleConfirmCve(cveObj.cve, group.projectId, cveObj.note); }}
                                className="absolute top-2 right-2 p-1.5 rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white"
                                title="Modifier la note"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
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

      {/* Confirm Reason Modal */}
      {confirmModal?.isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={() => setConfirmModal(null)}>
          <form onSubmit={submitConfirm} onClick={e => e.stopPropagation()} className="glass-panel w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertOctagon className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="text-xl font-bold font-heading text-red-500">Confirmer la faille</h3>
                <p className="text-sm text-muted-foreground">{confirmModal.cve}</p>
              </div>
            </div>
            
            <p className="text-sm text-foreground/90 mt-2">
              Vous êtes sur le point de confirmer cette faille. Le composant sera marqué comme <strong className="text-red-400">Urgent à sécuriser</strong>.
            </p>

            <div className="flex flex-col gap-1.5 mt-2">
              <label className="text-sm font-semibold">Raison / Justification (Obligatoire)</label>
              <textarea 
                required
                value={confirmModal.reason}
                onChange={e => setConfirmModal({...confirmModal, reason: e.target.value})}
                className="bg-background border border-border rounded-md px-3 py-2 outline-none focus:border-red-500 transition-colors min-h-[100px] text-sm"
                placeholder="Ex: Le composant est exposé sur l'interface publique, risque réel d'exploitation..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button 
                type="button"
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
              >
                Annuler
              </button>
              <button 
                type="submit"
                className="px-4 py-2 rounded-md bg-red-600 text-white hover:bg-red-500 transition-colors"
              >
                Confirmer la faille
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
