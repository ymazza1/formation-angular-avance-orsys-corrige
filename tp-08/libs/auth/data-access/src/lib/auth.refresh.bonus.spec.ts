import {
  HttpClient,
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '@maison/partage/util';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { SessionStore } from './session.store';

/**
 * Bonus — Le rafraîchissement automatique du jeton.
 *
 * L'intercepteur de reprise est défini ici, dans le test : le code de la
 * bibliothèque ne change pas. À vous de le déplacer dans `auth.interceptor.ts`.
 *
 * Il est placé AVANT `authInterceptor` : la requête rejouée repasse ainsi par
 * lui et emporte le nouveau jeton sans qu'on ait à le recopier.
 */
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

const REPONSE = (n: number) => ({
  jeton: `j-${n}`,
  rafraichissement: `r-${n}`,
  role: 'client',
  nom: 'Camille',
  expireDans: 30,
});

const REFUS = { status: 401, statusText: 'Unauthorized' };

const tick = () => new Promise<void>((resolu) => setTimeout(resolu, 0));

describe('Bonus — rafraîchissement automatique', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(async () => {
    rafraichissementEnCours = null;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(withInterceptors([reprise, authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);

    const connexion = TestBed.inject(SessionStore).connexion('camille@maison.co', 'client');
    http.expectOne('/api/auth/connexion').flush(REPONSE(1));
    await connexion;
  });

  it('rafraîchit puis rejoue la requête avec le nouveau jeton', async () => {
    const recu: unknown[] = [];
    client.get('/api/produits').subscribe((valeur) => recu.push(valeur));

    http.expectOne('/api/produits').flush(null, REFUS);
    http.expectOne('/api/auth/refresh').flush(REPONSE(2));
    await tick();

    const rejouee = http.expectOne('/api/produits');
    expect(rejouee.request.headers.get('Authorization')).toBe('Bearer j-2');
    rejouee.flush({ ok: true });

    expect(recu).toEqual([{ ok: true }]);
  });

  it('dix requêtes en 401 simultanées ne déclenchent qu un seul rafraîchissement', async () => {
    for (let i = 0; i < 10; i++) client.get('/api/produits').subscribe();

    for (const requete of http.match('/api/produits')) requete.flush(null, REFUS);

    http.expectOne('/api/auth/refresh').flush(REPONSE(2));
    await tick();

    const rejouees = http.match('/api/produits');
    expect(rejouees).toHaveLength(10);
    rejouees.forEach((r) => r.flush({ ok: true }));
  });

  it('ne rejoue pas une route d authentification qui répond 401', async () => {
    let erreur: unknown = null;
    client.post('/api/auth/connexion', {}).subscribe({ error: (e) => (erreur = e) });

    http.expectOne('/api/auth/connexion').flush(null, REFUS);
    await tick();

    http.expectNone('/api/auth/refresh');
    expect(erreur).toBeInstanceOf(HttpErrorResponse);
  });

  it('propage l erreur d origine quand le rafraîchissement échoue', async () => {
    let erreur: unknown = null;
    client.get('/api/produits').subscribe({ error: (e) => (erreur = e) });

    http.expectOne('/api/produits').flush(null, REFUS);
    http.expectOne('/api/auth/refresh').flush(null, REFUS);
    await tick();

    expect((erreur as HttpErrorResponse).status).toBe(401);
    expect(TestBed.inject(SessionStore).estConnecte()).toBe(false);
  });
});
