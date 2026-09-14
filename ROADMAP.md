# 🗺️ Roadmap Évolutive - Aegis

Ce document liste des idées et pistes d'amélioration futures pour étendre les capacités d'Aegis, notamment autour du moteur d'analyse, tout en conservant sa philosophie de centralisation et de performance.

## 1. Extension de la Couverture d'Audit (Écosystèmes)
Actuellement, Aegis gère excellemment l'écosystème JS/TS (npm, yarn, bun) et PHP (composer). L'évolution naturelle est d'englober d'autres stacks courantes :
- **Python :** Intégration de `pip-audit` ou analyse des `poetry.lock`.
- **Go :** Intégration de `govulncheck`.
- **Rust :** Support de `cargo-audit`.
- **Java / Ruby :** Support de `bundler-audit` ou plugins Maven/Gradle.
- **Images Docker :** Intégration de scanners de conteneurs comme `Trivy` ou `Grype` pour auditer le système de base en plus des paquets applicatifs.

## 2. Au-delà du SCA (Software Composition Analysis)
- **SAST (Static Application Security Testing) :** Intégration d'outils comme `Semgrep` pour détecter non seulement les failles de dépendances, mais aussi les failles dans le code source écrit par les développeurs (injections SQL, XSS, secrets en dur).
- **Génération & Import SBOM :** Capacité à générer et ingérer des nomenclatures logicielles (SBOM - *Software Bill of Materials*) aux formats standards de l'industrie (CycloneDX, SPDX).

## 3. Remédiation Proactive
- **Auto-Génération de Pull Requests :** À l'instar de Dependabot ou Renovate, Aegis pourrait proposer un bouton "Remédier" qui déclenche automatiquement la création d'une branche et d'une PR poussant la version corrigée identifiée par le système.
- **IA pour la Remédiation :** Utilisation des *Prompts* déjà présents dans Aegis pour interroger un LLM afin d'obtenir un plan de mise à jour sécurisé pour une dépendance qui aurait introduit des *breaking changes*.

## 4. Notifications et Webhooks
- **Intégrations de ChatOps :** Envoi d'alertes en temps réel sur Slack, Microsoft Teams ou Discord lorsqu'une CVE de sévérité critique est découverte lors d'une ingestion CI ou d'un scan automatique.
- **Webhooks génériques :** Permettre à des systèmes tiers de s'abonner aux événements d'Aegis (ex: `on_new_critical_cve`).

## 5. Rapports et Exports Avancés
- **Rapports Exécutifs :** Génération de rapports PDF automatisés orientés pour le management (graphiques de tendance, temps moyen de résolution SLA).
- **Export CSV/JSON complets :** Pour permettre à d'autres outils d'ingérer l'état de la sécurité du parc.

## 6. Accessibilité et Mode Multi-utilisateurs
- **RBAC (Role-Based Access Control) :** Si Aegis s'étend, implémenter des rôles (Admin, Security Officer, Developer) avec des droits en lecture seule pour certains profils.
- **Authentification SSO (SAML/OIDC) :** Pour une intégration fluide dans le système d'information de l'entreprise.
