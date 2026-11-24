# TP 5 — Et avec NgRx SignalStore ?

Note pour le formateur, à sortir quand un stagiaire demande « pourquoi pas
NgRx ? ». Ce n'est pas une étape du TP : `@ngrx/signals` n'est **pas installé**
dans les projets, et le code ci-dessous **n'a pas été compilé** dans ce dépôt.
Il suit l'API publique de `@ngrx/signals` (`signalStore`, `withState`,
`withProps`, `withComputed`, `withMethods`, `withHooks`, `patchState`). Avant
de le montrer, vérifiez quelle version de `@ngrx/signals` est compatible avec
Angular 22 : NgRx sort une version majeure par version majeure d'Angular.

## Ce que c'est

`signalStore()` fabrique un service injectable à partir de **briques
composées**, au lieu d'une classe écrite à la main :

| Brique | Rôle | Équivalent dans `PanierStore` |
| --- | --- | --- |
| `withState({...})` | l'état en écriture, exposé en signaux **lecture seule** | les `signal` privés + `asReadonly()` |
| `withProps(() => ({...}))` | dépendances injectées, propriétés diverses | les `inject()` en champs |
| `withComputed(...)` | les dérivations | les `computed` |
| `withMethods(...)` | les commandes, qui modifient l'état par `patchState` | les méthodes publiques |
| `withHooks({ onInit, onDestroy })` | le cycle de vie | le `constructor` (restauration + `effect`) |

L'état n'est modifiable **que depuis le store** (`patchState` refuse un store
vu de l'extérieur, comportement par défaut) : c'est la règle « un signal en
écriture, privé » du TP, garantie par la bibliothèque au lieu d'être tenue par
discipline.

Un membre dont le nom commence par `_` (état, propriété, dérivation ou
méthode) reste **privé** au store.

## Le `PanierStore` du TP 5, réécrit

```ts
import { HttpClient } from '@angular/common/http';
import { computed, effect, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withHooks, withMethods, withProps, withState } from '@ngrx/signals';
import { Produit } from '@maison/catalogue/domaine';
import { coutLivraison } from '@maison/livraison/domaine';
import { STRATEGIES_LIVRAISON } from '@maison/livraison/data-access';
import * as panier from '@maison/panier/domaine';
import { API_URL } from '@maison/partage/util';
import { firstValueFrom } from 'rxjs';

export const CLE_PERSISTANCE = 'maison-et-co.panier';

interface EtatPanier {
  lignes: panier.Panier;
  codePromo: string | null;
  _remisePourcent: number | null; // `_` : reste privé, comme aujourd'hui
  erreurPromo: string | null;
}

const ETAT_INITIAL: EtatPanier = {
  lignes: panier.PANIER_VIDE,
  codePromo: null,
  _remisePourcent: null,
  erreurPromo: null,
};

export const PanierStore = signalStore(
  { providedIn: 'root' },
  withState(ETAT_INITIAL),
  withProps(() => ({
    _http: inject(HttpClient),
    _base: inject(API_URL),
    _strategies: inject(STRATEGIES_LIVRAISON),
  })),
  withComputed(({ lignes, _remisePourcent, _strategies }) => {
    const estVide = computed(() => lignes().length === 0);
    const sousTotal = computed(() => panier.sousTotal(lignes()));
    const fraisLivraison = computed(() =>
      estVide() ? 0 : coutLivraison(panier.versLignesLivrables(lignes()), _strategies),
    );
    const remise = computed(() => panier.remise(sousTotal(), _remisePourcent()));
    return {
      nbArticles: computed(() => panier.nbArticles(lignes())),
      estVide,
      sousTotal,
      fraisLivraison,
      remise,
      total: computed(() => Math.round((sousTotal() - remise() + fraisLivraison()) * 100) / 100),
    };
  }),
  withMethods((store) => ({
    ajouter(produit: Produit, quantite = 1): void {
      patchState(store, (etat) => ({ lignes: panier.ajouter(etat.lignes, produit, quantite) }));
    },
    retirer(produitId: string): void {
      patchState(store, (etat) => ({ lignes: panier.retirer(etat.lignes, produitId) }));
    },
    changerQuantite(produitId: string, quantite: number): void {
      patchState(store, (etat) => ({ lignes: panier.changerQuantite(etat.lignes, produitId, quantite) }));
    },
    retirerCodePromo(): void {
      patchState(store, { codePromo: null, _remisePourcent: null, erreurPromo: null });
    },
    vider(): void {
      patchState(store, ETAT_INITIAL);
    },
    async appliquerCodePromo(code: string): Promise<void> {
      patchState(store, { erreurPromo: null });
      try {
        const reponse = await firstValueFrom(
          store._http.get<{ valide: boolean; remisePourcent?: number }>(`${store._base}/promotions/${code}`),
        );
        if (!reponse.valide) {
          patchState(store, { erreurPromo: 'code_invalide' });
          return;
        }
        patchState(store, { codePromo: code, _remisePourcent: reponse.remisePourcent ?? null });
      } catch {
        patchState(store, { erreurPromo: 'verification_impossible' });
      }
    },
  })),
  withHooks({
    onInit(store) {
      try {
        const brut = localStorage.getItem(CLE_PERSISTANCE);
        if (brut) patchState(store, { lignes: JSON.parse(brut) as panier.Panier });
      } catch {
        // contenu illisible : panier vide
      }
      // Toujours le seul effet, toujours légitime : il synchronise un système extérieur.
      effect(() => {
        const contenu = JSON.stringify(store.lignes());
        try {
          localStorage.setItem(CLE_PERSISTANCE, contenu);
        } catch {
          // stockage plein ou navigation privée
        }
      });
    },
  }),
);
```

Le domaine est importé en espace de noms (`panier.ajouter`) parce que les
méthodes du store portent les mêmes noms que les fonctions du domaine.

## Ce que ça apporte

1. **Moins de code de cérémonie.** Plus de paires `_lignes` / `lignes =
   _lignes.asReadonly()` : l'état est exposé en lecture seule d'office.
2. **La règle d'écriture est garantie, pas conventionnelle.** Un composant ne
   peut pas appeler `patchState` sur le store. Avec une classe écrite à la main,
   un `signal` public oublié suffit à casser la règle, et rien ne le signale.
3. **Une forme commune à tous les stores.** État, dérivations, commandes, cycle
   de vie : chaque store se lit de la même façon, quel que soit l'auteur. C'est
   l'argument le plus fort sur une équipe de dix développeurs et trente stores.
4. **Des fonctionnalités réutilisables.** On peut écrire une brique
   `withPersistance(cle)` une fois, et la poser sur le panier et sur la session
   (TP 8). Aujourd'hui, ce code serait recopié. NgRx fournit aussi
   `withEntities` (collections indexées par identifiant) et `rxMethod` (une
   méthode qui accepte un `Observable`, utile pour une recherche comme celle du
   TP 3).
5. **Outillage.** Des extensions communautaires (par exemple
   `@angular-architects/ngrx-toolkit`) branchent les Redux DevTools sur un
   SignalStore pour voir chaque changement d'état.

## Ce que ça coûte

1. **Une dépendance de plus**, dont la version suit celle d'Angular. Chaque
   montée de version d'Angular attend celle de NgRx.
2. **Les primitives sont cachées.** Le TP 5 apprend `signal`, `computed`,
   `effect` et la règle « un effet ne calcule pas ». Avec `signalStore`, on
   apprend d'abord la bibliothèque. Les stagiaires qui n'ont pas vu les
   primitives ne savent pas ce que `withComputed` fait réellement.
3. **Des erreurs de typage difficiles à lire.** Le typage passe par une chaîne
   de génériques : une faute dans `withComputed` produit un message de plusieurs
   dizaines de lignes.
4. **Plus de classe.** Pas de `this`, pas d'héritage. `PanierStore` devient une
   valeur, et son type s'écrit `InstanceType<typeof PanierStore>` quand on en a
   besoin ailleurs (un paramètre de fonction, un faux store dans un test).
5. **Ça ne règle rien de ce que le TP enseigne vraiment.** Les règles métier
   restent dans le domaine, le total reste dérivé, l'effet de persistance reste
   le seul. `signalStore` structure le store ; il ne décide pas de ce qui doit
   y être.

## Ce que ça changerait dans la formation

| Endroit | Changement |
| --- | --- |
| `package.json` | ajouter `@ngrx/signals`, en version compatible Angular 22 |
| Tests (`panier.store.spec.ts`) | **presque rien** : `TestBed.inject(PanierStore)` marche à l'identique, et la surface publique (`lignes`, `total`, `ajouter`…) est la même |
| TP 4 — `StockStore` | la minuterie se démarre dans `onInit` et s'arrête dans `onDestroy` de `withHooks`, au lieu de `DestroyRef.onDestroy` |
| TP 5 — `PanierStore` | la réécriture ci-dessus ; la question « `effect` ou `computed` ? » reste entière |
| TP 8 — `SessionStore` | candidat naturel à une brique `withPersistance` partagée avec le panier |
| TP 9 — `CommandeStore` | inchangé sur le fond : l'union discriminée `ResultatCommande` devient un champ d'état |
| Règles de frontières (lint) | aucun changement : le store reste dans `data-access` |
| Énoncés | à réécrire en grande partie : le vocabulaire (`withState`, `patchState`) remplace `signal().set()` |

## Recommandation

Garder les stores écrits à la main dans la formation : le but est de comprendre
les primitives, et une classe de quarante lignes les montre toutes.

Présenter `signalStore` comme **l'étape suivante**, sur un vrai projet : dès
qu'une équipe a plusieurs stores et veut une forme commune, la bibliothèque
rend obligatoire ce que la formation enseigne comme discipline. La phrase à
faire retenir : *on adopte `signalStore` quand on a compris ce qu'il remplace.*

Kata oral possible en fin de TP 5 : montrer la réécriture ci-dessus et demander
au groupe de retrouver, ligne à ligne, l'équivalent dans le `PanierStore` qu'il
vient d'écrire.
