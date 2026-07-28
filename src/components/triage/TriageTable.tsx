import React from 'react';
import { Shield, RefreshCw, AlertOctagon, FileText } from 'lucide-react';
import { SEVERITY_COLORS, SEVERITY_ICONS } from './constants';

export function TriageTable({
  paginatedGroups,
  setSelectedGroup,
  createTicket,
  tickets,
  jiraBaseUrl
}: {
  paginatedGroups: any[];
  setSelectedGroup: (group: any) => void;
  createTicket: (e: React.MouseEvent, group: any) => void;
  tickets: Record<string, any>;
  jiraBaseUrl: string;
}) {
  return (
    <div className="glass-panel rounded-xl overflow-hidden backdrop-blur-xl bg-white/5 border border-white/10 shadow-lg shadow-black/20">
      <div className="w-full overflow-x-auto pb-2">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead className="bg-black/40 border-b border-white/10 text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-white/10 hover:bg-transparent">
              <th className="px-6 py-4 sticky left-0 bg-black/40 backdrop-blur z-10 border-r border-white/10 min-w-[300px] font-semibold">Cible (Package & Projet)</th>
              <th className="px-6 py-4 text-center font-semibold">Impact & SLA</th>
              <th className="px-6 py-4 text-center font-semibold">Patch Recommandé</th>
              <th className="px-6 py-4 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {paginatedGroups.map((group) => {
              return (
                <React.Fragment key={group.key}>
                  <tr 
                    className={`cursor-pointer transition-colors border-white/5 hover:bg-white/[0.02] ${group.hasConfirmed ? 'bg-red-950/20' : ''}`}
                    onClick={() => setSelectedGroup(group)}
                  >
                    <td className="px-6 py-4 sticky left-0 bg-white/5 backdrop-blur z-10 border-r border-white/10 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg border ${group.hasConfirmed ? 'bg-red-500/20 border-red-500 text-red-500' : SEVERITY_COLORS[group.worstSeverity]} shadow-sm`}>
                          {group.hasConfirmed ? <AlertOctagon className="w-5 h-5 text-red-500 animate-pulse" /> : SEVERITY_ICONS[group.worstSeverity]}
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold font-mono text-sm ${group.hasConfirmed ? 'text-red-400' : 'text-foreground'}`}>
                              {group.package}
                            </span>
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
                          <div className="flex items-center gap-2 mt-1 opacity-80">
                            <span className="font-medium text-xs text-muted-foreground">{group.projectName}</span>
                            <span className="px-1.5 py-0.5 rounded bg-secondary/50 text-[9px] uppercase font-mono text-muted-foreground border border-white/5">{group.tool}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center gap-2">
                        <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-black/20 border border-white/5 rounded-md text-xs shadow-inner">
                          <span className="font-bold flex items-center gap-1.5 text-foreground/90"><Shield className="w-3.5 h-3.5 text-muted-foreground" /> {group.cves.length}</span>
                          {group.pendingCount > 0 && (
                            <>
                              <span className="w-px h-3 bg-white/20"></span>
                              <span className="text-primary font-medium flex items-center gap-1.5">
                                <RefreshCw className="w-3.5 h-3.5" /> {group.pendingCount}
                              </span>
                            </>
                          )}
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 ${
                          group.maxAgeInDays > 30 ? 'bg-red-500/10 text-red-400 border border-red-500/30' : 
                          group.maxAgeInDays > 15 ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : 
                          'bg-green-500/10 text-green-400 border border-green-500/30'
                        }`}>
                          SLA : {group.maxAgeInDays > 0 ? `${group.maxAgeInDays}j` : 'Nouveau'}
                        </span>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <div className="flex flex-col items-center justify-center h-full">
                        {group.targetPatch ? (
                          <span className="font-mono text-xs font-bold text-green-400 bg-green-500/10 px-2.5 py-1 rounded-md border border-green-500/20 shadow-sm flex items-center gap-1">
                            ↳ {group.targetPatch}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs italic px-2 py-1 bg-white/5 rounded-md border border-white/5">Aucun patch</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right whitespace-nowrap">
                      <button 
                        onClick={(e) => createTicket(e, group)}
                        className="px-2.5 py-1.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors inline-flex items-center gap-2 text-xs font-semibold"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Ticket
                      </button>
                      {tickets[group.key] && (
                        <div className="mt-2 text-xs flex justify-end">
                          <a href={`${jiraBaseUrl.replace(/\/$/, '')}/browse/${tickets[group.key].url}`} target="_blank" rel="noreferrer" className="text-blue-400 hover:underline" onClick={e => e.stopPropagation()}>
                            {tickets[group.key].url}
                          </a>
                        </div>
                      )}
                    </td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
