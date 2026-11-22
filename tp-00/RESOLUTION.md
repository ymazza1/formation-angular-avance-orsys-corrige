# TP 0 — Résolution pas à pas

On travaille sur `apprenant/tp-00`, deux terminaux ouverts : un pour l'API, un pour
le reste. Le compteur est lu après l'installation : 7 rouges.

## Étape 1 — Installer le workspace

**Fichier** `package.json`

**Pourquoi celui-là** — C'est le seul fichier du TP 0 qui décide de ce qui s'installe,
et il porte les scripts qu'on utilisera pendant trois jours (`test:environnement`,
`api`, `start`). Il a le droit de fixer les versions (Angular 22, TypeScript 6.0,
Nx 23) ; il ne contient aucun code applicatif. Le `--legacy-peer-deps` vient de lui :
quelques paquets de l'écosystème déclarent encore des plages de pairs antérieures à
Angular 22.

**Le test qui attend** `environnement.spec.ts` › « a installé les dépendances du workspace »

```bash
node --version                      # 22 ou plus récent
npm install --legacy-peer-deps
npm run test:environnement
```

**Ce qui passe au vert** — Les 6 tests « poste de travail » et « versions attendues ».
Il reste 7 rouges : les 4 tests de l'API éteinte et les 3 de `API_URL`.

**Le piège** — Lancer `npm install` sans `--legacy-peer-deps` : l'installation peut
échouer sur un conflit de versions de pairs, et on perd dix minutes avant le TP 1.
Et `node --version` en dessous de 22 : le premier test le dit avant tout le reste.

## Étape 2 — Lancer l'API et l'application

**Fichier** `api/server.js`

**Pourquoi celui-là** — L'API vit dans `api/`, avec son propre `package.json` et ses
propres dépendances, indépendamment du workspace Angular. Ce fichier sait servir les
20 produits, les comptes de démonstration et les trois modes (normal, `--instable`,
`--jeton-court`) ; le workspace n'a pas à savoir comment elle fonctionne, seulement
où elle écoute : le port 3333.

**Le test qui attend** `environnement.spec.ts` › « répond sur /api/sante »

```bash
npm --prefix ./api install     # une seule fois
npm run api                    # terminal dédié, il y reste trois jours
```

Dans le premier terminal :

```bash
npm run test:environnement     # 10 verts
npx nx serve boutique          # http://localhost:4200 : un lien « Maison&Co », page vide
```

Dans le navigateur : <http://localhost:3333/api/sante> répond
`{"statut":"ok","produits":20,…}` et <http://localhost:3333/api/produits> sert le
catalogue.

**Ce qui passe au vert** — « 4 tests de plus, 3 restants. » Les 4 de « API de
démonstration ».

**Le piège** — Oublier `npm --prefix ./api install` : l'API a son propre
`node_modules`, et elle ne démarre pas sans lui. Second piège : fermer le terminal de
l'API « pour y voir plus clair » — tous les TP suivants en dépendent.

## Étape 3 — Brancher `API_URL` (3 tests)

**Fichier** `libs/partage/util/src/lib/api-url.ts`

**Pourquoi celui-là** — C'est le seul endroit qui connaît l'adresse de l'API. Un
`InjectionToken` plutôt qu'une constante exportée la rend remplaçable en test (le
quatrième test, déjà vert, le prouve) et configurable par déploiement. Aucun
composant n'écrit jamais `localhost:3333`.

**Le test qui attend** `api-url.spec.ts` › « est une URL absolue »

```ts
export const API_URL = new InjectionToken<string>('api-url', {
  providedIn: 'root',
  // Sans barre finale : les appelants écrivent `${base}/produits`.
  factory: () => 'http://localhost:3333/api',
});
```

**Ce qui passe au vert** — « 3 tests de plus, 0 restant. »

**Le piège** — `'/api/'` : le test « sans barre oblique finale » échoue. Et
`'localhost:3333/api'` sans le protocole : « est une URL absolue » échoue. Aucun
des deux ne casse la compilation.

## Bonus — Vérifier la version de Node

**Fichier** `tools/environnement/environnement.spec.ts`

**Pourquoi celui-là** — Le test « tourne sur Node 22 ou plus récent » vérifie
`process.versions.node` : un poste trop ancien échoue ici, avec un message clair,
plutôt qu'au milieu du TP 2 avec une erreur de syntaxe.

**Le test qui attend** `environnement.spec.ts` › « tourne sur Node 22 ou plus récent »

```ts
it('tourne sur Node 22 ou plus récent', () => {
  const majeure = Number(process.versions.node.split('.')[0]);

  expect(majeure).toBeGreaterThanOrEqual(22);
});
```

**Ce qui passe au vert** — Déjà vert : rien à écrire. À montrer en cas de poste en
retard (`nvm install 22`, puis relancer l'installation).

**Le piège** — Changer de version de Node sans refaire `npm install` : les binaires
natifs installés avant ne correspondent plus.

## Bonus — Installer l'outillage navigateur

**Fichier** aucun : ce sont des extensions, pas du code.

**Pourquoi celui-là** — Angular DevTools sert dès le jour 2 (onglets *Components* et
*Profiler*) ; mieux vaut qu'il soit installé avant d'en avoir besoin.

**Le test qui attend** aucun test : on ouvre les DevTools sur `localhost:4200`, les
onglets *Components* et *Profiler* doivent apparaître.

```text
Angular DevTools     https://angular.dev/tools/devtools
VS Code              extension « Angular Language Service »
```

**Ce qui passe au vert** — Rien ne change dans le compteur.

**Le piège** — Ouvrir les DevTools sur un onglet non-Angular : les onglets Angular
n'apparaissent pas, et l'on croit l'extension mal installée.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| « a installé les dépendances du workspace » échoue | `npm install --legacy-peer-deps` pas lancé dans ce dossier |
| « Angular 22 » / « Nx 23 » échoue | installation faite avec une autre version, ou `node_modules` d'un autre TP |
| « API de démonstration » échoue : « L'API ne répond pas » | API non lancée, ou lancée sans `npm --prefix ./api install` |
| « est une URL absolue » échoue | protocole `http://` manquant |
| « sans barre oblique finale » échoue | `/api/` au lieu de `/api` |
