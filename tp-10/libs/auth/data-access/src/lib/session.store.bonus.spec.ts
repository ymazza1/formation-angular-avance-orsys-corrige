import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '@maison/partage/util';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from './session.store';

/**
 * Bonus — Le stockage du jeton.
 *
 * Le jeton vit en mémoire : ces tests figent les deux conséquences du choix.
 * Aucune option n'est parfaite (voir le tableau de l'énoncé).
 */
const REPONSE = {
  jeton: 'j-secret',
  rafraichissement: 'r-secret',
  role: 'admin',
  nom: 'Yanis',
  expireDans: 30,
};

function configurer(): { http: HttpTestingController; store: SessionStore } {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: '/api' },
    ],
  });
  return { http: TestBed.inject(HttpTestingController), store: TestBed.inject(SessionStore) };
}

describe('Bonus — stockage du jeton', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('n écrit aucun jeton dans localStorage ni dans sessionStorage', async () => {
    const { http, store } = configurer();

    const promesse = store.connexion('yanis@maison.co', 'admin');
    http.expectOne('/api/auth/connexion').flush(REPONSE);
    await promesse;

    const stockage = JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage });
    expect(stockage).not.toContain('j-secret');
    expect(stockage).not.toContain('r-secret');
  });

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
});
