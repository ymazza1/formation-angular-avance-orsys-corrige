import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Bonus — Les tags croisés.
 *
 * Deux axes de tags s'appliquent EN MÊME TEMPS : une dépendance doit les
 * satisfaire tous les deux. `livraison/domaine → catalogue/domaine` passe
 * l'axe technique (domaine → domaine) mais échoue sur l'axe fonctionnel.
 *
 * Ces tests lisent la configuration, comme `structure.spec.ts`.
 */

const CONFIG = readFileSync(join(__dirname, '..', '..', 'eslint.config.mjs'), 'utf8');

const DOMAINES = ['boutique', 'catalogue', 'livraison', 'partage'] as const;

/**
 * Bloc d'une contrainte, retrouvé par sa DÉCLARATION (`sourceTag: '…'`) et non
 * par la première occurrence du tag : `domaine:livraison` apparaît aussi dans la
 * liste autorisée du catalogue, plus haut dans le fichier.
 */
function contrainte(tagSource: string): string {
  const debut = CONFIG.indexOf(`sourceTag: '${tagSource}'`);
  if (debut === -1) return '';
  const fin = CONFIG.indexOf('}', debut);
  return CONFIG.slice(debut, fin === -1 ? undefined : fin);
}

describe('Bonus — axe fonctionnel', () => {
  it.each(DOMAINES)('une contrainte fonctionnelle est déclarée pour domaine:%s', (domaine) => {
    expect(contrainte(`domaine:${domaine}`)).not.toBe('');
  });

  it('livraison ne peut pas connaître le catalogue', () => {
    const livraison = contrainte('domaine:livraison');

    expect(livraison).toContain('domaine:livraison');
    expect(livraison).not.toContain('domaine:catalogue');
  });
});
