# TP 4 — Résolution pas à pas

On travaille sur `apprenant/tp-04`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 10 rouges, dont 9 à écrire : le dixième est le bonus
« ignore une erreur réseau sans perdre la valeur connue », qui passe seul au vert
après l'étape 1.

## Étape 1 — Voir le bug, puis écrire l'état

**Fichier** `libs/catalogue/feature/src/lib/catalogue.page.ts` (le temps de la
démonstration), puis `libs/catalogue/data-access/src/lib/stock.store.ts`

**Pourquoi celui-là** — La démonstration vit dans la page parce qu'elle ne
dépend d'aucun code du TP : on voit le bug avant d'avoir écrit une ligne de
store, et on l'efface. L'état, lui, vit dans le store : c'est le seul endroit
qui reçoive les réponses du réseau, donc le seul qui doive savoir qu'une mise à
jour se fait par une nouvelle `Map`. Le badge et la page ne font que lire.

Les trois versions du compteur sont dans l'énoncé, à taper telles quelles. Le
geste à montrer : la version 2 (`this.compteurSignal().valeur += 1`) laisse
l'écran à 0 alors que la valeur est dans un signal. La phrase à obtenir du
groupe : *un signal surveille sa référence, pas ce qu'elle contient*.

**Le test qui attend** `stock.store.spec.ts` › « produit une nouvelle référence à chaque mise à jour »

```ts
  // Lecture réactive : la lecture de `_stocks()` crée la dépendance, même
  // depuis une méthode appelée dans un template.
  quantite(id: string): number | null {
    return this._stocks().get(id)?.quantite ?? null;
  }

  estDisponible(id: string): boolean | null {
    return this._stocks().get(id)?.disponible ?? null;
  }

  // La Map précédente n'est jamais modifiée : c'est la nouvelle référence qui
  // notifie les signaux dépendants.
  private enregistrer(etat: EtatStock): void {
    this._stocks.update((precedents) => new Map(precedents).set(etat.id, etat));
  }
```

**Ce qui passe au vert** — 5 tests écrits, plus le bonus « ignore une erreur
réseau » qui passe seul : 6 de moins, 4 restants.

**Le piège** — `this._stocks().set(etat.id, etat)` : la version 2 du compteur,
transposée à la `Map`. « expose la quantité reçue » passe (la `Map` mutée
contient bien la valeur) ; seul « produit une nouvelle référence » échoue. Dans
le navigateur, les badges resteraient sur « vérification » jusqu'au prochain
clic. Second piège : `?? null` oublié, et `quantite` renvoie `undefined` pour un
produit jamais interrogé.

## Étape 2 — Surveiller avec un effect

**Fichier** `libs/catalogue/feature/src/lib/catalogue.page.ts`

**Pourquoi celui-là** — Le store ne sait pas quels produits sont affichés, et
ne doit pas le savoir : c'est la façade qui le sait, et seule la page connaît
les deux. La page est la racine de composition de l'écran ; c'est elle qui relie
la liste affichée à la surveillance.

**Le test qui attend** `catalogue.page.spec.ts` › « surveille le stock des produits affichés, et suit leur changement »

```ts
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { CatalogueFacade, StockStore } from '@maison/catalogue/data-access';
import { Piece, Produit } from '@maison/catalogue/domaine';
import { BadgeStockComponent, CarteProduitComponent } from '@maison/catalogue/ui';

// … dans le décorateur :
  imports: [CarteProduitComponent, BadgeStockComponent],

// … dans la grille du template, sous la carte :
            <mc-badge-stock [quantite]="stocks.quantite(produit.id)" />

// … dans la classe :
  protected readonly stocks = inject(StockStore);

  constructor() {
    this.facade.rafraichir();

    // Un effect légitime : il ne calcule rien, il synchronise un service
    // extérieur (une minuterie) avec un état réactif.
    effect(() => {
      const ids = this.facade.produits().map((produit) => produit.id);
      if (ids.length > 0) this.stocks.surveiller(ids);
    });
  }
```

**Ce qui passe au vert** — 2 tests de plus, 2 restants. « ne surveille rien tant
qu aucun produit n est affiché » était vert dès l'ouverture ; il protège la
garde `ids.length > 0`.

**Le piège** — `[quantite]="stocks.quantite"` sans parenthèses : erreur de type
au build, et la tentation de « corriger » en passant la méthode au badge. Il faut
l'**appeler**, c'est l'appel qui lit le signal. La question « pourquoi pas un
`computed` » : un `computed` calcule une valeur et n'agit sur rien ; Angular ne
l'évalue que si quelqu'un le lit. Un `computed` qui appellerait `surveiller()`
lancerait des requêtes au gré des lectures, et jamais si personne ne lit.

## Étape 3 — Le nettoyage : la minuterie qui fuit

**Fichier** `libs/catalogue/data-access/src/lib/stock.store.ts`

**Pourquoi celui-là** — La minuterie est créée dans le store : c'est lui qui la
libère. Ni la page ni un test ne devraient avoir à se souvenir d'appeler
`arreter()`. Le store est `providedIn: 'root'`, son `DestroyRef` est celui de
l'injecteur racine.

**Le test qui attend** `stock.store.spec.ts` › « s arrête seul quand l injecteur est détruit »

```ts
import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';

// … dans la classe :

  constructor() {
    // Le nettoyage est déclaré au même endroit que la ressource qu'il libère.
    inject(DestroyRef).onDestroy(() => this.arreter());
  }

  surveiller(ids: readonly string[]): void {
    // Une seule minuterie à la fois : la liste précédente n'a plus d'intérêt.
    this.arreter();
    this._surveilles.set([...ids]);
    this.rafraichir();
    this.minuterie = setInterval(() => this.rafraichir(), PERIODE_STOCK_MS);
  }

  arreter(): void {
    if (this.minuterie === null) return;
    clearInterval(this.minuterie);
    this.minuterie = null;
  }
```

**Ce qui passe au vert** — 2 tests de plus, 0 restant.

**Le piège** — Oublier `this.arreter()` en tête de `surveiller()` : aucun test
ne le voit (« repart de zéro » ne compte que les requêtes immédiates), mais
l'onglet Réseau, si. Après trois changements de filtre, trois rafales toutes les
quinze secondes. C'est la démonstration de l'énoncé : la faire **avant**
d'écrire le correctif. Second piège : `onCleanup` cité par la spec du TP. Il
s'agit de la même idée côté `effect` (la fonction reçue par l'effet, appelée
avant sa prochaine exécution) ; le store n'a pas d'effet, il utilise
`DestroyRef`.

## Bonus — Mesurer au Profiler

**Fichier** aucun : Angular DevTools, onglet *Profiler*, sur `nx serve`.

**Pourquoi celui-là** — Le zoneless se mesure : sans Zone.js, seul un signal
modifié déclenche un cycle. Le Profiler le montre là où les tests ne peuvent pas.

**Le test qui attend** aucun ; trente secondes d'inactivité enregistrées.

```ts
// Rien à écrire. La mutation à essayer, puis à retirer, dans StockStore :
quantite(id: string): { valeur: number | null } {
  return { valeur: this._stocks().get(id)?.quantite ?? null };
}
```

**Ce qui passe au vert** — Rien. On relève le nombre de cycles déclenchés par
les réponses de stock et les composants revérifiés, à comparer au TP 10 (chiffres
non figés ici : ils dépendent de la machine). Avec la mutation ci-dessus, chaque
badge reçoit un nouvel objet à chaque cycle.

**Le piège** — Profiler un build de production sans DevTools activés, ou une
page restée en arrière-plan : la minuterie tourne, mais le navigateur bride
`setInterval` dans un onglet caché.

## Bonus — `linkedSignal` sur la quantité

**Fichier** `libs/catalogue/ui/src/lib/quantite-choisie.bonus.spec.ts`

**Pourquoi celui-là** — Le composant vit dans le fichier de test : le bonus
n'ajoute pas de code au projet. Il montre le troisième outil, entre `computed`
(dérivé, non modifiable) et `signal` + `effect` (modifiable, mais synchronisé à
la main) : l'état local dérivé d'une source.

**Le test qui attend** `quantite-choisie.bonus.spec.ts` › « garde le choix de l utilisateur quand le stock change sans le contredire »

```ts
readonly choisie = linkedSignal<number | null, number>({
  source: this.stock,
  // On garde le choix de l'utilisateur tant que le stock le permet : c'est
  // `precedent` qui fait la différence avec un `computed`.
  computation: (stock, precedent) => Math.min(precedent?.value ?? 1, stock ?? 0),
});
```

**Ce qui passe au vert** — Verts dès l'ouverture, rien à écrire. Remplacer
`precedent?.value ?? 1` par `1` fait rougir 2 tests sur 4 (vérifié par
mutation) : ceux où l'utilisateur a choisi 4.

**Le piège** — Écrire la forme courte `linkedSignal(() => Math.min(1, this.stock() ?? 0))` :
elle ne voit pas la valeur précédente, et le choix est perdu au premier
rafraîchissement du stock, toutes les quinze secondes.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. Le `setInterval` tourne quand l'onglet est en arrière-plan. Suspendre la
   surveillance sur `visibilitychange`. Où placer ce code pour qu'il reste
   testable ?
2. Remplacer le `setInterval` par `interval` + `switchMap`. Qu'est-ce que ça
   simplifie ? Comment respecter le test de structure sur les `subscribe` ?

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| La quantité reste `null` après le `flush` | `enregistrer` mute la `Map` en place, ou lève encore (l'erreur est avalée par le `catch` d'`interroger`) |
| « produit une nouvelle référence » échoue seul | `this._stocks().set(...)` au lieu de `update` avec une nouvelle `Map` |
| `quantite` renvoie `undefined` | `?? null` oublié |
| Les tests de la page échouent sur `surveiller` jamais appelé | l'`effect` est hors du constructeur (hors contexte d'injection), ou lit `produits` sans l'appeler |
| Aucun badge dans la page | `BadgeStockComponent` absent des `imports` du composant |
| Deux séries de requêtes en parallèle dans l'onglet Réseau | `arreter()` oublié en tête de `surveiller` |
| « s arrête seul quand l injecteur est détruit » échoue, « arreter stoppe » passe | `DestroyRef` non déclaré dans le constructeur |
| `test:structure` rouge | un `detectChanges()` ou un `NgZone` resté de la démonstration de l'étape 1 |
