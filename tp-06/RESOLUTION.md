# TP 6 — Résolution pas à pas

On travaille sur `apprenant/tp-06`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 13 rouges, tous dans `commande-feature`, dont 11 à
écrire. Les 2 autres sont les tests du bonus « les erreurs comme objets », qui
passent seuls à l'étape 2.

Avant d'écrire : ajouter un article, cliquer sur **Commander**. La page s'affiche,
et « Valider la commande » est actif sur un formulaire vide. C'est le point de
départ à montrer.

## Étape 1 — Le schéma de validation (7 tests)

**Fichier** `libs/commande/feature/src/lib/commande.schema.ts`

**Pourquoi celui-là** — Le schéma est une fonction de configuration, hors du
composant : il se teste avec `form()` dans un contexte d'injection, sans DOM ni
clic. Il ne porte que les règles de **saisie**. Les règles de livraison (point
relais, modes) restent dans le domaine, parce qu'elles valent aussi pour une
commande qui n'est pas passée par ce formulaire.

**Le test qui attend** `commande.schema.spec.ts` › « exige l acceptation des CGV »

```ts
import { email, pattern, required, schema, validate } from '@angular/forms/signals';
import { Commande, FORMAT_CODE_POSTAL } from '@maison/commande/domaine';

export function schemaCommande(base: string) {
  return schema<Commande>((c) => {
    required(c.email, { message: 'Renseignez votre email' });
    email(c.email, { message: 'Cet email ne semble pas valide' });
    required(c.nom, { message: 'Renseignez votre nom' });
    required(c.adresse, { message: 'Renseignez votre adresse' });
    pattern(c.codePostal, FORMAT_CODE_POSTAL, { message: 'Cinq chiffres attendus' });
    required(c.ville, { message: 'Renseignez votre ville' });

    // `required` ne refuse pas `false` : un booléen n'est jamais « vide ».
    validate(c.accepteCgv, ({ value }) =>
      value() ? undefined : { kind: 'cgv', message: 'Vous devez accepter les CGV' },
    );
  });
}
```

**Ce qui passe au vert** — 7 tests, 6 restants.

**Le piège** — `required(c.accepteCgv, …)` pour les CGV : le test reste rouge,
`false` est une valeur. Second piège : recopier `/^[0-9]{5}$/` au lieu d'importer
`FORMAT_CODE_POSTAL` du domaine. Les tests passent, et la règle existe deux fois.

## Étape 2 — La validation asynchrone et l'état à trois valeurs (1 test)

**Fichier** `libs/commande/feature/src/lib/commande.schema.ts`

**Pourquoi celui-là** — La zone de livraison n'est connue que du serveur. La
vérifier dans le schéma, et non dans le composant, la place à côté des autres
règles : le formulaire ne fait aucune différence entre une erreur synchrone et
une erreur venue du réseau. `validateHttp` repose sur `httpResource` (TP 7) :
relance à chaque changement de valeur, annulation de la requête précédente.

**Le test qui attend** `commande.schema.spec.ts` › « reste en attente tant que la zone de livraison n est pas vérifiée »

```ts
import { email, pattern, required, schema, validate, validateHttp } from '@angular/forms/signals';
import { Commande, FORMAT_CODE_POSTAL } from '@maison/commande/domaine';

interface ReponseCodePostal {
  valide: boolean;
  ville?: string;
}

export function schemaCommande(base: string) {
  return schema<Commande>((c) => {
    required(c.email, { message: 'Renseignez votre email' });
    email(c.email, { message: 'Cet email ne semble pas valide' });
    required(c.nom, { message: 'Renseignez votre nom' });
    required(c.adresse, { message: 'Renseignez votre adresse' });
    pattern(c.codePostal, FORMAT_CODE_POSTAL, { message: 'Cinq chiffres attendus' });
    required(c.ville, { message: 'Renseignez votre ville' });

    // `required` ne refuse pas `false` : un booléen n'est jamais « vide ».
    validate(c.accepteCgv, ({ value }) =>
      value() ? undefined : { kind: 'cgv', message: 'Vous devez accepter les CGV' },
    );

    validateHttp(c.codePostal, {
      // Pas de requête tant que le format est faux : le serveur n'a rien à dire de « 4 ».
      request: ({ value }) =>
        FORMAT_CODE_POSTAL.test(value()) ? `${base}/validation/code-postal/${value()}` : undefined,
      onSuccess: (reponse: ReponseCodePostal) =>
        reponse.valide
          ? undefined
          : { kind: 'zone', message: 'Nous ne livrons pas encore dans cette zone' },
      // Décision commerciale : une panne du service de vérification ne bloque pas la vente.
      onError: () => undefined,
    });
  });
}
```

**Ce qui passe au vert** — 1 test écrit, plus les 2 du bonus « erreurs comme
objets » qui passent seuls : 3 restants (tous dans la page).

**Le piège** — Le test attend `valid()` **et** `invalid()` à `false`. Le
dire avant d'écrire : un formulaire en attente n'est ni l'un ni l'autre. C'est
ce qui décide de la garde du bouton à l'étape 3. Second piège : `request` qui
renvoie l'URL sans tester le format, et une requête part à chaque chiffre tapé.

## Étape 3 — Le formulaire (3 tests)

**Fichier** `libs/commande/feature/src/lib/commande.page.ts`

**Pourquoi celui-là** — Le composant ne valide rien : il lie chaque champ au
formulaire par `[formField]` et lit l'état exposé en signaux. Le code postal,
fourni, montre la forme ; il reste le champ email et la garde du bouton.

**Le test qui attend** `commande.page.spec.ts` › « garde le bouton désactivé tant que la zone de livraison est en vérification »

À la place du premier `TODO` :

```html
      <label>
        Email
        <input type="email" [formField]="commande.email" />
      </label>
      @if (commande.email().touched()) {
        @for (erreur of commande.email().errors(); track $index) {
          <p role="alert">{{ erreur.message }}</p>
        }
      }
```

Et le bouton, à la place du second :

```html
      <button type="button" [disabled]="!commande().valid() || envoi()" (click)="valider()">
```

**Ce qui passe au vert** — 3 tests, 0 restant.

**Le piège** — `[disabled]="commande().invalid()"` : deux tests sur trois passent,
et le bouton s'active pendant « Vérification de la zone de livraison… ». C'est
grave, parce que `submit()` lance l'action dès que le formulaire n'est **pas
invalide** (`ignoreValidators` vaut `'pending'` par défaut, vérifié dans le code
d'Angular) : la commande part sans zone vérifiée. Le corrigé de novembre avait
cette erreur. Second piège : l'erreur affichée sans `touched()`, le formulaire
crie dès l'ouverture (test « n affiche l erreur de l email qu une fois le champ
quitté »).

## Bonus — Corriger un mode devenu impossible

**Fichier** `libs/commande/feature/src/lib/commande.page.ts` (fourni) et `commande.page.bonus.spec.ts`

**Pourquoi celui-là** — Le mode est une donnée **saisie** : il ne se recalcule
pas, il se corrige quand le panier change sous lui. Un `computed` ne peut pas le
faire, d'où cet `effect`, qui écrit dans un signal. C'est l'exception à la règle
du TP 5 (« un `effect` qui appelle `set()` est un `computed` déguisé »), et elle
se justifie.

**Le test qui attend** `commande.page.bonus.spec.ts` › « ramène au domicile un point relais devenu impossible »

```ts
  constructor() {
    // Il ne dérive rien : il répare une saisie que le panier a rendue impossible.
    effect(() => {
      const lignes = this.panier.lignes();
      this.modele.update((commande) => ({
        ...commande,
        mode: modeCorrige(lignes, commande.mode),
      }));
    });
  }
```

**Ce qui passe au vert** — Rien à écrire : 2 tests verts dès l'ouverture. Retirer
l'appel à `modeCorrige` fait rougir le premier (vérifié par mutation).

**Le piège** — Les tests lisent `page['modele']` : l'accès entre crochets passe
outre `protected`. C'est toléré dans un test, à ne pas imiter ailleurs.

## Bonus — Les erreurs comme objets `{ kind, message }`

**Fichier** `libs/commande/feature/src/lib/commande.schema.bonus.spec.ts`

**Pourquoi celui-là** — Le `kind` dit d'où vient l'erreur, le `message` ce
qu'on affiche. Le test répond lui-même à la requête de vérification avec
`HttpTestingController` : c'est la seule façon de tester `onSuccess` et
`onError` sans serveur.

**Le test qui attend** `commande.schema.bonus.spec.ts` › « ne bloque pas la commande quand la vérification est en panne »

```ts
async function repondre(reponse: (requete: ReturnType<HttpTestingController['expectOne']>) => void) {
  // La requête ne part qu'au premier passage de la détection : `tick` d'abord.
  TestBed.tick();
  reponse(TestBed.inject(HttpTestingController).expectOne('/api/validation/code-postal/12345'));
  await TestBed.inject(ApplicationRef).whenStable();
}
```

**Ce qui passe au vert** — Rien à écrire : les 2 tests passent à l'étape 2. Un
`onError` qui renvoie une erreur fait rougir « ne bloque pas la commande quand
la vérification est en panne » (vérifié par mutation).

**Le piège** — `expectOne` sans `TestBed.tick()` avant : « Expected one matching
request, found none ». La ressource ne lance sa requête qu'à la détection.

## Pour le formateur — katas si le groupe finit en avance

Sans test, à animer à l'oral :

1. Réponse à la question de fin n° 1 : `submit()` ne refuse qu'un formulaire
   **invalide**. Passer `{ action, ignoreValidators: 'none' }` exige `valid()`.
   Faut-il le faire en plus de la garde du bouton ?
2. Rendre la ville obligatoire seulement pour une livraison à domicile
   (`applyWhen`).
3. Le même formulaire en `FormGroup` typé : où vit la validation, et comment la
   tester sans monter le composant ?

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| « exige l acceptation des CGV » échoue | `required` au lieu de `validate` sur un booléen |
| Un message attendu n'est pas trouvé | message recopié avec une faute : comparer au spec, mot pour mot |
| « reste en attente » échoue, `pending()` à `false` | `validateHttp` absent, ou `request` renvoie `undefined` pour `44840` |
| « écrit la saisie de l email dans le modèle » échoue, champ introuvable | `type="email"` oublié sur l'`input` |
| « garde le bouton désactivé… » échoue au premier `expect` | bouton gardé sur `invalid()` au lieu de `!valid()` |
| « n affiche l erreur… » échoue au premier `expect` | erreurs affichées sans `touched()` |
| Les bonus « erreurs comme objets » restent rouges après l'étape 2 | `onSuccess` ne renvoie pas `kind: 'zone'`, ou `onError` renvoie une erreur |
| Tests verts, mais pas de lien « Commander » ni de catalogue dans le navigateur | `app.config.ts` ou `catalogue.page.ts` modifiés : ils sont fournis (défaut 1, défaut 10) |
