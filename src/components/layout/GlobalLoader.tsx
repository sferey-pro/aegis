import React from 'react';
import { Shield, Loader2 } from 'lucide-react';

export function GlobalLoader({
  loading,
  auditing,
  loadingMessage,
  auditProgress,
  auditMessageIndex
}: {
  loading: boolean;
  auditing: boolean;
  loadingMessage: string;
  auditProgress: { current: number; total: number; name: string } | null;
  auditMessageIndex: number;
}) {
  if (!loading && !auditing) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center flex-col gap-6 bg-background/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/20 blur-[100px] rounded-full pointer-events-none"></div>
      
      <div className="relative flex items-center justify-center w-24 h-24 rounded-full bg-primary/10 neon-glow shadow-2xl z-10">
        <div className="absolute inset-0 border-[3px] border-primary/20 border-t-primary rounded-full animate-spin"></div>
        <Shield className="w-10 h-10 text-primary" />
      </div>
      
      <div className="z-10 flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold font-heading text-gradient">AEGIS</h1>
        <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          {loading ? loadingMessage : (
            auditProgress 
              ? `${["Scan des dépendances", "Recherche GHSA", "Calcul de la criticité", "Génération des patchs"][auditMessageIndex]} de ${auditProgress.name} .... ${auditProgress.current}/${auditProgress.total}`
              : "Démarrage de l'audit global..."
          )}
        </div>
      </div>
    </div>
  );
}
