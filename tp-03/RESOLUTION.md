# TP 3 — Résolution pas à pas

On travaille sur `apprenant/tp-03`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 8 rouges, tous dans `catalogue.facade.spec.ts`.

Un seul fichier est modifié pendant tout le TP :
`libs/catalogue/data-access/src/lib/catalogue.facade.ts`. Seul le pipeline de
`etat` change : la source `demandes`, `toSignal`, les `computed` et les commandes
sont fournis et ne bougent pas.

## Étape 1 — Une seule requête pour une frappe

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — La façade est le seul endroit qui voie passer les
demandes *dans le temps*. Le composant ne connaît qu'une frappe à la fois ;
l'API ne connaît qu'une requête. Décider qu'une rafale de frappes vaut une seule
requête est une politique d'accès aux données : elle vit ici. La règle « pas de
requête pour une lettre », elle, est une règle métier : elle reste dans le
domaine (`rechercheExploitable`), la façade ne fait que l'appeler.

D'abord la démonstration, sans rien modifier : `cd api && npm run start:instable`,
`npx nx serve boutique`, onglet Réseau, taper « canapé » vite. On compte six
requêtes, des réponses dans le désordre, et après une 503 plus rien ne se charge,
même avec « Réessayer ». Ce sont les trois étapes du TP.

**Le test qui attend** `catalogue.facade.spec.ts` › « ne part qu une fois pour une frappe rapide »

```ts
import {
  appliquer,
  Filtres,
  FILTRES_VIDES,
  Produit,
  rechercheExploitable,
} from '@maison/catalogue/domaine';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  mergeMap,
  of,
  startWith,
  Subject,
} from 'rxjs';

// … dans la classe :

  private readonly etat = toSignal(
    this.demandes.pipe(
      // Le filtre passe AVANT le debounce : une lettre seule ne doit même pas
      // retarder la demande précédente.
      filter((f) => rechercheExploitable(f.recherche)),
      // Le silence signale la fin du mot ; `throttleTime` émettrait pendant
      // qu'on tape encore.
      debounceTime(DELAI_FRAPPE_MS),
      distinctUntilChanged(memesFiltres),

      mergeMap((filtres) =>
        this.api.rechercher(filtres).pipe(
          map((page): EtatCatalogue => ({ page, erreur: null, chargement: false })),
          startWith<EtatCatalogue>({ page: PAGE_VIDE, erreur: null, chargement: true }),
        ),
      ),
      catchError(() =>
        of<EtatCatalogue>({ page: PAGE_VIDE, erreur: 'catalogue_indisponible', chargement: false }),
      ),
    ),
    { initialValue: ETAT_INITIAL },
  );
```

**Ce qui passe au vert** — 3 tests de plus, 5 restants.

**Le piège** — Remplacer `memesFiltres` par `JSON.stringify(a) === JSON.stringify(b)`.
Ça passe aujourd'hui, et ça cassera silencieusement le jour où quelqu'un
réordonnera les champs de `Filtres`. Le comparateur explicite, lui, échoue à la
compilation quand le type change. Second piège, en navigateur : taper
« canapé » vite et ne voir qu'une requête, puis conclure que le TP est fini.
Taper lentement : plusieurs requêtes partent encore, et leurs réponses peuvent
toujours se croiser. C'est l'étape 2.

## Étape 2 — Annuler au lieu d'ignorer

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — Même fichier, même pipeline : l'opérateur d'aplatissement
décide de ce que deviennent les requêtes en vol quand une nouvelle demande
arrive. Pour une recherche, la réponse précédente n'a plus aucune valeur.

**Le test qui attend** `catalogue.facade.spec.ts` › « n affiche jamais le résultat d une recherche abandonnée »

```ts
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  startWith,
  Subject,
  switchMap,
} from 'rxjs';

// … dans le pipeline, à la place de mergeMap :

      // Se désabonner d'une requête HttpClient l'annule : la réponse périmée
      // n'existe plus, elle ne peut donc rien écraser.
      switchMap((filtres) =>
        this.api.rechercher(filtres).pipe(
          map((page): EtatCatalogue => ({ page, erreur: null, chargement: false })),
          startWith<EtatCatalogue>({ page: PAGE_VIDE, erreur: null, chargement: true }),
        ),
      ),
```

**Ce qui passe au vert** — 2 tests de plus, 3 restants.

**Le piège** — Les réponses aux deux questions de l'énoncé. `mergeMap` laisse
vivre les deux requêtes : la plus lente arrive en dernier et écrase la plus
récente, c'est le bug de la démonstration. `concatMap` les sert dans l'ordre,
mais fait attendre la dernière frappe derrière toutes les autres. Et `switchMap`
est dangereux sur une action à effet de bord (valider une commande) : annuler une
requête partie ne garantit pas que le serveur ne l'a pas traitée. Là, c'est
`exhaustMap`.

## Étape 3 — Survivre aux erreurs

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — L'erreur réseau appartient à *une* requête, pas à la
suite des demandes. La façade est le bon endroit pour la convertir en état
d'interface (`erreur: 'catalogue_indisponible'`) : le composant n'a aucun `catch`
à écrire, il lit un signal.

**Le test qui attend** `catalogue.facade.spec.ts` › « survit à l erreur : la recherche suivante fonctionne »

```ts
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  of,
  retry,
  startWith,
  Subject,
  switchMap,
  timer,
} from 'rxjs';

// … le pipeline complet :

  private readonly etat = toSignal(
    this.demandes.pipe(
      filter((f) => rechercheExploitable(f.recherche)),
      debounceTime(DELAI_FRAPPE_MS),
      distinctUntilChanged(memesFiltres),
      switchMap((filtres) =>
        this.api.rechercher(filtres).pipe(
          // Délai croissant : réessayer trois fois en 30 ms sur un serveur qui
          // sature ne fait qu'aggraver la situation.
          retry({ count: TENTATIVES, delay: (_, tentative) => timer(200 * 2 ** (tentative - 1)) }),
          map((page): EtatCatalogue => ({ page, erreur: null, chargement: false })),
          // À l'intérieur : l'erreur ne termine que la requête courante, le flux
          // des demandes continue.
          catchError(() =>
            of<EtatCatalogue>({ page: PAGE_VIDE, erreur: 'catalogue_indisponible', chargement: false }),
          ),
          // En dernier dans le pipe, il préfixe tout ce qui précède : l'état de
          // chargement part avant la réponse, à chaque requête.
          startWith<EtatCatalogue>({ page: PAGE_VIDE, erreur: null, chargement: true }),
        ),
      ),
    ),
    { initialValue: ETAT_INITIAL },
  );
```

**Ce qui passe au vert** — 3 tests de plus, 0 restant.

**Le piège** — C'est le moment à démontrer en direct. Ajouter d'abord le seul
`retry` en laissant le `catchError` fourni à l'extérieur : il reste **un** rouge,
« survit à l erreur » (mesuré). Une erreur non interceptée termine le flux
définitivement ; `toSignal` garde l'état d'erreur pour toujours, le `Subject`
émet dans le vide, et « Réessayer » ne fait plus rien. En production, ça se
traduit par « il faut que je rafraîchisse de temps en temps ». Le déplacer
après le `map` : tout passe. Second piège : `tentative - 1`. La première reprise
porte le numéro 1, on veut `2 ** 0`, donc 200 ms.

## Bonus — `toSignal` et l'exposition sans souscription

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.bonus.spec.ts`

**Pourquoi celui-là** — `toSignal` est la frontière entre RxJS (à l'entrée) et
les signals (au centre et dans le template). Sa promesse, se désabonner avec
l'injecteur, ne se voit pas dans le code : seul un test la rend visible.

**Le test qui attend** `catalogue.facade.bonus.spec.ts` › « la requête en cours est annulée quand l injecteur est détruit »

```ts
describe('toSignal et le nettoyage', () => {
  it('la requête en cours est annulée quand l injecteur est détruit', () => {
    facade.rafraichir();
    laisserPasserLaFrappe();
    const enCours = http.expectOne(() => true);

    // Détruire le module de test détruit l'injecteur racine : c'est lui que
    // `toSignal` surveille pour se désabonner, sans une ligne de notre part.
    TestBed.resetTestingModule();

    expect(enCours.cancelled).toBe(true);
  });
});
```

**Ce qui passe au vert** — Vert dès l'ouverture, rien à écrire. Ajouter
`manualCleanup: true` aux options de `toSignal` le fait passer au rouge
(vérifié par mutation).

**Le piège** — Croire que `initialValue` est optionnel par confort : sans lui le
signal vaut `undefined` jusqu'à la première émission, et chaque `computed` doit
s'en protéger. Les deux autres tests du fichier (filtres : retour en page 1,
réinitialisation) sont verts eux aussi dès l'ouverture.

## Bonus — Le garde-fou « aucune souscription manuelle »

**Fichier** `tools/structure/souscriptions.spec.ts`

**Pourquoi celui-là** — Une règle d'équipe qui n'est pas vérifiée finit par être
oubliée. Celle-ci tient en une expression régulière sur le code applicatif ; les
fichiers de test en sont exclus, y souscrire est légitime.

**Le test qui attend** `souscriptions.spec.ts` › « aucun subscribe manuel dans le code applicatif »

```ts
// La mutation à faire en séance, puis à retirer : remplacer `toSignal` par
private readonly _etat = signal<EtatCatalogue>(ETAT_INITIAL);

constructor() {
  this.demandes.pipe(/* … le pipeline … */).subscribe((etat) => this._etat.set(etat));
}
```

**Ce qui passe au vert** — Vert dès l'ouverture. La mutation le fait passer au
rouge avec le nom du fichier fautif ; `npm run test:structure` est nécessaire,
`nx run-many -t test` ne lance pas `tools/structure`.

**Le piège** — Rendre `demandes` public pour « simplifier » un test : le second
test du fichier refuse tout `Subject` public dans une façade. N'importe quel
composant pourrait alors pousser des demandes en contournant les commandes.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. Le `debounceTime` retarde aussi les **clics** sur les filtres, pour rien.
   Séparer la frappe de la sélection en deux flux fusionnés par `merge`. Quel
   test faudrait-il ajouter ?
2. Ajouter `shareReplay({ bufferSize: 1, refCount: true })` et observer ce que
   ça change si deux composants consomment la façade. Retirer `refCount` et
   observer la fuite.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| `debounceTime` ne se déclenche jamais en test | `vi.useFakeTimers()` appelé après `TestBed.inject` (fourni : ne devrait pas arriver) |
| « ne part qu une fois » trouve 4 requêtes | `debounceTime` placé dans le `pipe` interne, après le `mergeMap` |
| La deuxième recherche ne part pas | `memesFiltres` compare un champ de trop, ou `distinctUntilChanged()` sans comparateur |
| « ne part pas pour une seule lettre » échoue | `filter` oublié, ou placé après le `switchMap` |
| Les requêtes ne sont pas annulées | `mergeMap` resté en place, ou un `subscribe` dans le `switchMap` |
| Seul « survit à l erreur » reste rouge | `catchError` à l'extérieur du `switchMap` |
| « réessaie deux fois » trouve une requête de trop ou de moins | `count: TENTATIVES + 1`, ou `retry` placé après `catchError` |
| L'état de chargement n'apparaît jamais | `startWith` placé dans le `pipe` externe |
| `test:structure` rouge | un `.subscribe(` dans le code applicatif, ou `demandes` rendu public |
