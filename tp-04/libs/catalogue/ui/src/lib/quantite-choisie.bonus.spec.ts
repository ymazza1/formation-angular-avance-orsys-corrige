import {
  ChangeDetectionStrategy,
  Component,
  input,
  linkedSignal,
  provideZonelessChangeDetection,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Bonus du TP 4 — `linkedSignal` sur la quantité.
 *
 * La quantité qu'on s'apprête à commander est un état LOCAL (l'utilisateur la
 * modifie) mais DÉRIVÉ du stock (elle ne peut pas le dépasser). Un `computed`
 * ne s'écrit pas ; un `signal` + un `effect` qui le corrige est exactement
 * l'effet « qui fait set() sur un autre signal » que l'énoncé déconseille.
 * `linkedSignal` est fait pour ce cas : il s'écrit, et il se recalcule quand sa
 * source change, en connaissant sa valeur précédente.
 *
 * Le composant vit dans ce fichier : le code du projet n'est pas modifié.
 */
@Component({
  selector: 'mc-quantite-choisie',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<output>{{ choisie() }}</output>`,
})
class QuantiteChoisieComponent {
  readonly stock = input.required<number | null>();

  readonly choisie = linkedSignal<number | null, number>({
    source: this.stock,
    // On garde le choix de l'utilisateur tant que le stock le permet : c'est
    // `precedent` qui fait la différence avec un `computed`.
    computation: (stock, precedent) => Math.min(precedent?.value ?? 1, stock ?? 0),
  });
}

describe('linkedSignal — la quantité choisie suit le stock', () => {
  let fixture: ComponentFixture<QuantiteChoisieComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(QuantiteChoisieComponent);
    fixture.componentRef.setInput('stock', 10);
    await fixture.whenStable();
  });

  const affiche = () => (fixture.nativeElement as HTMLElement).textContent?.trim();

  async function stock(quantite: number | null): Promise<void> {
    fixture.componentRef.setInput('stock', quantite);
    await fixture.whenStable();
  }

  it('propose 1 exemplaire par défaut', () => {
    expect(affiche()).toBe('1');
  });

  it('garde le choix de l utilisateur quand le stock change sans le contredire', async () => {
    fixture.componentInstance.choisie.set(4);
    await stock(8);

    expect(affiche()).toBe('4');
  });

  it('ramène le choix au stock quand celui-ci baisse en dessous', async () => {
    fixture.componentInstance.choisie.set(4);
    await stock(2);

    expect(affiche()).toBe('2');
  });

  it('tombe à 0 en rupture ou pendant la vérification', async () => {
    await stock(0);
    expect(affiche()).toBe('0');

    await stock(null);
    expect(affiche()).toBe('0');
  });
});
