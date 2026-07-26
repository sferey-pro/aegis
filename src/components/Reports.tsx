import React, { useState, useEffect } from 'react';
import { FileText, Calendar, Shield, Activity, Trash2, RefreshCw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

export function Reports() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportToDelete, setReportToDelete] = useState<number | null>(null);

  const fetchReports = async () => {
    try {
      const res = await fetch('/api/reports');
      setReports(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
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

  return (
    <div className="flex-1 w-full max-w-6xl mx-auto mt-8 z-10 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-bold font-heading">Rapports d'Audit</h2>
          <p className="text-muted-foreground mt-1">Consultez l'historique des audits globaux de votre écosystème.</p>
        </div>
        <button 
          onClick={fetchReports}
          className="p-2 rounded hover:bg-white/5 transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="glass-panel p-12 rounded-xl flex justify-center items-center backdrop-blur-xl bg-white/5 border border-white/10">
            <RefreshCw className="w-8 h-8 text-primary animate-spin" />
          </div>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reports.map((r: any) => (
            <div key={r.id} className="group glass-panel p-6 rounded-xl flex flex-col gap-4 backdrop-blur-xl bg-white/5 border border-white/10 hover:border-primary/30 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold">
                      {new Date(r.created_at + "Z").toLocaleString('fr-FR', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </h3>
                    <p className="text-xs text-muted-foreground">{r.projects_audited} projets analysés</p>
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(r.id)}
                  className="p-2 text-muted-foreground hover:text-destructive transition-all rounded-md hover:bg-destructive/10 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-2">
                <div className="bg-black/20 rounded-lg p-3 border border-white/5 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Shield className="w-3.5 h-3.5 text-primary" />
                    Vulnérabilités
                  </span>
                  <span className="text-3xl font-light text-white">
                    {r.total_vulnerabilities}
                  </span>
                </div>
                <div className="bg-black/20 rounded-lg p-3 border border-white/5 flex flex-col justify-center">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5" />
                    Critiques
                  </span>
                  <span className="text-3xl font-light text-red-400">
                    {r.counts.critical || 0}
                  </span>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2 mt-2">
                {(r.counts.high > 0) && <span className="text-xs px-3 py-1 font-medium bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20">{r.counts.high} Haut</span>}
                {(r.counts.moderate > 0) && <span className="text-xs px-3 py-1 font-medium bg-yellow-500/10 text-yellow-500 rounded-full border border-yellow-500/20">{r.counts.moderate} Modéré</span>}
                {(r.counts.low > 0) && <span className="text-xs px-3 py-1 font-medium bg-green-500/10 text-green-500 rounded-full border border-green-500/20">{r.counts.low} Bas</span>}
              </div>
            </div>
          ))}
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
