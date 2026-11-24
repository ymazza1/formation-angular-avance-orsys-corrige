import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { computed, LOCALE_ID, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Commande } from '@maison/commande/domaine';
import { PanierStore } from '@maison/panier/data-access';
import { LignePanier } from '@maison/panier/domaine';
import { API_URL } from '@maison/partage/util';
import { beforeEach, describe, expect, it } from 'vitest';
import { CommandePage } from './commande.page';

/**
 * Ajouté au TP 6.
 *
 * Le schéma est testé seul (commande.schema.spec.ts) ; ici on ne vérifie que le
 * branchement du formulaire : la saisie atteint le modèle, l'erreur attend
 * `touched`, et le bouton respecte les trois états.
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

const COMMANDE_COMPLETE: Commande = {
  email: 'camille@maison.co',
  nom: 'Camille Roux',
  adresse: '3 rue des Tilleuls',
  codePostal: '44840',
  ville: 'Les Sorinières',
  mode: 'domicile',
  accepteCgv: true,
};

describe('CommandePage — le formulaire', () => {
  beforeEach(() => {
    const lignes = signal<readonly LignePanier[]>([CHAISE]);
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
            nbArticles: () => 1,
            total: () => 89,
          },
        },
      ],
    });
  });

  async function monter() {
    const fixture = TestBed.createComponent(CommandePage);
    await fixture.whenStable();
    const racine = fixture.nativeElement as HTMLElement;
    return { fixture, racine, page: fixture.componentInstance };
  }

  const alertes = (racine: HTMLElement) =>
    Array.from(racine.querySelectorAll('[role=alert]')).map((p) => p.textContent?.trim());

  it('écrit la saisie de l email dans le modèle', async () => {
    const { fixture, racine, page } = await monter();
    const champ = racine.querySelector<HTMLInputElement>('input[type=email]');

    expect(champ).not.toBeNull();
    champ!.value = 'camille@maison.co';
    champ!.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    expect(page['modele']().email).toBe('camille@maison.co');
  });

  it('n affiche l erreur de l email qu une fois le champ quitté', async () => {
    const { fixture, racine } = await monter();
    expect(alertes(racine)).toEqual([]);

    racine.querySelector('input[type=email]')!.dispatchEvent(new Event('blur'));
    await fixture.whenStable();

    expect(alertes(racine)).toContain('Renseignez votre email');
  });

  /** Ni valide ni invalide pendant la vérification : le bouton attend. */
  it('garde le bouton désactivé tant que la zone de livraison est en vérification', async () => {
    const { fixture, racine, page } = await monter();
    const bouton = () =>
      Array.from(racine.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Valider la commande'),
      );

    page['modele'].set(COMMANDE_COMPLETE);
    TestBed.tick();
    expect(bouton()?.disabled).toBe(true);

    TestBed.inject(HttpTestingController)
      .expectOne('/api/validation/code-postal/44840')
      .flush({ valide: true });
    await fixture.whenStable();

    expect(bouton()?.disabled).toBe(false);
  });
});
