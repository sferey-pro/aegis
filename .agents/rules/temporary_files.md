<RULE[temporary_files_management]>
# Gestion des fichiers temporaires et scripts utilitaires

Lorsqu'un agent crée des scripts utilitaires ponctuels (par exemple des scripts Node.js/Python pour faire des remplacements massifs, parser des fichiers, manipuler du texte comme `fix_*.js`, `replace_*.js`, etc.), il **NE DOIT PAS** les placer à la racine du projet.

**Tous les fichiers temporaires et scripts de manipulation créés par l'IA doivent être générés et exécutés exclusivement dans le dossier suivant :**
`./.agents/scratch/`

Ce dossier est ignoré par Git. Ne laissez jamais de fichiers "poubelles" ou temporaires à la racine du projet ou au milieu du code source.
</RULE[temporary_files_management]>
