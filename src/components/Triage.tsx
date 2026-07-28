import React, { useState, useEffect } from 'react';
import { X, Shield, RefreshCw, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { SEV_ORDER, compareVersions } from './triage/constants';
import { TriageTable } from './triage/TriageTable';
import { CveDetailsModal } from './triage/CveDetailsModal';
import { TicketModal } from './triage/TicketModal';
import { ConfirmReasonModal } from './triage/ConfirmReasonModal';

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
        if (occ.ageInDays !== undefined && occ.ageInDays > g.maxAgeInDays) {
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
          firstSeenAt: occ.firstSeenAt,
          publishedAt: occ.publishedAt
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
        payload.note = '';
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
    <div className="flex-1 w-full max-w-[1600px] px-4 md:px-8 mx-auto mt-8 z-10">
      
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
          <TriageTable 
            paginatedGroups={paginatedGroups}
            setSelectedGroup={setSelectedGroup}
            createTicket={createTicket}
            tickets={tickets}
            jiraBaseUrl={jiraBaseUrl}
          />
          
          {(totalPages > 1 || packageGroups.length > 10) && (
            <div className="flex items-center justify-between glass-panel px-6 py-4 rounded-xl border border-border/50">
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  Affichage {((page - 1) * itemsPerPage) + (packageGroups.length > 0 ? 1 : 0)} à {Math.min(page * itemsPerPage, packageGroups.length)} sur {packageGroups.length}
                </span>
                <select 
                  className="bg-black/60 border border-border/50 rounded-md px-2 py-1 text-sm outline-none focus:border-primary font-mono text-foreground cursor-pointer"
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option className="bg-gray-900 text-white" value={10}>10 par page</option>
                  <option className="bg-gray-900 text-white" value={20}>20 par page</option>
                  <option className="bg-gray-900 text-white" value={50}>50 par page</option>
                  <option className="bg-gray-900 text-white" value={100}>100 par page</option>
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

      <CveDetailsModal 
        selectedGroup={selectedGroup}
        setSelectedGroup={setSelectedGroup}
        updateStatus={updateStatus}
        handleConfirmCve={handleConfirmCve}
        setToast={setToast}
        tickets={tickets}
        jiraBaseUrl={jiraBaseUrl}
      />

      <TicketModal 
        ticketModal={ticketModal}
        setTicketModal={setTicketModal}
        copyToClipboard={copyToClipboard}
      />

      <ConfirmReasonModal 
        confirmModal={confirmModal}
        setConfirmModal={setConfirmModal}
        submitConfirm={submitConfirm}
      />

      {toast?.isOpen && (
        <div className={`fixed bottom-6 right-6 z-[200] max-w-sm w-full p-4 rounded-xl border shadow-2xl flex flex-col gap-2 glass-panel ${
          toast.type === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
          'bg-blue-500/10 border-blue-500/30 text-blue-400'
        }`}>
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
