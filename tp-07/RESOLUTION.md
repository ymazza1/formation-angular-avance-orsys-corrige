# TP 7 — Résolution pas à pas

On travaille sur `apprenant/tp-07`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 13 rouges, tous dans `catalogue-data-access`, dont
11 à écrire. Les 2 autres sont les tests du bonus « ce qu'on garde, ce qu'on
perd », qui passent seuls à l'étape 1.

Le point de départ **fonctionne** : c'est la façade RxJS du TP 3. Le dire avant
toute chose, sinon le groupe cherche un bug. Les tests décrivent une autre
implémentation (chargement sans appel à `rafraichir()`, temps piloté par
`TestBed.tick()`).

## Étape 1 — La ressource (8 tests)

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — La façade est le seul endroit qui sait comment le
catalogue arrive : les composants lisent des signaux et appellent des
commandes. Changer le moteur ici ne touche aucun template, c'est la promesse
tenue depuis le TP 2. On repart d'une page blanche dans la classe, en gardant
la surface publique au caractère près.

**Le test qui attend** `catalogue.facade.spec.ts` › « interroge l API sans qu on le lui demande »

```ts
import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { appliquer, Filtres, FILTRES_VIDES, Produit } from '@maison/catalogue/domaine';
import { API_URL } from '@maison/partage/util';
import { Facettes, PAGE_VIDE, PageProduits, versParams } from './catalogue.api';
import { PageDto, ProduitDto, versProduit } from './produit.dto';

export const DELAI_FRAPPE_MS = 300;

@Injectable({ providedIn: 'root' })
export class CatalogueFacade {
  private readonly base = inject(API_URL);

  private readonly _filtres = signal<Filtres>(FILTRES_VIDES);
  readonly filtres = this._filtres.asReadonly();

  // La fonction de requête lit un signal : la lecture crée la dépendance,
  // comme dans un computed. Personne n'appelle « charger ».
  private readonly page = httpResource<PageProduits>(
    () => ({ url: `${this.base}/produits`, params: versParams(this._filtres()) }),
    {
      defaultValue: PAGE_VIDE,
      // Le DTO devient un objet de domaine avant d'entrer dans la ressource.
      parse: (brut) => {
        const dto = brut as PageDto<ProduitDto>;
        return { items: dto.items.map(versProduit), total: dto.total, facettes: dto.facettes };
      },
    },
  );

  private readonly pageSure = computed<PageProduits>(() => this.page.value());

  readonly produits = computed<readonly Produit[]>(() => this.pageSure().items);
  readonly total = computed<number>(() => this.pageSure().total);
  readonly facettes = computed<Facettes>(() => this.pageSure().facettes);
  readonly enChargement = this.page.isLoading;
  readonly erreur = computed<string | null>(() =>
    this.page.error() ? 'catalogue_indisponible' : null,
  );

  rafraichir(): void {
    this.page.reload();
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

  // Plus de `rafraichir()` ici : changer le signal suffit à relancer la requête.
  reinitialiser(): void {
    this._filtres.set(FILTRES_VIDES);
  }

  private modifier(modification: Partial<Filtres>): void {
    this._filtres.update((filtres) => appliquer(filtres, modification));
  }
}
```

**Ce qui passe au vert** — 8 tests écrits, plus les 2 du bonus qui passent
seuls : 3 restants (frappe rapide, une seule lettre, erreur).

**Le piège** — Garder `this.rafraichir()` dans `modifier()` : chaque filtre
relance la requête par `reload()` en plus du signal, sans attendre le debounce.
Avec la version finale, quatre tests le refusent (frappe rapide, une seule
lettre, page 1, recherche suivante : « found 2 requests »), vérifié par
mutation. Second
piège : oublier `{ provide: API_URL }` en cherchant pourquoi la façade
n'injecte plus `CatalogueApi`. Elle n'en a plus besoin : la ressource porte
l'URL, et `versParams` vient de `catalogue.api.ts`.

## Étape 2 — Le debounce reste en RxJS (2 tests)

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — Une ressource réagit à un changement de paramètre, elle
ne sait pas attendre. Le temps reste le domaine de RxJS : on construit un signal
« apaisé » à partir du signal des filtres, et c'est lui que la ressource lit.

**Le test qui attend** `catalogue.facade.spec.ts` › « ne part qu une fois pour une frappe rapide »

Les imports à ajouter en tête :

```ts
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { rechercheExploitable } from '@maison/catalogue/domaine';
import { debounceTime, distinctUntilChanged, filter } from 'rxjs';
```

Dans la classe, avant `page`, et la requête qui le lit :

```ts
  private readonly filtresApaises = toSignal(
    toObservable(this._filtres).pipe(
      // Une lettre ne part pas au serveur : règle du domaine, depuis le TP 2.
      filter((f) => rechercheExploitable(f.recherche)),
      debounceTime(DELAI_FRAPPE_MS),
      distinctUntilChanged(memesFiltres),
    ),
    { initialValue: FILTRES_VIDES },
  );

  private readonly page = httpResource<PageProduits>(
    () => ({ url: `${this.base}/produits`, params: versParams(this.filtresApaises()) }),
    {
      defaultValue: PAGE_VIDE,
      parse: (brut) => {
        const dto = brut as PageDto<ProduitDto>;
        return { items: dto.items.map(versProduit), total: dto.total, facettes: dto.facettes };
      },
    },
  );
```

Et en bas du fichier :

```ts
// Comparateur explicite plutôt que JSON.stringify, qui dépend de l'ordre des clés.
function memesFiltres(a: Filtres, b: Filtres): boolean {
  return (
    a.recherche.trim() === b.recherche.trim() &&
    a.piece === b.piece &&
    a.matiere === b.matiere &&
    a.prixMax === b.prixMax &&
    a.tri === b.tri &&
    a.page === b.page
  );
}
```

**Ce qui passe au vert** — 2 tests, 1 restant.

**Le piège** — Le test d'origine appelait `rechercher()` trois fois de suite,
sans `TestBed.tick()` entre deux : il passait **sans debounce**, parce que la
ressource ne lit son paramètre qu'au passage de la détection et ne voit que la
dernière valeur. Le test a été corrigé en novembre (un `tick` et 100 ms entre
deux touches, comme un rendu dans le navigateur). C'est la question de fin
n° 1. Second piège : la ressource qui lit encore `this._filtres()` alors que
`filtresApaises` est déclaré : rien ne casse, et le debounce ne sert à rien.

## Étape 3 — Le piège de `value()` (1 test)

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.ts`

**Pourquoi celui-là** — `value()` lève quand la ressource est en erreur, au lieu
de retomber sur `defaultValue`. Une seule dérivation gardée protège les trois
`computed` publics : la garde vit dans la façade, pour qu'aucun composant n'ait
à la connaître.

**Le test qui attend** `catalogue.facade.spec.ts` › « expose une erreur sans casser la façade »

```ts
  /**
   * `value()` lève quand la ressource est en erreur : `hasValue()` d'abord.
   * Une seule dérivation protège les trois suivantes.
   */
  private readonly pageSure = computed<PageProduits>(() =>
    this.page.hasValue() ? this.page.value() : PAGE_VIDE,
  );
```

**Ce qui passe au vert** — 1 test, 0 restant.

**Le piège** — Ne pas le montrer. Le moment du TP est la démonstration **avant**
la correction : application lancée, API coupée, une recherche. Aucun message ne
s'affiche, et la console montre `ERROR ResourceValueError: Resource is currently
in an error state` (vérifié au navigateur avec la version de l'étape 2). Après la
garde : « Le catalogue est momentanément indisponible. Réessayer ». Second piège :
mettre la garde dans le template (`@if (facade.erreur())` avant de lire
`produits()`) : ça masque le symptôme sur une page et le laisse sur les autres.

## Bonus — Ce qu'on garde, ce qu'on perd

**Fichier** `libs/catalogue/data-access/src/lib/catalogue.facade.bonus.spec.ts`

**Pourquoi celui-là** — Le bilan du TP doit reposer sur des faits. Ces deux tests
constatent le comportement de `httpResource` : l'annulation de la requête
obsolète est gardée, la reprise automatique est perdue.

**Le test qui attend** `catalogue.facade.bonus.spec.ts` › « ne réessaie pas une requête en échec »

```ts
  it('ne réessaie pas une requête en échec', async () => {
    TestBed.tick();
    http.expectOne(() => true).flush('', { status: 503, statusText: 'indispo' });
    await laisserTravaillerLaRessource();
    vi.advanceTimersByTime(5_000);
    TestBed.tick();

    http.expectNone(() => true);
    expect(facade.erreur()).toBe('catalogue_indisponible');
  });
```

**Ce qui passe au vert** — Rien à écrire : les 2 tests passent à l'étape 1. La
version `rxResource` avec `retry` (troisième réponse de l'énoncé) fait rougir
« ne réessaie pas une requête en échec » (vérifié par mutation, avec
`params: () => this.filtresApaises()` et un `stream` qui appelle `HttpClient`).

**Le piège** — Conclure trop vite que `rxResource` est « mieux » : il rouvre la
porte au pipeline qu'on vient de retirer. La reprise appartient souvent à un
intercepteur (TP 8), pour toute l'application.

## Bonus — Le bilan

**Fichier** aucun : `git diff --stat`, puis le tableau de l'énoncé.

**Pourquoi celui-là** — La promesse de la façade se mesure : un seul fichier
applicatif modifié, aucun composant, aucun template.

**Le test qui attend** aucun.

```bash
git diff --stat
```

**Ce qui passe au vert** — Rien. Le résultat attendu : `catalogue.facade.ts`
seul (plus les fichiers que l'apprenant aurait touchés par erreur, à commenter).

**Le piège** — Compter les lignes du fichier entier au lieu du seul mécanisme de
chargement : les commandes publiques n'ont pas changé, elles ne comptent pas.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. `StockStore` (TP 4) en ressource : qu'est-ce qui remplace le `setInterval` ?
   (Indice : `reload()` appelé par un minuteur, et le `DestroyRef` reste.)
2. La version `rxResource` avec reprise, en entier : combien de lignes, et que
   devient la lisibilité ?

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| Les 11 tests rouges, « Expected one matching request… found none » | le `Subject` et le pipeline sont encore là : sans `rafraichir()`, rien ne part (c'est l'état de départ) |
| « traduit les DTO en produits de domaine » échoue | `parse` absent, ou `versProduit` non appliqué aux `items` |
| Plusieurs tests trouvent « 2 requests » | `rafraichir()` encore appelé dans `modifier()` |
| « refait la requête courante » échoue | `rafraichir()` ne fait pas `this.page.reload()` |
| « ne part pas pour une seule lettre » échoue | `filter(rechercheExploitable)` absent, ou la ressource lit encore `_filtres()` |
| « expose une erreur sans casser la façade » lève `ResourceValueError` | `value()` lu sans `hasValue()` |
| Tests verts, mais catalogue vide et `NG0201` dans le navigateur | `fournirStrategiesLivraison()` retiré de `app.config.ts` (défaut 1) |
