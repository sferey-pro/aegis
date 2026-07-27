import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Shield, Activity, Trash2, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

export function Reports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<number | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchReports = async () => {
    setIsFetching(true);
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      setReports(data);
      // Reset to page 1 if data changes and current page is out of bounds
      if (currentPage > Math.ceil(data.length / itemsPerPage)) {
        setCurrentPage(1);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetching(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleDelete = async (id: number) => {
    setReportToDelete(id);
  };

  const confirmDelete = async () => {
    if (reportToDelete === null) return;
    try {
      await fetch(`/api/reports/${reportToDelete}`, { method: 'DELETE' });
      setReportToDelete(null);
      fetchReports();
    } catch (e) {
      console.error(e);
    }
  };

  const totalPages = Math.max(1, Math.ceil(reports.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentReports = reports.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-heading">Rapports d'Audit</h2>
          <p className="text-muted-foreground mt-1">Consultez l'historique des audits globaux de votre écosystème.</p>
        </div>
        <button 
          onClick={fetchReports}
          disabled={isFetching}
          className="group p-2 rounded hover:bg-white/5 transition-all duration-300 active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 text-muted-foreground transition-transform duration-500 group-hover:rotate-180 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading ? (
        <div className="glass-panel p-12 rounded-xl flex justify-center items-center backdrop-blur-xl bg-white/5 border border-white/10">
          <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        </div>
      ) : reports.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl flex flex-col items-center justify-center text-center gap-4 backdrop-blur-xl bg-white/5 border border-white/10">
          <FileText className="w-16 h-16 text-muted-foreground opacity-50 animate-pulse drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]" />
          <div>
            <h3 className="text-xl font-bold">Aucun rapport</h3>
            <p className="text-muted-foreground mt-2">Lancez un audit global (bouton en haut à droite) pour générer votre premier rapport.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="glass-panel rounded-xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg shadow-black/20">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-black/40 border-b border-white/10 text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Projets</th>
                    <th className="px-6 py-4 font-semibold">Vulnérabilités</th>
                    <th className="px-6 py-4 font-semibold">Répartition</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {currentReports.map((r: any) => (
                    <tr key={r.id} className="group hover:bg-white/[0.02] transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <Calendar className="w-4 h-4" />
                          </div>
                          <span className="font-bold">
                            {new Date(r.created_at + "Z").toLocaleString('fr-FR', {
                              day: '2-digit', month: 'short', year: 'numeric',
                              hour: '2-digit', minute: '2-digit'
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-muted-foreground font-medium">{r.projects_audited} analysés</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-4 h-4 text-primary" />
                            <span className="text-xl font-light">{r.total_vulnerabilities}</span>
                          </div>
                          {r.counts.critical > 0 && (
                            <div className="flex items-center gap-1.5 text-red-400">
                              <Activity className="w-4 h-4" />
                              <span className="font-bold">{r.counts.critical} Crit.</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {(r.counts.high > 0) && <span className="text-xs px-2.5 py-0.5 font-medium bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20">{r.counts.high} Haut</span>}
                          {(r.counts.moderate > 0) && <span className="text-xs px-2.5 py-0.5 font-medium bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">{r.counts.moderate} Modéré</span>}
                          {(r.counts.low > 0) && <span className="text-xs px-2.5 py-0.5 font-medium bg-green-500/10 text-green-500 rounded-full border border-green-500/20">{r.counts.low} Bas</span>}
                          {r.total_vulnerabilities === 0 && <span className="text-xs text-muted-foreground">Aucune faille détectée</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button 
                          onClick={() => handleDelete(r.id)}
                          className="p-2 text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Supprimer le rapport"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 mt-2">
              <span className="text-sm text-muted-foreground">
                Affichage de {startIndex + 1} à {Math.min(startIndex + itemsPerPage, reports.length)} sur {reports.length} rapports
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-border/50 bg-background/50 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="text-sm font-medium px-2">
                  Page {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-border/50 bg-background/50 text-muted-foreground hover:bg-white/10 hover:text-foreground disabled:opacity-50 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={reportToDelete !== null}
        title="Supprimer le rapport"
        message="Voulez-vous vraiment supprimer ce rapport d'audit ?"
        confirmText="Supprimer"
        onConfirm={confirmDelete}
        onCancel={() => setReportToDelete(null)}
      />
    </div>
  );
}
