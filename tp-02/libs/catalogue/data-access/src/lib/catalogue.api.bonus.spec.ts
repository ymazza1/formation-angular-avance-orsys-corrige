import { FILTRES_VIDES } from '@maison/catalogue/domaine';
import { describe, expect, it } from 'vitest';
import { versParams } from './catalogue.api';

/**
 * Bonus — La recherche et les accents : à qui appartient la règle ?
 *
 * « etagere » doit trouver « Étagère ». Cette tolérance est une règle de
 * recherche : elle vit dans l'API (api/server.js, `sansAccents`), pas dans le
 * client. Ces tests figent la conséquence côté client : on transmet la saisie
 * telle quelle, sans la déformer.
 */
describe('Bonus — recherche et accents', () => {
  it('transmet la saisie accentuée sans la normaliser', () => {
    expect(versParams({ ...FILTRES_VIDES, recherche: 'étagère' }).get('q')).toBe('étagère');
  });

  it('transmet la saisie sans accent telle quelle', () => {
    expect(versParams({ ...FILTRES_VIDES, recherche: 'etagere' }).get('q')).toBe('etagere');
  });

  it('ne retire que les espaces autour, jamais les accents', () => {
    expect(versParams({ ...FILTRES_VIDES, recherche: '  Étagère ' }).get('q')).toBe('Étagère');
  });
});
