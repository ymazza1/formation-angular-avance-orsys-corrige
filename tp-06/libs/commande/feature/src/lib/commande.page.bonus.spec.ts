import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, LOCALE_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PanierStore } from '@maison/panier/data-access';
import { LignePanier } from '@maison/panier/domaine';
import { API_URL } from '@maison/partage/util';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommandePage } from './commande.page';

/**
 * Bonus du TP 6 — corriger un mode devenu impossible.
 *
 * L'effet du constructeur de la page est fourni. Ce test le verrouille : le
 * supprimer le fait passer au rouge.
 */
const CHAISE: LignePanier = {
  produitId: 'p-001',
  nom: 'Chaise Tova',
  prixUnitaire: 89,
  quantite: 1,
  stockDisponible: 12,
  poidsKg: 6,
  volumeM3: 0.12,
};
const CANAPE: LignePanier = { ...CHAISE, produitId: 'p-002', nom: 'Canapé Oslo', poidsKg: 118, volumeM3: 2.4 };

describe('CommandePage — le mode de livraison suit le panier', () => {
  const lignes = signal<readonly LignePanier[]>([]);

  beforeEach(() => {
    lignes.set([CHAISE]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        { provide: API_URL, useValue: '/api' },
        {
          provide: PanierStore,
          useValue: {
            lignes,
            estVide: computed(() => lignes().length === 0),
            nbArticles: () => lignes().length,
            total: () => 0,
          },
        },
      ],
    });
  });

  async function monter() {
    const fixture = TestBed.createComponent(CommandePage);
    await fixture.whenStable();
    return fixture.componentInstance;
  }

  it('ramène au domicile un point relais devenu impossible', async () => {
    const page = await monter();
    page['modele'].update((c) => ({ ...c, mode: 'point-relais' }));

    lignes.set([CHAISE, CANAPE]);
    TestBed.tick();

    expect(page['modele']().mode).toBe('domicile');
  });

  it('conserve un mode encore possible', async () => {
    const page = await monter();
    page['modele'].update((c) => ({ ...c, mode: 'express' }));

    lignes.set([CHAISE, CANAPE]);
    TestBed.tick();

    expect(page['modele']().mode).toBe('express');
  });
});
