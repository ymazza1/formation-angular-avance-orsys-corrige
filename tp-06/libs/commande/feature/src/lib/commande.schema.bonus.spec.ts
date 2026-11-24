import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, Injector, provideZonelessChangeDetection, runInInjectionContext, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { Commande } from '@maison/commande/domaine';
import { beforeEach, describe, expect, it } from 'vitest';
import { schemaCommande } from './commande.schema';

/**
 * Bonus du TP 6 — les erreurs comme objets `{ kind, message }`.
 *
 * Une erreur n'est pas une chaîne : son `kind` dit d'où elle vient, son
 * `message` ce qu'on affiche. Ces deux tests passent dès que la validation
 * asynchrone (étape 2) est écrite.
 */
const COMMANDE_COMPLETE: Commande = {
  email: 'camille@maison.co',
  nom: 'Camille Roux',
  adresse: '3 rue des Tilleuls',
  codePostal: '12345',
  ville: 'Nulle-Part',
  mode: 'domicile',
  accepteCgv: true,
};

function unFormulaire() {
  const modele = signal<Commande>(COMMANDE_COMPLETE);
  const injecteur = TestBed.inject(Injector);
  return runInInjectionContext(injecteur, () => form(modele, schemaCommande('/api')));
}

async function repondre(reponse: (requete: ReturnType<HttpTestingController['expectOne']>) => void) {
  TestBed.tick();
  reponse(TestBed.inject(HttpTestingController).expectOne('/api/validation/code-postal/12345'));
  await TestBed.inject(ApplicationRef).whenStable();
}

describe('schemaCommande — les erreurs comme objets', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('signale une zone non desservie par une erreur de kind « zone »', async () => {
    const champs = unFormulaire();

    await repondre((requete) => requete.flush({ valide: false }));

    expect(champs.codePostal().errors()).toContainEqual(
      expect.objectContaining({
        kind: 'zone',
        message: 'Nous ne livrons pas encore dans cette zone',
      }),
    );
    expect(champs().invalid()).toBe(true);
  });

  /** Décision commerciale : un service de vérification en panne ne bloque pas la vente. */
  it('ne bloque pas la commande quand la vérification est en panne', async () => {
    const champs = unFormulaire();

    await repondre((requete) => requete.flush('panne', { status: 503, statusText: 'Indisponible' }));

    expect(champs.codePostal().errors()).toEqual([]);
    expect(champs().valid()).toBe(true);
  });
});
