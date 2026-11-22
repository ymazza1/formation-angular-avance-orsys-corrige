# TP 8 — Résolution pas à pas

On travaille sur `apprenant/tp-08`, un terminal sur `npx nx run-many -t test --watch`.
Le compteur de départ est à 26 rouges.

## Étape 1 — Le store de session (9 tests)

**Fichier** `libs/auth/data-access/src/lib/session.store.ts`

**Pourquoi celui-là** — C'est le seul endroit qui connaisse à la fois le HTTP
(`/auth/connexion`, `/auth/refresh`) et l'état de la session. Le domaine
(`session.ts`, fourni) sait décider si un jeton est périmé mais ignore tout du
réseau ; l'intercepteur et le guard, eux, ne doivent poser qu'une question au
store : « puis-je m'en servir ? » et « est-il admin ? ». Toute la logique
d'expiration reste donc ici et dans le domaine, nulle part ailleurs.

**Le test qui attend** `session.store.spec.ts` › « ne rafraîchit pas sans session »

```ts
@Injectable({ providedIn: 'root' })
export class SessionStore {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_URL);

  private readonly _session = signal<Session | null>(null);
  private readonly _erreur = signal<string | null>(null);

  readonly session = this._session.asReadonly();
  readonly erreur = this._erreur.asReadonly();

  readonly estConnecte = computed(() => this._session() !== null);
  readonly estAdmin = computed(() => estAdmin(this._session()));
  readonly nom = computed(() => this._session()?.nom ?? null);

  // Une seule méthode répond à « puis-je m'en servir maintenant ? » :
  // l'intercepteur n'a aucune logique d'expiration à connaître.
  jetonValide(maintenant = Date.now()): string | null {
    const session = this._session();
    return estUtilisable(session, maintenant) ? (session as Session).jeton : null;
  }

  // Un échec d'identifiants est un état d'interface, pas une exception :
  // l'appelant n'a aucun `catch` à écrire.
  async connexion(email: string, motDePasse: string): Promise<boolean> {
    this._erreur.set(null);
    try {
      const reponse = await firstValueFrom(
        this.http.post<ReponseAuth>(`${this.base}/auth/connexion`, { email, motDePasse }),
      );
      this._session.set(versSession(reponse, Date.now()));
      return true;
    } catch {
      this._erreur.set('identifiants_invalides');
      return false;
    }
  }

  async rafraichir(): Promise<boolean> {
    const session = this._session();
    // Sans cette garde on envoie `rafraichissement: undefined`, le serveur
    // répond 401, et un intercepteur de reprise relancerait un rafraîchissement.
    if (session === null) return false;
    try {
      const reponse = await firstValueFrom(
        this.http.post<ReponseAuth>(`${this.base}/auth/refresh`, {
          rafraichissement: session.rafraichissement,
        }),
      );
      this._session.set(versSession(reponse, Date.now()));
      return true;
    } catch {
      // Une session dont le rafraîchissement échoue est morte : on la retire
      // plutôt que de la laisser exposer un jeton périmé.
      this.deconnexion();
      return false;
    }
  }

  deconnexion(): void {
    this._session.set(null);
  }
}
```

La déclaration de `ReponseAuth` et les imports restent ceux du fichier fourni.

**Ce qui passe au vert** — « 11 tests de plus, 15 restants. » Les 9 de
`session.store.spec.ts`, et les 2 de `session.store.bonus.spec.ts` qui
utilisaient `connexion`.

**Le piège** — Oublier la garde de `rafraichir()` : le test « ne rafraîchit pas
sans session » échoue, et en vrai on récolte un 401 en boucle dès qu'une reprise
automatique est branchée. Second piège : relancer l'erreur dans le `catch` de
`connexion` « pour que l'appelant sache » — la barre de connexion n'a alors plus
qu'une exception non gérée à afficher.

## Étape 2 — L'intercepteur (6 tests)

**Fichier** `libs/auth/data-access/src/lib/auth.interceptor.ts`

**Pourquoi celui-là** — L'intercepteur est la seule porte par où le jeton sort
de l'application. Il a le droit de lire le store et l'URL de l'API ; il n'a pas
le droit de connaître l'expiration (le store l'a déjà décidée) ni de savoir qui
est administrateur. C'est aussi ici que se joue le test le plus important du TP :
un jeton envoyé à un domaine tiers est une faille.

**Le test qui attend** `auth.interceptor.spec.ts` › « n envoie jamais le jeton vers un autre domaine »

```ts
export const authInterceptor: HttpInterceptorFn = (requete, suivant) => {
  const base = inject(API_URL);
  const session = inject(SessionStore);

  // startsWith, pas includes : une URL tierce qui contient « /api » dans sa
  // query string ne doit pas emporter le jeton.
  const versNotreApi = requete.url.startsWith(base);
  // Sinon un jeton expiré ferait échouer son propre rafraîchissement.
  const estPublique = PUBLIQUES.some((chemin) => requete.url.includes(chemin));
  const jeton = session.jetonValide();

  if (!versNotreApi || estPublique || jeton === null) return suivant(requete);

  return suivant(requete.clone({ setHeaders: { Authorization: `Bearer ${jeton}` } }));
};
```

Puis, dans `apps/boutique/src/app/app.config.ts`, remplacer `provideHttpClient()` par :

```ts
provideHttpClient(withInterceptors([authInterceptor])),
```

sans oublier les imports `withInterceptors` (de `@angular/common/http`) et
`authInterceptor` (de `@maison/auth/data-access`). Un intercepteur non branché ne
fait rien, et aucun test unitaire ne le voit.

**Ce qui passe au vert** — « 10 tests de plus, 5 restants. » Les 6 de
`auth.interceptor.spec.ts`, et les 4 de `auth.refresh.bonus.spec.ts`.

**Le piège** — Tester `versNotreApi` avec `includes(base)` : le test « n envoie
jamais le jeton vers un autre domaine » passe avec une URL tierce simple, et l'on
ne découvre le trou qu'avec une URL qui embarque `/api` en paramètre. Et le
branchement dans `app.config.ts` : tous les tests sont verts, mais l'application
n'envoie jamais aucun jeton.

## Étape 3 — Le guard, et pourquoi `canMatch` (5 tests)

**Fichier** `libs/auth/data-access/src/lib/admin.guard.ts`, puis `apps/boutique/src/app/app.routes.ts`

**Pourquoi celui-là** — Le guard lit le store et rend une décision de routage ;
il ne charge rien et ne connaît pas la page admin. Le choix de `canMatch` se
voit ici : il est évalué **avant** le chargement du bundle, donc le code du
back-office n'est jamais téléchargé par un visiteur. Avec `canActivate`, il
atterrirait chez tout le monde, puis serait refusé.

**Le test qui attend** `admin.guard.spec.ts` › « refuse un client connecté »

```ts
export const estAdmin: CanMatchFn = () => {
  const session = inject(SessionStore);
  const routeur = inject(Router);

  // Trois retours possibles : true, false, ou un UrlTree — qui vaut redirection.
  return session.estAdmin() ? true : routeur.createUrlTree(['/connexion']);
};
```

Dans `app.routes.ts`, deux routes à ajouter, et l'import de `estAdmin` depuis
`@maison/auth/data-access` :

```ts
{
  // Cible de la redirection du guard. La barre de connexion est dans l'en-tête :
  // on atterrit donc sur le catalogue, formulaire visible. Sans cette route, la
  // redirection échoue (NG04002) et un lien direct vers /admin laisse une page vide.
  path: 'connexion',
  redirectTo: '',
  pathMatch: 'full',
},
{
  // canMatch, pas canActivate : la route n'est même pas considérée si
  // l'utilisateur n'est pas administrateur, donc le bundle n'est jamais téléchargé.
  path: 'admin',
  canMatch: [estAdmin],
  loadChildren: () => import('@maison/admin/feature').then((m) => m.ADMIN_ROUTES),
},
```

**Ce qui passe au vert** — « 5 tests de plus, 0 restant. »

**La démonstration réseau**, en plénière, en `nx serve` (jamais sur le build de
production : le chunk y est haché, le filtre ne montre rien). Onglet Réseau vidé,
filtre `admin.page` :

| Situation | Chunk `admin.page` |
| --- | --- |
| Anonyme sur `/admin` (redirigé vers le catalogue) | absent |
| Client connecté | absent |
| Admin connecté, lien « back-office » | présent |

Prévenir que la ligne `/admin` qu'on voit avec le filtre `admin` est la
**navigation du document**, pas le code. Et naviguer par les liens : le jeton
est en mémoire, un rechargement déconnecte. Rappel qui va avec : le guard
protège le *chargement du code*, pas les *données* — l'API répond 401 quoi qu'il
arrive.

**Le piège** — Oublier la route `/connexion` : tous les tests du guard sont
verts (ils vérifient seulement que l'URL contient `/connexion`), mais la
redirection échoue en `NG04002` et un lien direct vers `/admin` donne une page
vide. Seul le navigateur le voit. Second piège : écrire `canActivate`, qui passe
les 5 tests et télécharge le chunk chez tous les visiteurs.

## Bonus — Le rafraîchissement automatique du jeton

**Fichier** `libs/auth/data-access/src/lib/auth.refresh.bonus.spec.ts`

**Pourquoi celui-là** — L'intercepteur de reprise est défini dans le test : le
code de la bibliothèque ne change pas, et l'on peut lire le mécanisme avant de le
déplacer dans `auth.interceptor.ts`. Il est placé **avant** `authInterceptor` :
la requête rejouée repasse par lui et emporte le nouveau jeton sans qu'on le
recopie.

**Le test qui attend** `auth.refresh.bonus.spec.ts` › « dix requêtes en 401 simultanées ne déclenchent qu un seul rafraîchissement »

```ts
let rafraichissementEnCours: Promise<boolean> | null = null;

const reprise: HttpInterceptorFn = (requete, suivant) => {
  const session = inject(SessionStore);

  return suivant(requete).pipe(
    catchError((erreur: unknown) => {
      const a401 = erreur instanceof HttpErrorResponse && erreur.status === 401;
      // Une route d'authentification qui répond 401 est un vrai refus : la
      // rejouer, ce serait boucler.
      if (!a401 || requete.url.includes('/auth/')) return throwError(() => erreur);

      // Dix requêtes en 401 partagent UNE promesse de rafraîchissement.
      rafraichissementEnCours ??= session.rafraichir().finally(() => {
        rafraichissementEnCours = null;
      });

      return from(rafraichissementEnCours).pipe(
        switchMap((reussi) => (reussi ? suivant(requete) : throwError(() => erreur))),
      );
    }),
  );
};
```

**Ce qui passe au vert** — Déjà verts une fois l'étape 2 écrite : 4 tests, rien à
écrire. Pour voir l'expiration en direct : `cd api && npm run start:jeton-court`
(jeton de 10 secondes).

**Le piège** — Remplacer `??=` par `=` : chaque requête en 401 lance son propre
rafraîchissement, et le test « dix requêtes » échoue (vérifié par mutation). Le
serveur, lui, n'accepte un jeton de rafraîchissement qu'une fois.

## Bonus — Le stockage du jeton : comparer les quatre options

**Fichier** `libs/auth/data-access/src/lib/session.store.bonus.spec.ts`

**Pourquoi celui-là** — Le store est le seul endroit où le jeton est conservé :
le choix « en mémoire » se vérifie donc dans ses tests. Aucune option n'est
parfaite ; le test fige les deux conséquences du compromis retenu.

**Le test qui attend** `session.store.bonus.spec.ts` › « perd la session à un rechargement : un nouveau store repart déconnecté »

```ts
it('perd la session à un rechargement : un nouveau store repart déconnecté', async () => {
  const { http, store } = configurer();
  const promesse = store.connexion('yanis@maison.co', 'admin');
  http.expectOne('/api/auth/connexion').flush(REPONSE);
  await promesse;
  expect(store.estConnecte()).toBe(true);

  TestBed.resetTestingModule();
  const { store: apresRechargement } = configurer();

  expect(apresRechargement.estConnecte()).toBe(false);
});
```

**Ce qui passe au vert** — Déjà verts une fois l'étape 1 écrite : 2 tests, rien à
écrire. Le tableau des quatre options est dans l'énoncé.

**Le piège** — Conclure que « mémoire » protège d'un XSS : un script qui
s'exécute dans la page appelle l'API avec la session en cours. Les options
diffèrent par ce qu'il peut exfiltrer et conserver, pas par l'immunité.

## Si un test résiste

| Symptôme | Cause |
| --- | --- |
| `inject() must be called from an injection context` | `runInInjectionContext` manquant dans le test du guard |
| Le jeton part vers le domaine tiers | condition `versNotreApi` absente, ou `includes` au lieu de `startsWith` |
| Le rafraîchissement part sans session | garde `if (session === null)` manquante |
| Le cas limite d'expiration échoue | `<` au lieu de `<=`, ou marge oubliée (domaine fourni : ne devrait pas arriver) |
| Le chunk admin se télécharge quand même | `canActivate` au lieu de `canMatch`, ou import statique de `AdminPage` |
| `NG04002 … URL Segment: 'connexion'` en console | route `/connexion` absente de `app.routes.ts` |
| Les tests passent mais aucun jeton n'est envoyé | `authInterceptor` non branché dans `app.config.ts` |
| Un test de reprise échoue sur `expectOne('/api/auth/refresh')` | `??=` remplacé par `=` : plusieurs rafraîchissements partent |
