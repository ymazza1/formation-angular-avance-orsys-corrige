# TP 9 — Résolution pas à pas

On travaille sur `apprenant/tp-09`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 8 rouges, tous dans `commande-data-access`, tous à
écrire. `npm run mutants` donne 7 tués sur 8.

Le point de départ **fonctionne à moitié** : le chemin du succès de `envoyer`
est fourni (requête, corps, référence). Connecté, une commande part et sa
référence s'affiche. Le panier reste plein, et sans connexion la console
affiche une erreur non interceptée (le `401` rejette la promesse de
`envoyer`). C'est la démonstration à faire avant l'étape 2.

## Étape 1 — Lire les tests avant d'écrire le code

**Fichier** `libs/commande/data-access/src/lib/commande.store.spec.ts` (lecture seule)

**Pourquoi celui-là** — Le TP porte sur ce qu'un test vaut. On commence par
vérifier qu'une suite se lit comme un cahier des charges : si le groupe répond
aux quatre questions sans ouvrir le code, les tests spécifient.

**Le test qui attend** aucun : on lit les onze.

Les réponses attendues, test à l'appui :

1. Panier vide : `{ statut: 'panier-vide' }` et **aucune requête**
   (« refuse un panier vide sans appeler l API », `http.expectNone`).
2. Par ligne : `{ produitId, quantite }`, rien d'autre (« n envoie que
   l identifiant et la quantité de chaque ligne »).
3. Le panier n'est vidé qu'après un succès (« vide le panier après un
   succès » et « ne vide surtout pas le panier en cas d échec »).
4. Cinq issues, chacune vérifiée par un test : le succès, le panier vide, le
   `409`, le `401`, et « toute autre erreur » (un `503`).

**Ce qui passe au vert** — Rien : 8 rouges.

**Le piège** — Répondre à la question 4 en lisant le type plutôt que les
tests. Les cinq statuts sont couverts, mais pas toutes les branches :
l'erreur qui n'est pas une `HttpErrorResponse` (première ligne de
`interpreter`) n'a pas de test. C'est une entrée naturelle vers l'étape 3 :
« qu'est-ce que la suite ne vérifie pas ? ».

## Étape 2 — Le store d'envoi (8 tests)

**Fichier** `libs/commande/data-access/src/lib/commande.store.ts`

**Pourquoi celui-là** — Le store est le seul endroit qui connaît `HttpClient`,
`HttpErrorResponse` et le code `409`. La page lit des signaux et un statut ;
elle est déjà branchée (fournie). Tout le comportement d'erreur se joue ici.

**Le test qui attend** `commande.store.spec.ts` › « ne vide surtout pas le panier en cas d échec »

`envoyer` complet (la garde, l'état d'envoi, le `try/catch/finally`, le
`vider()` après le `await`) :

```ts
  async envoyer(commande: Commande, lignes: Panier): Promise<ResultatCommande> {
    if (lignes.length === 0) return this.conclure({ statut: 'panier-vide' });

    this._envoi.set(true);
    try {
      const reponse = await firstValueFrom(
        this.http.post<ReponseCommande>(`${this.base}/commandes`, {
          ...commande,
          lignes: lignes.map((ligne) => ({
            produitId: ligne.produitId,
            quantite: ligne.quantite,
          })),
        }),
      );
      this.panier.vider();
      return this.conclure({ statut: 'enregistree', reference: reponse.id });
    } catch (erreur) {
      return this.conclure(this.interpreter(erreur));
    } finally {
      this._envoi.set(false);
    }
  }
```

Et `interpreter` :

```ts
  private interpreter(erreur: unknown): ResultatCommande {
    if (!(erreur instanceof HttpErrorResponse)) return { statut: 'indisponible' };
    if (erreur.status === 401) return { statut: 'non-authentifie' };
    if (erreur.status === 409) {
      return { statut: 'stock-insuffisant', produitId: erreur.error?.produitId ?? '' };
    }
    return { statut: 'indisponible' };
  }
```

**Ce qui passe au vert** — 8 tests, 0 restant.

À dire en passant : **c'est la réponse à la question laissée ouverte au TP 5**.
Le stock figé au moment de l'ajout n'est pas un problème, parce que **le
serveur tranche** (`409`). Le client n'aurait jamais pu garantir la
disponibilité : deux clients peuvent commander le dernier exemplaire à la même
seconde.

**Le piège** — Mettre `this.panier.vider()` dans le `finally` (« on nettoie à
la fin ») : « ne vide surtout pas le panier en cas d échec » rougit. Second
piège : laisser la garde du panier vide de côté en comptant sur le serveur ;
il répondrait `422`, qu'il faudrait traduire, et `expectNone` le refuse.

## Étape 3 — La chasse aux mutants

**Fichier** `libs/livraison/domaine/src/lib/strategies.spec.ts`

**Pourquoi celui-là** — Le rapport de `npm run mutants` le désigne : le
survivant est dans `livraison/domaine/src/lib/strategies.ts`. On écrit le test
à côté des autres tests de cette règle.

**Le test qui attend** aucun : c'est `npm run mutants` qui attend.

Sortie au départ :

```
✓  tué         seuil de volume inclusif → exclusif
✓  tué         disponibilité : stock > 0 → stock >= 0
✓  tué         recherche exploitable : minimum ignoré
☠  SURVIVANT   franco de port : seuil strict → large
✓  tué         point relais : et → ou
✓  tué         modes disponibles : every → some
✓  tué         marge d expiration supprimée
✓  tué         quantité zéro ne retire plus la ligne

7/8 mutants tués.
```

Le survivant : `montantTotal >= SEUIL_FRANCO_EUROS → montantTotal > SEUIL_FRANCO_EUROS`.
Aucun test ne couvre un panier à **exactement** 500 €.

Ajouter `SEUIL_FRANCO_EUROS` à l'import, puis en fin de `describe` :

```ts
  /**
   * Ajouté au TP 9, après qu'un mutant a survécu : le seuil de franco est
   * INCLUSIF. Sans ce test, remplacer `>=` par `>` passait inaperçu — et un
   * client à 500,00 € pile se voyait facturer la livraison.
   */
  it('offre la livraison AU seuil exact, pas seulement au-delà', () => {
    expect(coutLivraison([uneLigne({ montant: SEUIL_FRANCO_EUROS })], STRATEGIES)).toBe(0);
  });

  it('facture la livraison juste en dessous du seuil', () => {
    expect(coutLivraison([uneLigne({ montant: SEUIL_FRANCO_EUROS - 0.01 })], STRATEGIES)).toBe(9.9);
  });
```

**Ce qui passe au vert** — 2 tests de plus (verts dès l'écriture), et 8/8
mutants tués.

**Le piège** — Écrire `montant: 500` : le test suit la valeur du moment, pas
la règle. Second piège : n'écrire que le test au seuil. Le motif à retenir pour
**tout** seuil est le seuil et son voisin immédiat (déjà appliqué au TP 2 pour
`estVolumineux`, au TP 6 pour le point relais, au TP 8 pour la marge
d'expiration). Enfin, faire vérifier que le nouveau test **sait échouer** :
remettre `>` à la main dans `strategies.ts`, constater le rouge, restaurer.

À dire : *l'outil a trouvé un trou dans les tests écrits pour apprendre à
tester.* La couverture de lignes de `strategies.ts` était de 100 % : elle
mesure ce qui a été **exécuté**, pas ce qui a été **vérifié**.

## Bonus — Ce qui se teste bien, et ce qui se teste mal

**Fichier** aucun : la suite complète, et le tableau de l'énoncé.

**Pourquoi celui-là** — Ne pas confondre « non testé » et « non protégé ». Les
pages routées n'ont pas de test : leur logique vit dans des stores et des
domaines couverts.

**Le test qui attend** aucun.

**Ce qui passe au vert** — Rien. La réponse à la question de l'énoncé : aucun
test unitaire ne protège la place de la confirmation dans `commande.page.ts`
(avant le `@else if (panier.estVide())`). Placée dans la branche `@else`, elle
disparaît à l'instant où l'envoi réussit, puisque le panier est vidé. Seul le
parcours navigateur l'attrape : c'est le bon outil pour ce genre de défaut.

**Le piège** — Conclure qu'il faut tester toutes les pages. Un test de page
coûte cher et casse à chaque refonte ; un parcours de bout en bout sur le
chemin critique (commander) coûte moins pour la même garantie.

## Bonus — Le temps d'exécution

**Fichier** aucun : `npx nx run-many -t test --skip-nx-cache`.

**Pourquoi celui-là** — Justifier par un chiffre la règle du TP 1 (« le domaine
n'importe rien d'Angular »).

**Le test qui attend** aucun.

**Ce qui passe au vert** — Rien. Ordre de grandeur attendu : quelques dizaines
de millisecondes par domaine (environnement `node`), quelques centaines par lib
Angular (DOM et compilation).

**Le piège** — Lire la durée totale de nx, dominée par le démarrage de Vitest
dans chaque projet. Comparer la ligne `Tests` de chaque projet, pas l'horloge.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. Ajouter un mutant à `tools/mutants/chasse.mjs` sur du code qu'on pense bien
   couvert (exemple : `every → some` ailleurs). Survit-il ?
2. Afficher le **nom** du produit en rupture sur un `409` : `produitId` est là,
   où trouver le nom sans réintroduire de dépendance vers le catalogue ?
   (Indice : le panier connaît le nom de chaque ligne.)

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| « promise rejected "HttpErrorResponse{ … }" instead of resolving » | le `try/catch` n'est pas écrit : c'est l'état de départ |
| « refuse un panier vide » échoue en « Test timed out in 5000ms » | pas de garde : la requête part, le test n'y répond pas, la promesse attend |
| `expectNone` échoue sur panier vide | la garde `lignes.length === 0` est après l'appel HTTP |
| Le panier est vidé malgré l'erreur | `vider()` placé avant le `await`, ou dans le `finally` |
| Le 409 ne remonte pas `produitId` | lecture de `erreur.error` oubliée |
| `envoiEnCours` reste à `true` | `finally` manquant |
| `npm run mutants` très lent | filtrer : `node tools/mutants/chasse.mjs livraison` |
| Un fichier reste muté | `Ctrl+C` pendant la chasse : `git checkout libs/` |
