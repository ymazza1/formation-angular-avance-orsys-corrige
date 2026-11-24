# TP 10 — Résolution pas à pas

On travaille sur `apprenant/tp-10`, un terminal sur `npm run test:perf`. Le
compteur de départ est à 3 rouges, tous dans `tools/perf/perf.spec.ts`, tous à
corriger. `npx nx run-many -t test` est vert et ne lance pas ces tests :
le dire, sinon le groupe croit avoir fini.

Ce TP n'écrit presque pas de code. Les deux premières étapes ne changent pas le
compteur : on mesure, puis on lit.

## Étape 1 — La mesure de départ (10 min)

**Fichier** aucun : `npx nx build boutique`, puis le Profiler des Angular DevTools.

**Pourquoi celui-là** — Sans chiffre de départ, il n'y a ni preuve
d'amélioration, ni détection de régression. On relève avant de toucher à quoi
que ce soit.

**Le test qui attend** aucun.

Chiffres de départ, mesurés sur le projet apprenant (24 nov.) :

```
Initial total        302.68 kB brut  |  86.34 kB transféré

Lazy chunk files
  commande-page       68.19 kB
  catalogue-page      13.59 kB
  admin-page           3.09 kB
```

La réponse à la première question (« pourquoi le tunnel pèse une vingtaine de
fois le back-office ? ») : `@angular/forms/signals`. Ce poids **n'est pas dans
le bundle initial** : il n'est payé que par ceux qui ouvrent le tunnel. C'est
ce que le lazy loading achète, et c'est pour ça que le budget `initial` ne le
compte pas.

**Ce qui passe au vert** — Rien : 3 rouges.

**Le piège** — Corriger en mesurant. Le groupe voit `stocks.quantite(...)` dans
le template et le change avant d'avoir relevé le Profiler : il n'a plus de
chiffre « avant ». Second piège : un Profiler enregistré en touchant la page.
Le scénario est « vingt secondes sans rien toucher » ; en zoneless, seuls les
rafraîchissements de stock (toutes les quinze secondes) déclenchent des cycles.

## Étape 2 — Lire le rapport (10 min)

**Fichier** `libs/catalogue/feature/src/lib/catalogue.page.ts` et
`libs/catalogue/ui/src/lib/carte-produit.component.ts` (lecture seule)

**Pourquoi celui-là** — Les trois défauts sont dans deux fichiers et un
rapport de build. On les nomme avant de les corriger : c'est ce qui permet de
mesurer chaque correction à part à l'étape 3.

**Le test qui attend** aucun : les 3 rouges désignent déjà les trois défauts
(« budget serré », « appel de méthode », « NgOptimizedImage »).

Les trois défauts :

1. **Le poids du tunnel** : `forms/signals`, payé au chargement de la route.
   Réponse à la question de l'énoncé : importée statiquement dans
   `app.routes.ts`, `CommandePage` ferait passer ses 68 ko dans le bundle
   initial, pour tous les visiteurs.
2. **L'appel de service dans le template**, écrit au TP 4 et resté six TP
   durant : `[quantite]="stocks.quantite(produit.id)"`. Ni la revue, ni les
   tests, ni le lint ne l'ont signalé.
3. **Les images** : dimensions présentes, mais `[src]` brut, sans chargement
   paresseux ni jeu de sources.

**Ce qui passe au vert** — Rien : 3 rouges.

**Le piège** — Présenter le point 1 comme un défaut à corriger. C'est le prix
d'une fonctionnalité réelle, au bon endroit. Le test « budget serré » ne parle
pas de lui : il vise le budget `initial`.

## Étape 3 — Corriger, et mesurer le gain (15 min)

**Fichier** `catalogue.page.ts` (3a), puis `carte-produit.component.ts` (3b)

**Pourquoi celui-là** — Un point à la fois, une mesure avant, une mesure après.
La dérivation se mesure au Profiler, les images au build : les corriger
ensemble brouillerait les deux mesures.

**Le test qui attend** `perf.spec.ts` › « aucun appel de méthode de service dans une liaison »

3a, dans `catalogue.page.ts` (ajouter `computed` à l'import d'`@angular/core`) :

```ts
  protected readonly produitsAvecStock = computed(() =>
    this.facade.produits().map((produit) => ({
      produit,
      quantite: this.stocks.quantite(produit.id),
    })),
  );
```

```html
@for (entree of produitsAvecStock(); track entree.produit.id) {
  <li>
    <mc-carte-produit [produit]="entree.produit" (ajouter)="ajouterAuPanier($event)" />
    <mc-badge-stock [quantite]="entree.quantite" />
  </li>
}
```

Compteur : 2 rouges.

3b, dans `carte-produit.component.ts` :

```ts
import { CurrencyPipe, NgOptimizedImage } from '@angular/common';
// …
  imports: [CurrencyPipe, NgOptimizedImage],
```

```html
<img [ngSrc]="produit().image" [alt]="produit().nom" width="320" height="240" />
```

Compteur : 1 rouge (le budget).

3c, le build :

| | Initial total |
| --- | --- |
| Avant | 302,68 ko |
| Après | **308,17 ko** |

**Ce qui passe au vert** — 2 tests, 1 restant. Le bundle **grossit** de 5,5 ko :
c'est `NgOptimizedImage` (la directive, sa logique de `srcset`, son chargement
paresseux). On échange du JavaScript contre de la stabilité visuelle et des
images à la demande. **Le bundle n'est pas la performance.**

**Le piège** — Vendre le gain de 3a en kilo-octets : il n'y en a pas (le chunk
`catalogue-page` passe de 13,59 à 13,71 ko). Le gain se voit au Profiler, en
exécutions évitées. Et le dire honnêtement : `quantite()` est une lecture de
`Map`, le gain réel sur vingt produits est microscopique. **Le point est le
motif** : deux cents lignes avec un calcul de prix dans la liaison, c'est une
page qui rame, avec exactement la même forme de code. Second piège : oublier
`NgOptimizedImage` dans `imports` et garder `[ngSrc]` : le build échoue en
`NG8002: Can't bind to 'ngSrc' since it isn't a known property of 'img'`
(vérifié).

## Étape 4 — Verrouiller (10 min)

**Fichier** `apps/boutique/project.json`

**Pourquoi celui-là** — Une correction non verrouillée revient. Le budget est
la seule chose qui fera échouer un build le jour où quelqu'un importera une
bibliothèque de 200 ko au démarrage.

**Le test qui attend** `perf.spec.ts` › « le budget initial est serré autour de la taille réelle »

```json
"budgets": [
  { "type": "initial", "maximumWarning": "320kB", "maximumError": "350kB" },
  { "type": "anyComponentStyle", "maximumWarning": "4kB", "maximumError": "8kB" }
]
```

Les défauts d'Angular sont à 500 ko / 800 ko : sur un bundle de 308 ko, ça
laisse passer un triplement sans un mot. Un budget utile est posé juste
au-dessus de la valeur mesurée.

Le faire mordre : `maximumError` à `200kB`, puis le build refuse (vérifié) :

```
[ERROR] bundle initial exceeded maximum budget. Budget 200.00 kB was not met by 108.17 kB with a total of 308.17 kB.
```

Remettre `350kB` ensuite.

**Ce qui passe au vert** — 1 test, 0 restant.

**Le piège** — Ne pas faire l'essai à 200 ko. **Un garde-fou qu'on n'a jamais
vu se déclencher n'est pas un garde-fou.** Second piège, la question sans bonne
réponse : à quelle fréquence relever les seuils, et qui le remarque ? La
pratique qui marche : le relèvement passe en revue de code, avec une phrase
d'explication. Pas de relèvement silencieux.

## Bonus — Pour ceux qui finissent en avance

**Fichier** aucun : `source-map-explorer`, l'onglet Performance, `nx affected`.

**Pourquoi celui-là** — Prolonger l'audit sur ce que le rapport de build ne
montre pas : la composition du bundle, le LCP, le coût de la suite de tests.

**Le test qui attend** aucun.

**Ce qui passe au vert** — Rien.

**Le piège** — Mettre `priority` sur toutes les images : on perd le chargement
paresseux qu'on vient d'acheter. Une seule image est l'élément LCP, et c'est
l'onglet Performance qui la désigne, pas l'intuition.

## Pour le formateur — les tests de garde-fou

`tools/perf/perf.spec.ts` ne mesure **aucune** performance : il vérifie que
les garde-fous sont en place.

| Test | Ce qu'il empêche |
| --- | --- |
| budget initial déclaré et **serré** | un budget décoratif |
| avertissement avant erreur | découvrir le dépassement en CI |
| aucun appel **avec argument** dans une liaison | le défaut de l'étape 2 |
| `track` sur chaque `@for` | la recréation complète du DOM |
| `NgOptimizedImage` sur les images produit | le décalage de mise en page |
| dimensions déclarées | idem |

Précision du troisième : un **signal en lecture** (`facade.filtres()`) ne prend
pas d'argument et ne coûte rien. C'est l'appel **avec argument** qui refait un
calcul à chaque cycle. C'est la troisième fois de la formation qu'une règle de
revue devient un test, après les frontières du TP 1 et les souscriptions du
TP 3.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| `npx nx run-many -t test` vert, mais l'énoncé annonce 3 rouges | les garde-fous se lancent à part : `npm run test:perf` |
| « budget serré » échoue | `maximumError` encore à 800 ko |
| « appel de méthode » échoue | il reste un `[x]="service.methode(arg)"` dans un template |
| « NgOptimizedImage » échoue | import oublié dans `imports: []`, ou `[src]` au lieu de `[ngSrc]` |
| Le build échoue après les budgets | relevez **votre** valeur et posez le budget dessus |
| Aucune différence au Profiler | normal sur vingt produits : c'est le motif qui compte |
