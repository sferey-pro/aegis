import React from 'react';
import { AlertOctagon } from 'lucide-react';

export function ConfirmReasonModal({
  confirmModal,
  setConfirmModal,
  submitConfirm
}: {
  confirmModal: { isOpen: boolean; cve: string; projectId: number; reason: string } | null;
  setConfirmModal: (val: any) => void;
  submitConfirm: (e: React.FormEvent) => void;
}) {
  if (!confirmModal?.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setConfirmModal(null)}>
      <form onSubmit={submitConfirm} onClick={e => e.stopPropagation()} className="glass-panel w-full max-w-lg rounded-2xl p-6 flex flex-col gap-4">
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
  );
}
