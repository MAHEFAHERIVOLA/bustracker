import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-compte', standalone: true,
  imports: [IonContent],
  template: `
  <ion-content>
    <main class="page">
      <header class="page-head"><h1>Compte</h1></header>

      <section class="panel me">
        <div class="avatar" aria-hidden="true">{{ initials }}</div>
        <div class="who">
          <strong>{{ auth.userName || 'Passager' }}</strong>
          <span class="badge" [class.info]="auth.isAdmin">{{ auth.isAdmin ? 'Administrateur' : 'Passager' }}</span>
        </div>
      </section>

      <section class="panel">
        <h2>Contribuer</h2>
        <p class="sub">Dans un bus, partagez votre position depuis l’onglet À bord : les autres passagers voient ce bus avancer sur la carte.</p>
        <button type="button" class="btn block" (click)="go('/bus')">Partager ma position</button>
      </section>

      <button type="button" class="btn danger block out" (click)="logout()">Se déconnecter</button>
    </main>
  </ion-content>`,
  styles: [`
    .me { display: flex; align-items: center; gap: 16px; }
    .avatar { width: 60px; height: 60px; border-radius: 50%; display: grid; place-items: center; background: var(--board); color: var(--led);
      font: 800 24px var(--font-led); text-shadow: 0 0 8px rgba(255,181,32,.45); flex: none; }
    .who { display: grid; gap: 6px; justify-items: start; min-width: 0; }
    .who strong { font: 700 20px var(--font-display); overflow-wrap: anywhere; }
    .out { margin-top: 18px; }
  `]
})
export class ComptePage {
  constructor(public auth: AuthService, private router: Router) {}
  get initials() {
    const parts = (this.auth.userName || 'P').trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase() ?? '').join('') || 'P';
  }
  go(url: string) { void this.router.navigateByUrl(url); }
  logout() { this.auth.logout(); void this.router.navigateByUrl('/connexion', { replaceUrl: true }); }
}
