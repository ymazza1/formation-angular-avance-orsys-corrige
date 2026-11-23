import { LOCALE_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CatalogueFacade, StockStore } from '@maison/catalogue/data-access';
import { FILTRES_VIDES, Produit, unProduit } from '@maison/catalogue/domaine';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CataloguePage } from './catalogue.page';

/**
 * Ajouté au TP 4.
 *
 * La page ne calcule rien : on remplace la façade et le store par des doublures
 * à base de signaux, et on vérifie seulement le branchement entre les deux.
 */
describe('CataloguePage — surveillance du stock', () => {
  const produits = signal<readonly Produit[]>([]);
  const surveiller = vi.fn();

  beforeEach(() => {
    produits.set([]);
    surveiller.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: LOCALE_ID, useValue: 'fr-FR' },
        {
          provide: CatalogueFacade,
          useValue: {
            filtres: signal(FILTRES_VIDES),
            produits,
            total: () => produits().length,
            erreur: () => null,
            enChargement: () => false,
            rafraichir: () => undefined,
          },
        },
        { provide: StockStore, useValue: { surveiller, quantite: () => 4 } },
      ],
    });
  });

  async function monter() {
    const fixture = TestBed.createComponent(CataloguePage);
    await fixture.whenStable();
    return fixture;
  }

  it('surveille le stock des produits affichés, et suit leur changement', async () => {
    const fixture = await monter();

    produits.set([unProduit({ id: 'p-001' }), unProduit({ id: 'p-002' })]);
    await fixture.whenStable();
    expect(surveiller).toHaveBeenLastCalledWith(['p-001', 'p-002']);

    produits.set([unProduit({ id: 'p-003' })]);
    await fixture.whenStable();
    expect(surveiller).toHaveBeenLastCalledWith(['p-003']);
  });

  it('ne surveille rien tant qu aucun produit n est affiché', async () => {
    await monter();

    expect(surveiller).not.toHaveBeenCalled();
  });

  it('affiche un badge de stock par produit', async () => {
    const fixture = await monter();

    produits.set([unProduit({ id: 'p-001' }), unProduit({ id: 'p-002' })]);
    await fixture.whenStable();

    const badges = (fixture.nativeElement as HTMLElement).querySelectorAll('mc-badge-stock');
    expect(badges).toHaveLength(2);
    expect(badges[0].textContent).toContain('Plus que 4');
  });
});
