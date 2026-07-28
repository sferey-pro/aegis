import React, { useState, useEffect } from 'react';
import { X, FileText, CheckCircle2, Copy, Send, RefreshCw } from 'lucide-react';

export function TicketModal({
  ticketModal,
  setTicketModal,
  copyToClipboard,
  setToast,
  fetchTickets
}: {
  ticketModal: { isOpen: boolean; md: string; copied: boolean; group?: any };
  setTicketModal: (val: any) => void;
  copyToClipboard: () => void;
  setToast: (toast: any) => void;
  fetchTickets: () => void;
}) {
  const [content, setContent] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (ticketModal.isOpen) setContent(ticketModal.md);
  }, [ticketModal.isOpen, ticketModal.md]);

  if (!ticketModal.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="glass-panel w-full max-w-3xl rounded-2xl p-6 flex flex-col max-h-[85vh]">
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
        
        <textarea 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="flex-1 w-full overflow-auto bg-black/50 rounded-xl border border-white/5 p-4 relative font-mono text-sm text-gray-300 whitespace-pre-wrap outline-none focus:border-blue-500/50 transition-colors min-h-[400px]"
        />

        <div className="flex justify-end gap-3 mt-6">
          <button 
            onClick={() => setTicketModal({ ...ticketModal, isOpen: false })}
            className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
          >
            Fermer
          </button>
          <button 
            onClick={() => {
              setTicketModal({ ...ticketModal, md: content });
              setTimeout(copyToClipboard, 0);
            }}
            className="px-4 py-2 rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors flex items-center gap-2"
          >
            {ticketModal.copied ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {ticketModal.copied ? "Copié !" : "Copier"}
          </button>
          
          <button 
            onClick={async () => {
              if (!ticketModal.group) return;
              setCreating(true);
              try {
                const res = await fetch('/api/tickets/create', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    projectId: ticketModal.group.projectId,
                    packageName: ticketModal.group.package,
                    cves: ticketModal.group.cves.map((c: any) => c.cve),
                    description: content
                  })
                });
                const data = await res.json();
                if (data.success) {
                  setToast({ isOpen: true, type: 'success', title: 'Ticket Jira créé', message: `Le ticket ${data.ticketRef} a été créé avec succès.` });
                  fetchTickets();
                  setTicketModal({ ...ticketModal, isOpen: false });
                } else {
                  setToast({ isOpen: true, type: 'error', title: 'Erreur', message: data.error || 'Erreur lors de la création du ticket.' });
                }
              } catch (err: any) {
                setToast({ isOpen: true, type: 'error', title: 'Erreur', message: err.message });
              } finally {
                setCreating(false);
              }
            }}
            disabled={creating}
            className="px-5 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
          >
            {creating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Créer dans Jira
          </button>
        </div>
      </div>
    </div>
  );
}
