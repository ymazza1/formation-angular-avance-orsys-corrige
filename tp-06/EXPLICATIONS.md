# TP 6 — Corrigé et notes d'animation

**Durée cible** 50 min · **Rouge → vert** 11 tests à écrire (13 rouges au départ, dont 2 bonus qui passent seuls à l'étape 2)

## Avertissement sur l'API

Signal Forms est **stable depuis Angular 22**, mais récente. Tout le code de ce
TP a été écrit contre `@angular/forms@22.1.6` et **compilé avec AOT et
`strictTemplates`** — les signatures sont vérifiées, pas supposées. Si vous
montez de version mineure, relancez `nx build` avant la session.

Points d'API confirmés :

| Élément | Forme exacte |
| --- | --- |
| Import | `@angular/forms/signals` |
| Création | `form(modeleSignal, schema)` → `FieldTree` |
| Schéma | `schema<T>((c) => { … })` |
| Directive | `FormField`, sélecteur `[formField]` |
| Champ | `commande.email` |
| État du champ | `commande.email()` → `.value()`, `.errors()`, `.touched()`, `.pending()`, `.valid()`, `.invalid()`, `.dirty()` |
| Erreur | un objet `{ kind, message? }` — pas de fabrique à importer |
| Asynchrone | `validateHttp(path, { request, onSuccess, onError })` |
| Soumission | `submit(form, action)` |

## Ce qui a été ajouté

| Bibliothèque | Fichiers | Côté apprenant | Tests |
| --- | --- | --- | --- |
| `commande/domaine` (**nouvelle**) | `commande.ts` — type, `FORMAT_CODE_POSTAL`, 3 règles de livraison | **fourni** | 11, verts dès l'ouverture |
| `commande/feature` (**nouvelle**) | `commande.schema.ts` | **vide** : étapes 1 et 2 | 11 (8 à écrire) + 2 bonus |
| | `commande.page.ts` | fourni sauf le champ email et la garde du bouton : étape 3 | 3 + 2 bonus (l'`effect`, fourni) |
| | `commande.routes.ts` | fourni | — |
| `catalogue/feature` | `catalogue.page.ts` : lien **Commander** dans le récapitulatif | fourni (défaut 10) | — |
| racine | `tsconfig.base.json`, `eslint.config.mjs`, `app.routes.ts`, `app.config.ts` | fourni (défaut 1) | — |

Le workspace passe à **13 projets**.

Les 13 rouges de départ : 7 (étape 1) + 1 (étape 2) + 3 (étape 3) + les 2
bonus de `commande.schema.bonus.spec.ts`, qui passent seuls dès que l'étape 2
est écrite. L'énoncé le dit ; redites-le, sinon un groupe cherche quoi écrire
dans le fichier bonus.

## Les points à faire vivre

### Le schéma vit hors du composant

C'est la décision structurante du TP, et le cœur des étapes 1 et 2.
`commande.schema.ts` exporte une fonction qui prend l'URL de base en
paramètre — pas d'injection, pas de dépendance au composant.

Conséquence, visible dans le spec : **la validation se teste sans monter
d'interface**. Pas de `createComponent`, pas de `fixture`, pas de clic.

Posez la question au groupe (question de fin n° 2) : *comment testeriez-vous la
même chose avec un `FormGroup` typé ?* La réponse honnête est qu'on peut le
faire aussi — mais qu'en pratique la construction du `FormGroup` finit dans le
composant, et les tests avec elle.

### Trois états, pas deux

Un formulaire complet dont la validation asynchrone est en cours :

```ts
champs.codePostal().pending()  // true
champs().valid()               // false
champs().invalid()             // false
```

Ni valide ni invalide. C'est ce qui permet de désactiver le bouton **sans**
afficher de message d'erreur — l'utilisateur n'a rien fait de mal, on attend.

J'ai découvert ce comportement en écrivant le test : j'attendais `valid()` à
`true` et j'ai eu `false`. C'est devenu le test le plus intéressant du TP.

Il fait le lien entre l'étape 2 et l'étape 3 : le bouton gardé sur `invalid()`
s'active pendant la vérification, et le test « garde le bouton désactivé tant
que la zone de livraison est en vérification » le refuse. La bonne garde est
`!commande().valid() || envoi()`.

### `required` ne marche pas sur un booléen

`required(c.accepteCgv)` ne fait rien d'utile : `false` n'est pas « vide ». Il
faut `validate` et renvoyer une erreur explicite. Les stagiaires tombent
systématiquement dessus, et c'est une bonne illustration de ce que « requis »
veut dire dans un système de validation — non nul, pas « vrai ».

### `onError` renvoie `undefined`

Si le service de vérification des codes postaux est en panne, on **n'empêche
pas** la commande. C'est une décision commerciale, pas technique : bloquer
100 % des commandes parce qu'un service auxiliaire est indisponible coûte plus
cher que livrer trois colis dans une zone mal desservie.

À faire dire au groupe plutôt qu'à énoncer — c'est le genre d'arbitrage qui ne
remonte jamais jusqu'au développeur dans la vraie vie. Le bonus « les erreurs
comme objets » le verrouille par un test (une panne 503 ne donne aucune erreur).

### Le troisième `effect` légitime (bonus)

```ts
effect(() => {
  const lignes = this.panier.lignes();
  this.modele.update((c) => ({ ...c, mode: modeCorrige(lignes, c.mode) }));
});
```

Il est **fourni** et passé en bonus : rien à écrire, mais la discussion vaut le
détour si le temps le permet.

Il est d'une **autre nature** que les deux précédents (surveillance de stock au
TP 4, persistance au TP 5). Ceux-là synchronisaient un système extérieur.
Celui-ci **répare un état saisi par l'utilisateur** quand le contexte change
sous lui.

Et il écrit dans un signal — ce que j'ai présenté comme suspect au TP 5.
Assumez la nuance : la règle n'est pas « un effet n'écrit jamais », c'est « un
effet ne **calcule** jamais ». Le mode est une donnée saisie, pas une donnée
dérivée : on ne peut pas la recalculer, seulement la corriger.

Si quelqu'un propose un `computed`, faites-lui écrire le code : il perdra la
sélection de l'utilisateur à chaque changement de panier.

## Déroulé conseillé

| Temps | Étape |
| --- | --- |
| 0-5 | Démonstration : ajouter un article, **Commander** ; « Valider la commande » est actif sur un formulaire vide. Montrer l'API : `form`, `schema`, `[formField]`, les trois niveaux de lecture |
| 5-20 | Étape 1 : le schéma de validation (7 tests), dont le piège des CGV |
| 20-32 | Étape 2 : la validation asynchrone et l'état à trois valeurs (1 test + 2 bonus qui passent seuls), **le cœur du TP** |
| 32-45 | Étape 3 : le formulaire (3 tests), la garde du bouton, puis le navigateur |
| 45-50 | Les deux questions de fin |

Les deux bonus (l'`effect` de correction, les erreurs comme objets) se font à
l'oral si le temps le permet. L'étape 2 ne se sacrifie pas : si vous êtes en
retard, donnez les messages de l'étape 1 et passez à `validateHttp`.

## Points où ça coince

**`form() must be called in an injection context`.**
Dans un test, envelopper avec `runInInjectionContext(TestBed.inject(Injector), …)`.
C'est ce que fait le helper `unFormulaire` du spec.

**Le test asynchrone n'attend jamais.**
`validateHttp` s'appuie sur `httpResource` : sans `provideHttpClient()` **et**
`provideHttpClientTesting()`, la requête ne part pas du tout.

**Un message attendu n'est pas trouvé.**
Message recopié avec une faute : comparer au spec, mot pour mot.

**Les messages d'erreur s'affichent d'emblée.**
Il manque le garde `@if (champ().touched())`.

**Le bouton s'active pendant « Vérification de la zone de livraison… ».**
Garde sur `invalid()` au lieu de `!valid()` : c'est le piège de l'étape 3.

**Pas de lien « Commander », ou pas de catalogue dans le navigateur.**
`app.config.ts` ou `catalogue.page.ts` ont été modifiés : ils sont fournis.

## Ce que ce TP prépare

- **TP 7** : `validateHttp` est un `httpResource` déguisé. Quand on réécrira la
  façade du catalogue avec `resource()`, les stagiaires auront déjà vu le modèle
  à l'œuvre.
- **TP 9** : la soumission réelle vers `POST /api/commandes`, avec le 409
  `stock_insuffisant` — et la réponse à la question laissée ouverte au TP 5.

## Vérification du corrigé

```bash
npm install --legacy-peer-deps
npx nx run-many -t test      # 13 projets verts
npm run test:structure       # vert
npx nx run-many -t lint      # vert
npx nx build boutique
```
