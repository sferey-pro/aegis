import React from 'react';
import { X, FileText, CheckCircle2, Copy } from 'lucide-react';

export function TicketModal({
  ticketModal,
  setTicketModal,
  copyToClipboard
}: {
  ticketModal: { isOpen: boolean; md: string; copied: boolean };
  setTicketModal: (val: any) => void;
  copyToClipboard: () => void;
}) {
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
  );
}
