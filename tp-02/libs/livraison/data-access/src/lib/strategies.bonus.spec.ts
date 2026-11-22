import { TestBed } from '@angular/core/testing';
import {
  coutLivraison,
  LigneLivrable,
  LivraisonStandard,
  LivraisonVolumineux,
  StrategieLivraison,
} from '@maison/livraison/domaine';
import { describe, expect, it } from 'vitest';
import { fournirStrategiesLivraison, STRATEGIES_LIVRAISON } from './strategies.providers';

/**
 * Bonus — Les stratégies de livraison en multi-providers.
 *
 * Une troisième règle (colis léger en express) s'ajoute sans modifier ni
 * `coutLivraison`, ni les deux stratégies existantes : un provider de plus.
 */
class LivraisonExpress implements StrategieLivraison {
  readonly nom = 'express';

  supporte(ligne: LigneLivrable): boolean {
    return ligne.poidsKg < 5;
  }

  cout(): number {
    return 19;
  }
}

const COLIS_LEGER: LigneLivrable = { poidsKg: 2, volumeM3: 0.05, quantite: 1, montant: 80 };

function injecter(...supplementaires: StrategieLivraison[]): readonly StrategieLivraison[] {
  TestBed.configureTestingModule({
    providers: [
      // Déclaré avant : la première stratégie qui accepte la ligne l'emporte.
      ...supplementaires.map((s) => ({ provide: STRATEGIES_LIVRAISON, multi: true, useValue: s })),
      fournirStrategiesLivraison(),
    ],
  });
  return TestBed.inject<readonly StrategieLivraison[]>(STRATEGIES_LIVRAISON);
}

describe('Bonus — multi-providers', () => {
  it('ajoute une règle sans toucher aux fournisseurs existants', () => {
    const strategies = injecter(new LivraisonExpress());

    expect(strategies.map((s) => s.nom)).toEqual(['express', 'volumineux', 'standard']);
  });

  it('applique la nouvelle règle quand elle est déclarée en premier', () => {
    expect(coutLivraison([COLIS_LEGER], injecter(new LivraisonExpress()))).toBe(19);
  });

  it('laisse les règles existantes en charge de ce que la nouvelle refuse', () => {
    const lourd: LigneLivrable = { ...COLIS_LEGER, poidsKg: 60 };

    expect(coutLivraison([lourd], injecter(new LivraisonExpress()))).toBe(49);
  });

  it('change de résultat si l ordre des providers change', () => {
    const ordreInverse = [new LivraisonStandard(), new LivraisonExpress(), new LivraisonVolumineux()];

    expect(coutLivraison([COLIS_LEGER], ordreInverse)).toBe(9.9);
  });
});
