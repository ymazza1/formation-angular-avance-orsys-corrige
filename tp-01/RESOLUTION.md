# TP 1 — Résolution pas à pas

On travaille sur `apprenant/tp-01`, un terminal sur `npm run test:structure`.
Le compteur de départ est à 17 rouges.

## Étape 1 — Poser les tags (6 tests)

**Fichier** `libs/livraison/domaine/project.json`, puis `libs/livraison/data-access/project.json` et `libs/partage/util/project.json`

**Pourquoi celui-là** — Un `project.json` est la seule chose que l'outillage sait
d'une bibliothèque : ses tags disent ce qu'elle *est* (sa couche, son périmètre),
jamais qui l'importe. C'est donc ici, et pas dans le code, que se pose la
frontière. Ouvrir d'abord un des `project.json` de `catalogue/*` : ce sont les
exemples, et ils couvrent déjà les types `domaine`, `data-access`, `ui` et
`feature`. Il ne reste à deviner que `util`, et les domaines `livraison` et
`partage`.

**Le test qui attend** `structure.spec.ts` › « livraison-domaine porte un tag de type »

```json
"tags": [
  "type:domaine",
  "domaine:livraison"
],
```

pour `livraison/domaine`, puis :

```json
"tags": [
  "type:data-access",
  "domaine:livraison"
],
```

pour `livraison/data-access`, et :

```json
"tags": [
  "type:util",
  "domaine:partage"
],
```

pour `partage/util`. Chaque tableau remplace `"tags": [],`.

**Ce qui passe au vert** — « 6 tests de plus, 11 restants. »

**Le piège** — Nx ne se plaint jamais d'un tag mal orthographié (`type:dommaine`) :
il le range simplement dans un groupe que plus aucune contrainte ne vise. Seuls
les tests de structure le voient. Et `livraison-data-access` est de type
`data-access` malgré son nom : c'est le dernier segment du chemin qui donne le type.

## Étape 2 — Déclarer les contraintes (6 tests)

**Fichier** `eslint.config.mjs`

**Pourquoi celui-là** — C'est le seul fichier où la règle `enforce-module-boundaries`
reçoit ses contraintes. Il a le droit de connaître les tags ; il ne connaît aucune
bibliothèque par son nom. Les tags étant posés à l'étape 1, on peut maintenant dire
ce que chacun a le droit d'importer. Deux axes cohabitent : la couche technique
(la dépendance va toujours vers le bas) et le domaine fonctionnel.

**Le test qui attend** `structure.spec.ts` › « une contrainte existe pour type:ui »

```js
depConstraints: [
  // axe technique : qui a le droit d'appeler quelle couche
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:util'] },
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:domaine', 'type:util'] },
  { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:domaine', 'type:util'] },
  { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:domaine', 'type:util'] },
  { sourceTag: 'type:domaine', onlyDependOnLibsWithTags: ['type:domaine', 'type:util'] },
  { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },

  // axe fonctionnel : qui a le droit de connaître quel domaine
  { sourceTag: 'domaine:boutique', onlyDependOnLibsWithTags: ['*'] },
  { sourceTag: 'domaine:catalogue', onlyDependOnLibsWithTags: ['domaine:catalogue', 'domaine:livraison', 'domaine:partage'] },
  { sourceTag: 'domaine:livraison', onlyDependOnLibsWithTags: ['domaine:livraison', 'domaine:partage'] },
  { sourceTag: 'domaine:partage', onlyDependOnLibsWithTags: ['domaine:partage'] },
],
```

Ce tableau remplace `depConstraints: [],` ; le reste de la règle ne change pas.

**Ce qui passe au vert** — « 11 tests de plus, 0 restant. » Les 6 de l'axe technique,
et les 5 du bonus qui lisaient cette configuration.

**Le piège** — Oublier qu'un type doit pouvoir importer **son propre type** :
`type:ui` sans `type:ui` dans sa liste interdirait à une lib `ui` d'en importer une
autre. Aucun test ne le voit au TP 1 (les bibliothèques sont vides), on le
découvrirait au TP 2. Et l'axe fonctionnel n'est vérifié que par les tests bonus :
sans eux, rien ne dit qu'on l'a écrit.

## Étape 3 — Provoquer une violation

**Fichier** `libs/catalogue/ui/src/index.ts`

**Pourquoi celui-là** — C'est le point d'entrée public de `catalogue/ui` : l'endroit
exact où un collègue pressé glisse un import de raccourci. On le provoque ici une
fois, pour reconnaître l'erreur plus tard.

**Le test qui attend** aucun test unitaire : `npx nx lint catalogue-ui` doit échouer,
puis redevenir vert après retrait.

```ts
import { CatalogueApi } from '@maison/catalogue/data-access';
```

Le lint répond :

```
A project tagged with "type:ui" can only depend on libs tagged with
"type:ui", "type:domaine", "type:util"   @nx/enforce-module-boundaries
```

Retirer ensuite la ligne : le lint passe au vert.

**Ce qui passe au vert** — Le compteur de tests ne bouge pas : c'est le lint qui
passe du rouge au vert après le retrait.

**Le piège** — Si l'erreur n'apparaît pas, c'est presque toujours que les tags de
`catalogue-ui` ou de `catalogue-data-access` manquent : sans tag, aucune contrainte
ne s'applique, et le lint reste vert à tort.

## Bonus — Les tags croisés

**Fichier** `tools/structure/structure.bonus.spec.ts`

**Pourquoi celui-là** — Les deux axes s'appliquent **en même temps**. Importer
`catalogue/domaine` depuis `livraison/domaine` passe l'axe technique (`domaine` →
`domaine`) et échoue sur l'axe fonctionnel. Le fichier lit la configuration comme
`structure.spec.ts`.

**Le test qui attend** `structure.bonus.spec.ts` › « livraison ne peut pas connaître le catalogue »

```ts
function contrainte(tagSource: string): string {
  const debut = CONFIG.indexOf(`sourceTag: '${tagSource}'`);
  if (debut === -1) return '';
  const fin = CONFIG.indexOf('}', debut);
  return CONFIG.slice(debut, fin === -1 ? undefined : fin);
}

it('livraison ne peut pas connaître le catalogue', () => {
  const livraison = contrainte('domaine:livraison');

  expect(livraison).toContain('domaine:livraison');
  expect(livraison).not.toContain('domaine:catalogue');
});
```

**Ce qui passe au vert** — Déjà verts une fois l'étape 2 écrite : 5 tests, rien à écrire.
Pour le voir en vrai, importer `@maison/catalogue/domaine` dans
`libs/livraison/domaine/src/index.ts` : le lint répond
`A project tagged with "domaine:livraison" can only depend on libs tagged with
"domaine:livraison", "domaine:partage"`.

**Le piège** — Chercher la contrainte par la première occurrence du tag :
`domaine:livraison` apparaît d'abord dans la liste autorisée du catalogue, plus haut
dans le fichier, et le test lirait la mauvaise ligne. On cherche la **déclaration**
(`sourceTag: '…'`).

## Bonus — Mesurer l'effet sur la CI

**Fichier** `libs/catalogue/ui/src/index.ts`, le seul modifié.

**Pourquoi celui-là** — Le graphe de dépendances que les tags rendent fiable sert
aussi à ne tester que ce qu'un changement touche.

**Le test qui attend** aucun test : on compare le nombre de projets exécutés.

```bash
git add -A && git commit -m "tags et frontières"
# modifier un fichier de libs/catalogue/ui, puis :
npx nx affected -t lint --base=HEAD
npx nx run-many -t lint
```

**Ce qui passe au vert** — Rien ne change dans le compteur : on lit un projet
contre huit.

**Le piège** — Si `affected` exécute **tout**, un fichier racine a changé sans être
commité, typiquement `package-lock.json` généré par `npm install` : Nx juge alors
tout affecté. Commiter d'abord, puis modifier le fichier.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| « porte un tag de type » échoue sur une lib | tag absent, mal orthographié, ou `tags` resté à `[]` |
| « une contrainte existe pour type:… » échoue | la ligne `sourceTag: 'type:…'` manque dans `eslint.config.mjs` |
| « un composant de présentation ne peut pas atteindre data-access » échoue | `type:data-access` figure dans la liste de `type:ui` |
| La violation de l'étape 3 ne lève aucune erreur | tags manquants sur `catalogue-ui` ou `catalogue-data-access` |
| Les tests bonus restent rouges après l'étape 2 | contrainte `domaine:…` non écrite, ou `domaine:livraison` autorise `domaine:catalogue` |
| `nx affected` exécute les huit projets | fichier racine modifié et non commité (`package-lock.json`) |
