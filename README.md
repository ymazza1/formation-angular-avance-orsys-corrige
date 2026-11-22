# Angular avancé — TP (corrigés, usage formateur)

Un dossier par TP, de `tp-00` à `tp-10`. `tp-N` est le point de départ du projet
apprenant `tp-N+1`.

Chaque dossier contient :

| Fichier | Usage |
| --- | --- |
| `RESOLUTION.md` | le pas à pas de la correction live, étape par étape, fichier par fichier |
| `EXPLICATIONS.md` | ce qui a été ajouté et pourquoi ; notes d'animation et pièges |
| `ENONCE.md` | l'énoncé remis aux apprenants, pour référence |

## Vérifier un corrigé

```bash
npm install --legacy-peer-deps
npx nx run-many -t test            # tout vert
npm run test:structure             # NON couvert par run-many
npx nx run-many -t lint
npx nx build boutique
```

`test:structure` n'est pas lancé par `nx run-many -t test`. Un défaut y est resté
invisible plusieurs TP pour cette raison : le lancer séparément à chaque fois.

Pour les TP 09 et 10 : `npm run mutants`. Pour le TP 10 : `npm run test:perf`.

## Avant d'animer

Les tests verts ne prouvent pas que l'écran fonctionne. Lancer l'application et
parcourir le scénario du TP dans un navigateur — cinq défauts ont été trouvés
ainsi, tous avec une suite de tests verte. La liste est dans `tp/specs.md` du
repo formateur.
