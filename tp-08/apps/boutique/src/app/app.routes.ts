import { Routes } from '@angular/router';
import { estAdmin } from '@maison/auth/data-access';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('@maison/catalogue/feature').then((m) => m.CATALOGUE_ROUTES),
  },
  {
    path: 'commande',
    loadChildren: () => import('@maison/commande/feature').then((m) => m.COMMANDE_ROUTES),
  },
  {
    // Cible de la redirection du guard. La barre de connexion est dans l'en-tête :
    // on atterrit donc sur le catalogue, formulaire visible. Sans cette route, la
    // redirection échoue (NG04002) et un lien direct vers /admin laisse une page vide.
    path: 'connexion',
    redirectTo: '',
    pathMatch: 'full',
  },
  {
    /**
     * `canMatch`, pas `canActivate` : la route n'est même pas considérée si
     * l'utilisateur n'est pas administrateur, donc le bundle n'est jamais
     * téléchargé. Vérifiable dans l'onglet Réseau.
     */
    path: 'admin',
    canMatch: [estAdmin],
    loadChildren: () => import('@maison/admin/feature').then((m) => m.ADMIN_ROUTES),
  },
];
