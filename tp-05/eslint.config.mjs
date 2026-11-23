import nx from '@nx/eslint-plugin';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/angular'],
  {
    ignores: ['**/dist', '**/node_modules', '**/.nx'],
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          // Exception ciblée (TP 5) : la racine enregistre les stratégies de
          // livraison, dont PanierStore a besoin dans l'injecteur racine. `allow`
          // exempte ce seul module (de partout), pas une couche : la règle `type:app`
          // ci-dessous reste fermée aux data-access jusqu'au TP 8.
          allow: ['@maison/livraison/data-access'],
          depConstraints: [
            // --- axe technique : qui a le droit d'appeler quelle couche -----
            { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:util'] },
            { sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:domaine', 'type:util'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui', 'type:domaine', 'type:util'] },
            { sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:data-access', 'type:domaine', 'type:util'] },
            { sourceTag: 'type:domaine', onlyDependOnLibsWithTags: ['type:domaine', 'type:util'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:util'] },

            // --- axe fonctionnel : qui a le droit de connaître quel domaine -
            { sourceTag: 'domaine:boutique', onlyDependOnLibsWithTags: ['*'] },
            // Le catalogue peut déclencher un ajout au panier — c'est une
            // interaction métier légitime, et elle ne va que dans ce sens :
            // 'domaine:panier' ci-dessous ne mentionne pas l'inverse.
            { sourceTag: 'domaine:catalogue', onlyDependOnLibsWithTags: ['domaine:catalogue', 'domaine:panier', 'domaine:livraison', 'domaine:partage'] },
            { sourceTag: 'domaine:panier', onlyDependOnLibsWithTags: ['domaine:panier', 'domaine:catalogue', 'domaine:livraison', 'domaine:partage'] },
            { sourceTag: 'domaine:livraison', onlyDependOnLibsWithTags: ['domaine:livraison', 'domaine:partage'] },
            { sourceTag: 'domaine:partage', onlyDependOnLibsWithTags: ['domaine:partage'] },
          ],
        },
      ],
    },
  },
];
