# Graph Report - economy  (2026-10-09)

## Corpus Check
- Corpus is ~8,545 words - fits in a single context window. You may not need a graph.

## Summary
- 205 nodes · 465 edges · 10 communities (8 shown, 2 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.84)
- Token cost: 45,652 input · 0 output

## Community Hubs (Navigation)
- Dépendances npm
- Authentification passkey
- Pages budget & requêtes
- Documentation & déploiement
- Config TypeScript
- Server actions budget
- UI partagée & navigation
- Layout racine & config Next
- En-têtes de sécurité

## God Nodes (most connected - your core abstractions)
1. `requireUser()` - 21 edges
2. `compilerOptions` - 17 edges
3. `Dashboard()` - 14 edges
4. `Operations()` - 13 edges
5. `next` - 13 edges
6. `Previsions()` - 11 edges
7. `Card()` - 11 edges
8. `localToday()` - 11 edges
9. `addRecurring()` - 9 edges
10. `getAccounts()` - 9 edges

## Surprising Connections (you probably didn't know these)
- `cents()` --calls--> `parseCents()`  [EXTRACTED]
  app/(app)/actions.ts → lib/forecast.ts
- `onSubmit()` --indirect_call--> `done()`  [INFERRED]
  app/login/passkey-forms.tsx → app/(app)/actions.ts
- `addRecurring()` --calls--> `addMonths()`  [EXTRACTED]
  app/(app)/actions.ts → lib/forecast.ts
- `addRecurring()` --calls--> `dayInMonth()`  [EXTRACTED]
  app/(app)/actions.ts → lib/forecast.ts
- `addRecurring()` --calls--> `localToday()`  [EXTRACTED]
  app/(app)/actions.ts → lib/forecast.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Passkey authentication security model** — readme_passkey_only_auth, readme_webauthn_challenges, readme_hashed_sessions, readme_setup_code, readme_origin_env, readme_simplewebauthn [INFERRED 0.85]
- **Budget forecast inputs and rule check** — readme_budget_forecast, readme_recurring_subscriptions, readme_planned_expenses, readme_minimum_balance_rule [INFERRED 0.85]

## Communities (10 total, 2 thin omitted)

### Community 0 - "Dépendances npm"
Cohesion: 0.05
Nodes (39): eslintConfig, dependencies, next, react, react-dom, @simplewebauthn/browser, @simplewebauthn/server, devDependencies (+31 more)

### Community 1 - "Authentification passkey"
Cohesion: 0.13
Nodes (29): ConfirmButton(), Reglages(), assertCanRegister(), authenticationOptions(), Cred, deletePasskey(), logout(), registrationOptions() (+21 more)

### Community 2 - "Pages budget & requêtes"
Cohesion: 0.18
Nodes (28): Operations(), Dashboard(), monthName(), Previsions(), Card(), EntryForm(), Money(), getAccounts() (+20 more)

### Community 3 - "Documentation & déploiement"
Cohesion: 0.13
Nodes (17): Next.js Agent Rules (breaking changes notice), Project Brief: Budget PWA, economy-data volume, economy compose service, pnpm allowBuilds (sharp, unrs-resolver disabled), Budget Forecast (month-end + 6-month projection), DATA_DIR env var, Economy (personal budget PWA) (+9 more)

### Community 4 - "Config TypeScript"
Cohesion: 0.10
Nodes (19): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+11 more)

### Community 5 - "Server actions budget"
Cohesion: 0.29
Nodes (15): addPlanned(), addRecurring(), addTransaction(), cents(), date(), deletable, deleteRow(), done() (+7 more)

### Community 6 - "UI partagée & navigation"
Cohesion: 0.21
Nodes (13): links, Nav(), AccountForm(), Comptes(), euros(), AppLayout(), button, DeleteButton() (+5 more)

### Community 7 - "Layout racine & config Next"
Cohesion: 0.18
Nodes (5): geistSans, metadata, viewport, nextConfig, next

## Knowledge Gaps
- **72 isolated node(s):** `deletable`, `links`, `geistSans`, `metadata`, `viewport` (+67 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 86 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `Layout racine & config Next` to `Dépendances npm`, `Authentification passkey`, `Pages budget & requêtes`, `Server actions budget`, `UI partagée & navigation`?**
  _High betweenness centrality (0.247) - this node is a cross-community bridge._
- **What connects `deletable`, `links`, `geistSans` to the rest of the system?**
  _72 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Dépendances npm` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._
- **Should `Authentification passkey` be split into smaller, more focused modules?**
  _Cohesion score 0.12692307692307692 - nodes in this community are weakly interconnected._
- **Should `Documentation & déploiement` be split into smaller, more focused modules?**
  _Cohesion score 0.12631578947368421 - nodes in this community are weakly interconnected._
- **Should `Config TypeScript` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._