# TP 5 — Résolution pas à pas

On travaille sur `apprenant/tp-05`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 20 rouges, dont 15 à écrire. Les 5 autres passent
seuls : deux tests de persistance (code fourni, il leur faut un panier non vide)
et trois du code promo (bonus, il leur faut la remise et le total).

## Étape 1 — Le domaine du panier (8 tests)

**Fichier** `libs/panier/domaine/src/lib/panier.ts`

**Pourquoi celui-là** — Les règles du panier (bornes, fusion, retrait à zéro,
traduction vers la livraison) ne dépendent ni d'Angular ni du réseau. Elles
vivent dans des fonctions pures, testées sans `TestBed`. Le store, à l'étape 2,
n'aura plus qu'à les appeler. `ajouter`, fournie, montre la forme : lire,
`remplacer`, `borner`.

**Le test qui attend** `panier.spec.ts` › « borne au stock connu de la ligne »

```ts
export function retirer(panier: Panier, produitId: string): Panier {
  return panier.filter((ligne) => ligne.produitId !== produitId);
}

/** Une quantité nulle ou négative retire la ligne : c'est le geste attendu. */
export function changerQuantite(panier: Panier, produitId: string, quantite: number): Panier {
  if (quantite <= 0) return retirer(panier, produitId);

  const existante = panier.find((ligne) => ligne.produitId === produitId);
  if (!existante) return panier;

  // Le stock de référence est celui mémorisé dans la ligne : le domaine panier
  // n'a pas à interroger le catalogue.
  return remplacer(panier, produitId, {
    ...existante,
    quantite: borner(quantite, existante.stockDisponible),
  });
}

/** Traduction vers le vocabulaire du domaine livraison. */
export function versLignesLivrables(panier: Panier): readonly LigneLivrable[] {
  // Ni nom ni identifiant : la livraison n'a pas à connaître le produit.
  return panier.map((ligne) => ({
    poidsKg: ligne.poidsKg,
    volumeM3: ligne.volumeM3,
    quantite: ligne.quantite,
    montant: arrondirCentimes(ligne.prixUnitaire * ligne.quantite),
  }));
}
```

**Ce qui passe au vert** — 8 tests de plus, 12 restants (tous dans le store).

**Le piège** — `{ ...ligne }` dans `versLignesLivrables` : plus court, et le test
« ne laisse fuir ni le nom ni l identifiant du produit » échoue sur les clés.
Second piège : `if (quantite === 0)` au lieu de `<= 0`, et une saisie négative
crée une ligne à quantité 1 (via `borner`) au lieu de la retirer.

## Étape 2 — Les commandes du store (4 tests)

**Fichier** `libs/panier/data-access/src/lib/panier.store.ts`

**Pourquoi celui-là** — Le store est le seul porteur de l'état du panier dans
l'application : un signal privé en écriture. Ses commandes ne font que passer
la valeur courante au domaine et poser le résultat. Aucune règle ici : un `if`
dans une commande est une règle qui s'est trompée de fichier.

**Le test qui attend** `panier.store.spec.ts` › « produit une nouvelle référence à chaque modification »

```ts
  ajouter(produit: Produit, quantite = 1): void {
    this._lignes.update((panier) => ajouter(panier, produit, quantite));
  }

  retirer(produitId: string): void {
    this._lignes.update((panier) => retirer(panier, produitId));
  }

  changerQuantite(produitId: string, quantite: number): void {
    this._lignes.update((panier) => changerQuantite(panier, produitId, quantite));
  }

  vider(): void {
    this._lignes.set(PANIER_VIDE);
    // Un code promo n'a pas de sens sur un panier vide.
    this.retirerCodePromo();
  }
```

**Ce qui passe au vert** — 4 tests écrits, plus 2 de persistance et 1 du code
promo qui passent seuls : 7 de moins, 5 restants.

**Le piège** — `this._lignes().push(...)` : la version 2 du compteur du TP 4,
sur un tableau. TypeScript refuse (`Panier` est `readonly`), et c'est voulu.
Second piège : les méthodes du store portent le même nom que les fonctions du
domaine. Dans `ajouter()`, `ajouter(panier, …)` désigne bien la fonction
importée (les méthodes s'appellent par `this.`), mais le relire à voix haute
évite la confusion en séance.

## Étape 3 — La chaîne de dérivation (3 tests)

**Fichier** `libs/panier/data-access/src/lib/panier.store.ts`

**Pourquoi celui-là** — Un montant stocké finit toujours par diverger de son
détail. Les montants sont donc des `computed` du store, chacun appelant le
domaine. Le store connaît les stratégies de livraison (`STRATEGIES_LIVRAISON`,
injectées) : c'est le seul endroit qui réunisse le panier et la livraison.

**Le test qui attend** `panier.store.spec.ts` › « recalcule le total quand une quantité change »

```ts
  readonly sousTotal = computed(() => sousTotal(this._lignes()));

  readonly fraisLivraison = computed(() =>
    this.estVide() ? 0 : coutLivraison(versLignesLivrables(this._lignes()), this.strategies),
  );

  readonly remise = computed(() => remise(this.sousTotal(), this._remisePourcent()));

  // Construit sur les autres computed : une seule règle par montant.
  readonly total = computed(() =>
    arrondirCentimes(this.sousTotal() - this.remise() + this.fraisLivraison()),
  );
```

**Ce qui passe au vert** — 3 tests écrits, plus 2 du code promo qui passent
seuls : 0 restant.

**Le piège** — `total` recalculé depuis `_lignes` (`sousTotal(this._lignes()) + …`) :
les tests passent, mais la règle existe deux fois. Le montrer en ajoutant une
remise : le total d'une version et le sous-total de l'autre divergent dès qu'on
modifie l'une sans l'autre. Le garde `this.estVide() ? 0 : …` n'est **pas** exigé
par les tests : `coutLivraison([])` vaut déjà 0 (vérifié par mutation). Il rend
la règle lisible, il n'est pas une correction. Ne pas le présenter comme un
piège.

## Bonus — Le code promo

**Fichier** `libs/panier/data-access/src/lib/panier.store.ts` (fourni) et `panier.store.bonus.spec.ts`

**Pourquoi celui-là** — Trois issues réseau, trois états distincts dans le store :
le composant lit `erreurPromo()` sans `try`. C'est la discipline du TP 2 (une
promesse qui ne rejette jamais), appliquée à un cas où l'utilisateur agit.

**Le test qui attend** `panier.store.bonus.spec.ts` › « signale une panne de vérification »

```ts
  async appliquerCodePromo(code: string): Promise<void> {
    this._erreurPromo.set(null);
    try {
      const reponse = await firstValueFrom(
        this.http.get<ReponsePromotion>(`${this.base}/promotions/${code}`),
      );
      if (!reponse.valide) {
        this._erreurPromo.set('code_invalide');
        return;
      }
      this._codePromo.set(code);
      this._remisePourcent.set(reponse.remisePourcent ?? null);
    } catch {
      // Une panne n'est pas un code invalide : l'utilisateur réessaierait le
      // même code indéfiniment.
      this._erreurPromo.set('verification_impossible');
    }
  }
```

**Ce qui passe au vert** — Rien à écrire : 2 tests verts dès l'ouverture, 1
après l'étape 2 (`vider`), 2 après l'étape 3 (`remise`, `total`).

**Le piège** — Ajouter le champ de saisie dans la page et oublier qu'un
changement de panier ne revalide pas le code : la remise est un pourcentage,
elle suit le sous-total, c'est voulu.

## Bonus — La persistance, et le seul effect du store

**Fichier** `libs/panier/data-access/src/lib/panier.store.ts` (fourni)

**Pourquoi celui-là** — C'est le cas légitime de l'`effect` : synchroniser un
système extérieur (`localStorage`) avec un état réactif, sans calculer ni écrire
dans un signal. La restauration se fait une fois, dans le constructeur.

**Le test qui attend** `panier.store.spec.ts` › « repart d un panier vide si le contenu stocké est illisible »

```ts
  constructor() {
    this.restaurer();

    // Le seul effet du store : il synchronise le stockage du navigateur, il ne
    // calcule rien et n'écrit dans aucun signal.
    effect(() => {
      const contenu = JSON.stringify(this._lignes());
      try {
        localStorage.setItem(CLE_PERSISTANCE, contenu);
      } catch {
        // stockage plein ou navigation privée : le panier reste en mémoire
      }
    });
  }

  private restaurer(): void {
    try {
      const brut = localStorage.getItem(CLE_PERSISTANCE);
      if (brut) this._lignes.set(JSON.parse(brut) as Panier);
    } catch {
      // contenu illisible : on repart d'un panier vide plutôt que de planter
    }
  }
```

**Ce qui passe au vert** — Rien à écrire. Retirer le `try` de `restaurer()` fait
rougir « repart d un panier vide si le contenu stocké est illisible » (vérifié
par mutation).

**Le piège** — `TestBed.tick()` dans « écrit le panier dans le stockage local » :
un `effect` ne s'exécute pas de façon synchrone. Sans le `tick`, le test lirait
un stockage vide. C'est la raison pour laquelle un `effect` ne doit pas porter
d'état que d'autres lisent dans la foulée.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. Le `JSON.stringify` de l'effet s'exécute à chaque modification, même si le
   contenu est identique. Comment le savoir ? Faut-il s'en préoccuper ?
2. Ajouter le champ de code promo dans le récapitulatif de la page, avec les
   trois messages.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| « ne laisse fuir ni le nom ni l identifiant » échoue | `{ ...ligne }` ou `produitId` recopié dans `versLignesLivrables` |
| « retire la ligne sur une quantité négative » échoue | `quantite === 0` au lieu de `<= 0` |
| Erreur de type sur `push` dans le store | mutation du tableau : utiliser `update` et le domaine |
| « produit une nouvelle référence » échoue | une commande renvoie le même tableau (mutation dans le domaine) |
| « retire le code promo en vidant le panier » échoue | `vider()` n'appelle pas `retirerCodePromo()` |
| « recalcule le total » échoue mais le sous-total est bon | `total` sans `fraisLivraison`, ou sans `arrondirCentimes` |
| « applique le tarif volumineux » trouve 0 | `fraisLivraison` est resté à `0`, ou `this.strategies` non passé à `coutLivraison` |
| Les tests de persistance restent rouges après l'étape 2 | `TestBed.tick()` retiré du test, ou commande qui ne passe pas par `_lignes` |
| Tests verts, mais catalogue vide dans le navigateur avec un `NG0201` | `...fournirStrategiesLivraison()` retiré de `app.config.ts` (fourni) : les tests fournissent les stratégies eux-mêmes, l'application non (défaut 1) |
