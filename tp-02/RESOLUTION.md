# TP 2 — Résolution pas à pas

On travaille sur `apprenant/tp-02`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 29 rouges.

## Étape 1 — Le domaine : produit (5 tests, 7 de plus pour la carte)

**Fichier** `libs/catalogue/domaine/src/lib/produit.ts`

**Pourquoi celui-là** — C'est la règle la plus basse de l'édifice : elle ne doit
connaître ni Angular, ni RxJS, ni l'API. Tout le reste (carte, façade, page)
dépend de ce fichier ; l'écrire en premier, c'est écrire ce que les autres
n'auront plus à décider. Ouvrir d'abord `estVolumineux` juste en dessous : c'est
la forme cible, un test de seuil dit en une ligne.

**Le test qui attend** `produit.spec.ts` › « arrondit au centime »

```ts
export function prixEffectif(prix: Prix): number {
  // Sans remise, on rend le prix catalogue tel quel : il est déjà en centimes.
  if (prix.remisePourcent === null) return prix.catalogue;
  // L'arrondi est ici, dans le domaine : 249,9 × 0,9 vaut 224.91000000000003 en
  // flottants, et aucun composant ne doit avoir à s'en soucier.
  return Math.round(prix.catalogue * (1 - prix.remisePourcent / 100) * 100) / 100;
}

export function estDisponible(produit: Produit): boolean {
  // Dès une unité : « disponible » est une décision métier, pas un seuil technique.
  return produit.stock > 0;
}
```

**Ce qui passe au vert** — « 12 tests de plus, 17 restants. » Les 5 de
`produit.spec.ts`, et les 7 de la carte qui appelait ces deux fonctions.

**Le piège** — Oublier le cas sans remise : `1 - null / 100` vaut `1`, ça
« marche » en JavaScript, mais TypeScript refuse de compiler. Et un arrondi
placé dans le template de la carte ferait passer les tests du domaine et
laisser la page fausse.

## Étape 2 — Le port : le DTO (6 tests, 3 de plus pour l'API)

**Fichier** `libs/catalogue/data-access/src/lib/produit.dto.ts`

**Pourquoi celui-là** — C'est le seul fichier qui a le droit de connaître à la
fois le DTO (`prix_ttc`, `poids_kg`, `nb_avis`) et le modèle de domaine. Ni le
domaine, qui ne connaît pas l'API, ni la carte, qui ne connaît que `Produit`.
Si l'API renomme un champ, c'est ici et seulement ici que ça se corrige.
`catalogue.api.ts`, à côté, est fourni : il appelle `versProduit`, c'est là qu'on
voit où la fonction est utilisée.

**Le test qui attend** `produit.dto.spec.ts` › « ne laisse fuir aucun nom de champ du DTO »

```ts
export function versProduit(dto: ProduitDto): Produit {
  return {
    id: dto.id,
    nom: dto.nom,
    description: dto.description,
    // L'API renvoie une chaîne ; le domaine attend une union. Le cast est
    // assumé ici, à la frontière, et nulle part ailleurs.
    piece: dto.piece as Piece,
    matiere: dto.matiere as Matiere,
    prix: { catalogue: dto.prix_ttc, remisePourcent: dto.promotion },
    gabarit: { poidsKg: dto.poids_kg, volumeM3: dto.volume_m3 },
    stock: dto.stock,
    avis: { note: dto.note, nombre: dto.nb_avis },
    image: dto.image,
  };
}
```

**Ce qui passe au vert** — « 9 tests de plus, 8 restants. » Les 6 de
`produit.dto.spec.ts`, et les 3 de `catalogue.api.spec.ts` qui passaient par
`versProduit`.

**Le piège** — Renvoyer `{ ...dto, prix: … }` : tous les tests de regroupement
passent, et le dernier échoue, parce que `prix_ttc` fuit dans le modèle. On
reconstruit l'objet champ par champ, on ne le propage pas.

## Étape 3 — La façade (8 tests)

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — La façade est la seule chose que la page connaît du
catalogue. Elle a le droit de savoir qu'on charge, qu'on peut échouer, et que
les filtres changent. Elle n'a pas le droit de laisser sortir un signal en
écriture ni un `Observable` : sinon la page peut modifier l'état sans passer par
une commande nommée, et le TP 7 ne pourra pas remplacer l'implémentation sans
toucher à la page.

**Le test qui attend** `catalogue.facade.spec.ts` › « renseigne l erreur sans rejeter la promesse »

```ts
@Injectable({ providedIn: 'root' })
export class CatalogueFacade {
  private readonly api = inject(CatalogueApi);

  private readonly _filtres = signal<Filtres>(FILTRES_VIDES);
  private readonly _page = signal<PageProduits>(PAGE_VIDE);
  private readonly _chargement = signal(false);
  private readonly _erreur = signal<string | null>(null);

  readonly filtres = this._filtres.asReadonly();
  readonly enChargement = this._chargement.asReadonly();
  readonly erreur = this._erreur.asReadonly();

  // Dérivées de _page : jamais stockées, sinon elles pourraient diverger.
  readonly produits = computed<readonly Produit[]>(() => this._page().items);
  readonly total = computed<number>(() => this._page().total);
  readonly facettes = computed<Facettes>(() => this._page().facettes);

  // L'erreur devient un état : aucun appelant n'a de `catch` à écrire.
  async charger(): Promise<void> {
    this._chargement.set(true);
    this._erreur.set(null);
    try {
      this._page.set(await this.api.rechercher(this._filtres()));
    } catch {
      this._page.set(PAGE_VIDE);
      this._erreur.set('catalogue_indisponible');
    } finally {
      // Dans `finally` : le chargement se termine aussi sur une erreur.
      this._chargement.set(false);
    }
  }

  rechercher(recherche: string): void {
    this.modifier({ recherche });
  }

  filtrerParPiece(piece: Filtres['piece']): void {
    this.modifier({ piece });
  }

  filtrerParMatiere(matiere: Filtres['matiere']): void {
    this.modifier({ matiere });
  }

  trier(tri: Filtres['tri']): void {
    this.modifier({ tri });
  }

  allerALaPage(page: number): void {
    this.modifier({ page });
  }

  reinitialiser(): void {
    this._filtres.set(FILTRES_VIDES);
    void this.charger();
  }

  // `void` est explicite : on n'attend pas le chargement, et on ne laisse pas
  // une promesse non gérée traîner. La règle « la sélection ramène en page 1 »
  // vit dans appliquer(), pas ici.
  private modifier(modification: Partial<Filtres>): void {
    this._filtres.update((filtres) => appliquer(filtres, modification));
    void this.charger();
  }
}
```

**Ce qui passe au vert** — « 8 tests de plus, 0 restant. »

**Le piège** — Mettre `_chargement.set(false)` après le `try` au lieu de
`finally` : tout est vert sauf « renseigne l erreur… », où `enChargement()`
reste à `true` pour toujours. Second piège : stocker `produits` dans un signal
en écriture « pour simplifier » — les tests passent, et le jour où une commande
oublie de le mettre à jour, la page affiche un état périmé.

## Bonus — La recherche et les accents

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.api.bonus.spec.ts`

**Pourquoi celui-là** — C'est un test de lecture, pas d'écriture : la règle
« `etagere` trouve `Étagère` » vit dans l'API (`api/server.js`, `sansAccents`).
Le client transmet la saisie telle quelle ; `versParams` ne fait que retirer les
espaces autour. Le test fige cette frontière.

**Le test qui attend** `catalogue.api.bonus.spec.ts` › « transmet la saisie accentuée sans la normaliser »

```ts
it('transmet la saisie accentuée sans la normaliser', () => {
  expect(versParams({ ...FILTRES_VIDES, recherche: 'étagère' }).get('q')).toBe('étagère');
});
```

**Ce qui passe au vert** — Déjà vert à l'ouverture : 3 tests, rien à écrire.

**Le piège** — Normaliser dans `versParams` « pour aider » : la recherche
marche, mais la règle existe maintenant en deux endroits qui divergeront au
premier changement côté serveur.

## Bonus — Les stratégies de livraison en multi-providers

**Fichier** `libs/livraison/data-access/src/lib/strategies.bonus.spec.ts`

**Pourquoi celui-là** — `strategies.providers.ts` est le seul endroit qui sait
quelles règles de livraison existent. Ajouter une règle, c'est y ajouter un
provider, jamais modifier `coutLivraison`. Le test le prouve avec une stratégie
`LivraisonExpress` définie dans le test lui-même.

**Le test qui attend** `strategies.bonus.spec.ts` › « change de résultat si l ordre des providers change »

```ts
it('change de résultat si l ordre des providers change', () => {
  const ordreInverse = [new LivraisonStandard(), new LivraisonExpress(), new LivraisonVolumineux()];

  expect(coutLivraison([COLIS_LEGER], ordreInverse)).toBe(9.9);
});
```

**Ce qui passe au vert** — Déjà vert à l'ouverture : 4 tests, rien à écrire.

**Le piège** — Déclarer `LivraisonExpress` après `LivraisonStandard` : le
standard accepte tout, l'express n'est jamais choisi, et aucun test ne
plante tant qu'on n'asserte pas le résultat. L'ordre est une décision.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| `TP 2 — … reste à écrire` dans la carte alors qu'elle est fournie | l'étape 1 n'est pas terminée : la carte appelle `prixEffectif` et `estDisponible` |
| `TP 2 — versProduit reste à écrire` dans `catalogue.api.spec.ts` | l'étape 2 n'est pas terminée : l'API appelle `versProduit` |
| « arrondit au centime » attend `224.91` et reçoit `224.91000000000003` | `Math.round(… * 100) / 100` oublié |
| « ne laisse fuir aucun nom de champ du DTO » échoue | l'objet est propagé avec `...dto` au lieu d'être reconstruit |
| « renseigne l erreur sans rejeter la promesse » échoue | le `catch` manque, ou la promesse est relancée |
| `enChargement()` reste à `true` après une erreur | `_chargement.set(false)` n'est pas dans `finally` |
| Un test de façade échoue sur `expectOne` | la commande ne déclenche pas `charger()`, ou la requête part deux fois |
