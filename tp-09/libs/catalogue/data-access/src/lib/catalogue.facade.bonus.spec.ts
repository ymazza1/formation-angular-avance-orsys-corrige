import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { API_URL } from '@maison/partage/util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogueFacade, DELAI_FRAPPE_MS } from './catalogue.facade';

/**
 * Bonus du TP 7 — ce qu'on garde, ce qu'on perd.
 *
 * Ces tests ne demandent rien à écrire : ils constatent le comportement de
 * `httpResource`, pour que le bilan du TP repose sur des faits et non sur une
 * impression. Ils passent dès que l'étape 1 est écrite.
 */
describe('CatalogueFacade — le bilan resource vs RxJS', () => {
  let http: HttpTestingController;
  let facade: CatalogueFacade;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: '/api' },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    facade = TestBed.inject(CatalogueFacade);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function laisserTravaillerLaRessource(): Promise<void> {
    TestBed.tick();
    await Promise.resolve();
    await Promise.resolve();
    TestBed.tick();
  }

  /** Ce qu'on garde : la requête devenue inutile est annulée, pas seulement ignorée. */
  it('annule la requête en cours quand les filtres changent', async () => {
    TestBed.tick();
    const premiere = http.expectOne((r) => r.url === '/api/produits');

    facade.filtrerParPiece('chambre');
    vi.advanceTimersByTime(DELAI_FRAPPE_MS);
    TestBed.tick();

    expect(premiere.cancelled).toBe(true);
    http.expectOne((r) => r.params.get('piece') === 'chambre');
  });

  /**
   * Ce qu'on perd : la version RxJS du TP 3 refaisait deux tentatives avant
   * d'abandonner. La ressource abandonne à la première erreur.
   */
  it('ne réessaie pas une requête en échec', async () => {
    TestBed.tick();
    http.expectOne(() => true).flush('', { status: 503, statusText: 'indispo' });
    await laisserTravaillerLaRessource();
    vi.advanceTimersByTime(5_000);
    TestBed.tick();

    http.expectNone(() => true);
    expect(facade.erreur()).toBe('catalogue_indisponible');
  });
});
