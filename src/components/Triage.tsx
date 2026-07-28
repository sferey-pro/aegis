import React, { useState, useEffect } from 'react';
import { AlertTriangle, AlertCircle, AlertOctagon, Info, HelpCircle, Check, X, Shield, RefreshCw, ChevronDown, ChevronUp, Link as LinkIcon, FileText, Copy, CheckCircle2, Edit2, Globe, ChevronRight, ShieldAlert, Server, Clock } from 'lucide-react';
import { buildCvssTooltip } from '../lib/cvss';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';


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

function compareVersions(v1: string, v2: string): number {
  if (!v1) return -1;
  if (!v2) return 1;
  const p1 = v1.replace(/^[^\d]+/, '').split('.').map(Number);
  const p2 = v2.replace(/^[^\d]+/, '').split('.').map(Number);
  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function Triage({ projectId, onClearProject, cveFilter, onClearCve }: { projectId?: number | null, onClearProject?: () => void, cveFilter?: string | null, onClearCve?: () => void }) {
  const [cves, setCves] = useState<any[]>([]);
  const [tickets, setTickets] = useState<Record<string, any>>({});
  const [jiraBaseUrl, setJiraBaseUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [selectedGroup, setSelectedGroup] = useState<any | null>(null);
  const [ticketModal, setTicketModal] = useState<{ isOpen: boolean; md: string; copied: boolean }>({ isOpen: false, md: '', copied: false });
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; cve: string; projectId: number; reason: string } | null>(null);
  const [toast, setToast] = useState<{ isOpen: boolean; title: string; message: React.ReactNode; type: 'success' | 'error' | 'info' } | null>(null);
  const [hideProcessed, setHideProcessed] = useState(false);

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

  const packageGroups = React.useMemo(() => {
    const map = new Map<string, any>();
    cves.forEach((cveGroup: any) => {
      if (cveFilter && cveGroup.cve !== cveFilter) return;

      cveGroup.occurrences.forEach((occ: any) => {
        if (projectId && occ.projectId !== projectId) return;
        if (hideProcessed && occ.status !== 'pending') return;
        
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
            hasConfirmed: false,
            maxAgeInDays: 0,
            targetPatch: null as string | null
          });
        }
        const g = map.get(key)!;
        if (occ.fixedIn && (!g.targetPatch || compareVersions(occ.fixedIn, g.targetPatch) > 0)) {
          g.targetPatch = occ.fixedIn;
        }
        if (occ.ageInDays && occ.ageInDays > g.maxAgeInDays) {
          g.maxAgeInDays = occ.ageInDays;
        }
        if ((SEV_ORDER[occ.severity] ?? -1) > (SEV_ORDER[g.worstSeverity] ?? -1)) {
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
          note: occ.note,
          cvssVector: occ.cvssVector,
          ageInDays: occ.ageInDays,
          firstSeenAt: occ.firstSeenAt
        });
      });
    });
    return Array.from(map.values())
      .filter(g => g.cves.length > 0)
      .sort((a, b) => b.projectName.localeCompare(a.projectName));
  }, [cves, projectId, cveFilter, hideProcessed]);

  useEffect(() => {
    setPage(1);
  }, [cves, projectId, cveFilter, hideProcessed]);

  const totalPages = Math.ceil(packageGroups.length / itemsPerPage);
  const paginatedGroups = packageGroups.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  const updateStatus = async (cve: string, projectId: number, newStatus: string, note?: string) => {
    try {
      const payload: any = { cve, projectId, status: newStatus };
      if (note !== undefined) {
        payload.note = note;
      } else if (newStatus !== 'confirmed') {
        payload.note = ''; // Effacer la note si on passe en "À traiter" ou "Ignoré"
      }
      
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
    <div className="flex-1 w-full max-w-[1600px] px-4 md:px-8 mx-auto mt-8 z-10 animate-in fade-in duration-500">
      
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
        <button 
          onClick={() => setHideProcessed(!hideProcessed)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${hideProcessed ? 'bg-primary/20 text-primary border-primary/30' : 'bg-secondary text-muted-foreground border-transparent hover:bg-white/5'}`}
        >
          <CheckCircle2 className="w-4 h-4" /> Zero-Inbox (Masquer traitées)
        </button>
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
          <div className="glass-panel rounded-xl overflow-hidden border border-border/50">
            <div className="w-full overflow-x-auto pb-2">
              <Table className="min-w-[900px]">
                <TableHeader className="bg-black/20">
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead className="sticky left-0 bg-background/95 backdrop-blur z-10 border-r border-border/50 min-w-[250px]">Sévérité / Package</TableHead>
                    <TableHead>Projet</TableHead>
                    <TableHead className="text-center">Vuln. (Attente)</TableHead>
                    <TableHead className="text-center">Statut / Résolution</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedGroups.map((group) => {
                  return (
                    <React.Fragment key={group.key}>
                      <TableRow 
                        className={`cursor-pointer transition-colors border-border/50 hover:bg-white/5 ${group.hasConfirmed ? 'bg-red-950/20' : ''}`}
                        onClick={() => setSelectedGroup(group)}
                      >
                        <TableCell className="sticky left-0 bg-background/95 backdrop-blur z-10 border-r border-border/50">
                          <div className="flex items-center gap-3">
                            <div className={`p-1.5 rounded-lg border ${group.hasConfirmed ? 'bg-red-500/20 border-red-500 text-red-500' : SEVERITY_COLORS[group.worstSeverity]}`}>
                              {group.hasConfirmed ? <AlertOctagon className="w-4 h-4 text-red-500 animate-pulse" /> : SEVERITY_ICONS[group.worstSeverity]}
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-bold font-mono ${group.hasConfirmed ? 'text-red-400' : 'text-foreground'}`}>
                                {group.package}
                              </span>
                              <div className="flex items-center gap-2 mt-1">
                                {!group.hasConfirmed && (
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase border ${SEVERITY_COLORS[group.worstSeverity]}`}>
                                    {group.worstSeverity}
                                  </span>
                                )}
                                {group.hasConfirmed && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-red-500/50 bg-red-500/20 text-red-400 animate-pulse">
                                    Urgent
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-sm">{group.projectName}</span>
                            <span className="px-1.5 py-0.5 w-fit text-[9px] rounded bg-secondary uppercase">{group.tool}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="inline-flex items-center gap-2 px-2 py-1 bg-white/5 border border-white/10 rounded-md text-xs">
                            <span className="font-bold flex items-center gap-1"><Shield className="w-3 h-3 text-muted-foreground" /> {group.cves.length}</span>
                            {group.pendingCount > 0 && (
                              <>
                                <span className="w-px h-3 bg-white/20"></span>
                                <span className="text-primary font-medium flex items-center gap-1">
                                  <RefreshCw className="w-3 h-3" /> {group.pendingCount}
                                </span>
                              </>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex flex-col items-center gap-1">
                            {group.maxAgeInDays !== undefined ? (
                              <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase items-center gap-1 border ${
                                (group.worstSeverity === 'critical' && group.maxAgeInDays >= 7) || (group.worstSeverity === 'high' && group.maxAgeInDays >= 30)
                                ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                                : 'bg-white/5 text-muted-foreground border-white/10'
                              }`} title="SLA : Âge de la vulnérabilité">
                                <Clock className="w-3 h-3" /> SLA {group.maxAgeInDays}j
                              </span>
                            ) : <span className="text-muted-foreground text-xs">-</span>}
                            
                            {group.targetPatch ? (
                              <span className="font-mono text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded border border-green-400/20">
                                ↳ {group.targetPatch}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-[10px]">Aucun patch</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <button 
                            onClick={(e) => createTicket(e, group.projectId, group.package)}
                            className="px-2.5 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors inline-flex items-center gap-2 text-xs font-semibold"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            Ticket
                          </button>
                          {tickets[group.key] && (
                            <div className="mt-2 text-xs flex justify-end">
                              <a href={`${jiraBaseUrl}${tickets[group.key].url}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline" onClick={e => e.stopPropagation()}>
                                {tickets[group.key].url}
                              </a>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>
          
          {(totalPages > 1 || packageGroups.length > 10) && (
            <div className="flex items-center justify-between glass-panel px-6 py-4 rounded-xl border border-border/50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Affichage {((page - 1) * itemsPerPage) + (packageGroups.length > 0 ? 1 : 0)} à {Math.min(page * itemsPerPage, packageGroups.length)} sur {packageGroups.length}
                </span>
                <select 
                  className="bg-black/40 border border-border/50 rounded-md px-2 py-1 text-sm outline-none focus:border-blue-500 font-mono text-muted-foreground cursor-pointer"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10 par page</option>
                  <option value={20}>20 par page</option>
                  <option value={50}>50 par page</option>
                  <option value={100}>100 par page</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  Précédent
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setPage(i + 1)}
                      className={`w-8 h-8 rounded flex items-center justify-center text-sm font-medium transition-colors ${page === i + 1 ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors"
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal for CVE Details */}
      {selectedGroup && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setSelectedGroup(null)}>
          <div className="w-full max-w-5xl max-h-[90vh] bg-background/95 backdrop-blur-xl border border-border/50 rounded-2xl flex flex-col shadow-2xl animate-in zoom-in-95 duration-300 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-border/50 flex items-center justify-between bg-black/20">
              <div>
                <h3 className="text-xl font-bold font-mono text-foreground flex items-center gap-3">
                  {selectedGroup.package}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Projet : <span className="font-semibold text-foreground">{selectedGroup.projectName}</span>
                </p>
              </div>
              <button onClick={() => setSelectedGroup(null)} className="p-2 rounded-full hover:bg-white/10 text-muted-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 bg-black/10">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {selectedGroup.cves.map((cveObj: any, i: number) => (
                <div key={i} className="flex flex-col gap-4 p-5 rounded-xl bg-card/40 border border-border/50 shadow-sm relative overflow-hidden hover:bg-card/60 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex flex-col gap-1.5 flex-1">
                      <h4 className="font-bold text-lg text-foreground flex items-center gap-2">
                        {cveObj.ref}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${SEVERITY_COLORS[cveObj.severity]}`}>
                          {cveObj.severity}
                        </span>
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {cveObj.title} {cveObj.versionRange && <span className="font-mono bg-white/5 px-1 rounded">({cveObj.versionRange})</span>}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 text-xs items-center">
                    {cveObj.cvssVector && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-muted-foreground cursor-help">
                            CVSS: {cveObj.cvssVector}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="font-mono text-xs whitespace-pre bg-gray-900 border-gray-700 text-gray-300 shadow-xl max-w-[400px]">
                          {buildCvssTooltip(cveObj.cvssVector)}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {cveObj.ageInDays !== undefined && (
                        <span className="font-mono px-2 py-1 rounded bg-white/5 border border-white/10 text-muted-foreground flex items-center gap-1" title={cveObj.publishedAt ? `Publiée le: ${new Date(cveObj.publishedAt).toLocaleString()}` : `Première détection: ${new Date(cveObj.firstSeenAt).toLocaleString()}`}>
                        <Clock className="w-3 h-3" /> SLA {cveObj.ageInDays}j
                        </span>
                    )}
                    {cveObj.fixedIn && (
                      <span className="font-mono px-2 py-1 rounded bg-green-500/10 text-green-400 border border-green-500/20">
                        Patch : {cveObj.fixedIn}
                      </span>
                    )}
                  </div>

                  {cveObj.link && (
                    <div className="flex items-center gap-3 mt-1">
                      <a href={cveObj.link} target="_blank" rel="noreferrer" className="text-sm text-blue-400 hover:underline flex items-center gap-1.5 font-medium">
                        <LinkIcon className="w-3.5 h-3.5" /> Avis de sécurité
                      </a>
                      <span className="w-1 h-1 rounded-full bg-white/20"></span>
                      <button 
                        onClick={async (e) => {
                          try {
                            const res = await fetch('/api/advisories/sync', {
                              method: 'POST',
                              body: JSON.stringify({ cve: cveObj.cve, link: cveObj.link })
                            });
                            const data = await res.json();
                            
                            if (data.success && data.advisory) {
                              const fixes = data.advisory.fixes || {};
                              const patches = Object.entries(fixes)
                                .filter(([k]) => k.includes(selectedGroup.package))
                                .flatMap(([_, v]: any) => v)
                                .map((v: any) => v.patched)
                                .filter(Boolean);
                              
                              const patchStr = patches.length > 0 ? Array.from(new Set(patches)).join(", ") : "Aucun";
                              
                              const publishedDate = data.advisory.published_at ? new Date(data.advisory.published_at) : (cveObj.firstSeenAt ? new Date(cveObj.firstSeenAt) : new Date());
                              const ageInDays = Math.floor((Date.now() - publishedDate.getTime()) / (1000 * 3600 * 24));
                              
                              setToast({
                                isOpen: true,
                                type: 'success',
                                title: `${cveObj.ref || cveObj.cve} mise à jour`,
                                message: (
                                  <div className="flex flex-col gap-1 mt-1">
                                    <span><strong>Package :</strong> {selectedGroup.package}</span>
                                    <span><strong>Correctif(s) :</strong> <span className="font-mono text-green-400">{patchStr}</span></span>
                                    <span><strong>Sévérité :</strong> <span className="uppercase">{data.advisory.severity}</span></span>
                                    <span><strong>Âge (SLA) :</strong> <span className="font-mono text-orange-400">{ageInDays}j</span></span>
                                  </div>
                                )
                              });
                              setTimeout(() => setToast(null), 8000);
                            } else {
                              setToast({ isOpen: true, type: 'error', title: 'Échec', message: data.error || 'Erreur inconnue' });
                              setTimeout(() => setToast(null), 5000);
                            }
                          } catch (err: any) {
                            setToast({ isOpen: true, type: 'error', title: 'Erreur', message: err.message });
                            setTimeout(() => setToast(null), 5000);
                          }
                        }}
                        className="text-sm text-muted-foreground hover:text-white flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> Forcer maj
                      </button>
                    </div>
                  )}

                  <hr className="border-border/50 my-2" />
                  
                  <div className="flex flex-wrap gap-2">
                    <button 
                      onClick={() => { updateStatus(cveObj.cve, selectedGroup.projectId, 'pending'); setSelectedGroup(null); }}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors ${cveObj.status === 'pending' ? 'bg-secondary text-foreground' : 'text-muted-foreground bg-white/5 hover:bg-secondary/80'}`}
                    >
                      À traiter
                    </button>
                    <button 
                      onClick={() => { handleConfirmCve(cveObj.cve, selectedGroup.projectId, cveObj.note || ''); setSelectedGroup(null); }}
                      className={`px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${cveObj.status === 'confirmed' ? 'bg-red-500/20 text-red-500 border border-red-500/30' : 'text-muted-foreground bg-white/5 hover:bg-red-500/10 hover:text-red-400'}`}
                    >
                      <Check className="w-3.5 h-3.5" /> Confirmé
                    </button>
                      <button 
                        onClick={() => { updateStatus(cveObj.cve, selectedGroup.projectId, 'ignored'); setSelectedGroup(null); }}
                        className={`px-3 py-2 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${cveObj.status === 'ignored' && !cveObj.isGlobal ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'text-muted-foreground bg-white/5 hover:bg-orange-500/10 hover:text-orange-400'}`}
                        title="Faux positif pour ce projet"
                      >
                        <X className="w-3.5 h-3.5" /> Faux positif
                      </button>
                    </div>
                  
                  {cveObj.note && (
                    <div className="text-sm text-muted-foreground bg-black/40 p-3 rounded-lg border border-white/5 relative group mt-2">
                      <span className="font-semibold block mb-1 text-foreground/80">Raison / Note :</span>
                      <p className="pr-8 whitespace-pre-wrap leading-relaxed">{cveObj.note}</p>
                      <button 
                        onClick={() => { handleConfirmCve(cveObj.cve, selectedGroup.projectId, cveObj.note); setSelectedGroup(null); }}
                        className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-white"
                        title="Modifier la note"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
              </div>
            </div>
          </div>
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

      {toast?.isOpen && (
        <div className={`fixed bottom-6 right-6 z-[200] max-w-sm w-full p-4 rounded-xl border shadow-2xl flex flex-col gap-2 animate-in slide-in-from-bottom-6 fade-in duration-300 ${
          toast.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-blue-500/10 border-blue-500/30 text-blue-400'
        } glass-panel`}>
          <div className="flex justify-between items-start">
            <h4 className="font-bold flex items-center gap-2">
              {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : toast.type === 'error' ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
              {toast.title}
            </h4>
            <button onClick={() => setToast(null)} className="text-current opacity-70 hover:opacity-100 transition-opacity"><X className="w-5 h-5" /></button>
          </div>
          <div className="text-sm opacity-90 mt-1">{toast.message}</div>
        </div>
      )}
    </div>
  );
}
