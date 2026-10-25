import { Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { IonContent } from '@ionic/angular/standalone';
import { AuthService } from '../../services/auth.service';

@Component({
  standalone: true, selector: 'app-auth',
  imports: [ReactiveFormsModule, IonContent],
  template: `
  <ion-content [fullscreen]="true">
    <div class="shell">
      <header class="hero">
        <svg class="route" viewBox="0 0 360 120" aria-hidden="true" focusable="false">
          <path d="M-10 92 C 60 92, 70 34, 140 34 S 250 86, 370 40" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="14" stroke-linecap="round"/>
          <path d="M-10 92 C 60 92, 70 34, 140 34 S 250 86, 370 40" fill="none" stroke="#4cc2cf" stroke-width="5" stroke-linecap="round"/>
          <circle cx="62" cy="80" r="7" fill="#09222b" stroke="#fff" stroke-width="3.5"/>
          <circle cx="140" cy="34" r="7" fill="#09222b" stroke="#fff" stroke-width="3.5"/>
          <circle cx="238" cy="70" r="7" fill="#09222b" stroke="#fff" stroke-width="3.5"/>
          <circle cx="322" cy="46" r="9" fill="#e4492b" stroke="#fff" stroke-width="3.5"/>
        </svg>
        <div class="brand">
          <span class="mark led" aria-hidden="true">B</span>
          <h1>BusTracker</h1>
        </div>
        <p class="tag">Les bus de Maurice, en direct.</p>
      </header>

      <main class="sheet">
        <div class="seg" role="tablist" aria-label="Connexion ou inscription">
          <button type="button" role="tab" [attr.aria-selected]="mode === 'login'" (click)="changeMode('login')">Connexion</button>
          <button type="button" role="tab" [attr.aria-selected]="mode === 'register'" (click)="changeMode('register')">Inscription</button>
        </div>

        <h2>{{ mode === 'login' ? 'Content de vous revoir' : 'Créer votre compte' }}</h2>
        <p class="lead">{{ mode === 'login' ? 'Connectez-vous pour suivre vos bus.' : 'Gratuit. Il suffit d’un nom, d’un e-mail et d’un mot de passe.' }}</p>

        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (mode === 'register') {
            <label class="field" [class.invalid]="bad('name')">
              <span>Nom complet</span>
              <input type="text" formControlName="name" autocomplete="name" placeholder="Yannel Mahefa">
              @if (bad('name')) { <small class="err">Saisissez votre nom.</small> }
            </label>
          }
          <label class="field" [class.invalid]="bad('email')">
            <span>Adresse e-mail</span>
            <input type="email" inputmode="email" formControlName="email" autocomplete="email" placeholder="vous@exemple.com">
            @if (bad('email')) { <small class="err">Saisissez une adresse e-mail valide.</small> }
          </label>
          <label class="field" [class.invalid]="bad('password')">
            <span>Mot de passe <small>(6 caractères minimum)</small></span>
            <div class="pw">
              <input [type]="show ? 'text' : 'password'" formControlName="password" [autocomplete]="mode === 'login' ? 'current-password' : 'new-password'">
              <button type="button" class="eye" (click)="show = !show" [attr.aria-label]="show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'">{{ show ? 'Masquer' : 'Afficher' }}</button>
            </div>
            @if (bad('password')) { <small class="err">Le mot de passe doit contenir au moins 6 caractères.</small> }
          </label>

          @if (error) { <p class="alert" role="alert">{{ error }}</p> }

          <button class="btn primary block" type="submit" [disabled]="loading">
            {{ loading ? 'Connexion en cours…' : (mode === 'login' ? 'Se connecter' : 'Créer mon compte') }}
          </button>
        </form>
      </main>
    </div>
  </ion-content>`,
  styles: [`
    ion-content { --background: var(--board); }
    .shell { min-height: 100%; display: flex; flex-direction: column; background: var(--board); }
    .hero { position: relative; padding: calc(34px + env(safe-area-inset-top, 0px)) 24px 20px; color: #fff; overflow: hidden; flex: none; min-height: 210px; display: flex; flex-direction: column; justify-content: flex-end; }
    .route { position: absolute; left: 0; right: 0; top: 0; width: 100%; height: 120px; opacity: .95; }
    .brand { display: flex; align-items: center; gap: 12px; position: relative; margin-top: 90px; }
    .mark { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 12px; font-size: 28px; border: 2px solid rgba(255,181,32,.5); }
    .brand h1 { color: #fff; font-size: 32px; line-height: 1; }
    .tag { position: relative; margin: 10px 0 0; color: #b5d2d7; font-size: 16px; }
    .sheet { flex: 1; background: var(--mist); border-radius: 28px 28px 0 0; padding: 22px 20px calc(28px + env(safe-area-inset-bottom, 0px)); width: 100%; box-sizing: border-box; }
    .sheet > * { max-width: 440px; margin-left: auto; margin-right: auto; }
    h2 { font-size: 24px; margin-top: 22px; }
    .lead { margin: 6px auto 20px; color: var(--ink-2); font-size: 15px; }
    .pw { position: relative; }
    .pw input { padding-right: 96px; }
    .eye { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); min-height: 38px; padding: 0 12px; border: 0; border-radius: 10px; background: transparent; color: var(--lagon-ink); font: 700 14px var(--font-body); cursor: pointer; }
    .alert { margin: 0 auto 14px; padding: 12px 14px; border-radius: var(--r-sm); background: var(--flam-soft); color: var(--flam-ink); font-size: 14px; font-weight: 600; line-height: 1.4; }
    @media (min-width: 700px) { .shell { background: var(--board); } .sheet { border-radius: 28px; margin: 0 auto 32px; max-width: 520px; flex: none; } }
  `]
})
export class AuthPage {
  private fb = inject(FormBuilder);
  mode: 'login' | 'register' = 'login'; loading = false; error = ''; show = false;
  form = this.fb.group({ name: [''], email: ['', [Validators.required, Validators.email]], password: ['', [Validators.required, Validators.minLength(6)]] });
  constructor(private auth: AuthService, private router: Router) {}
  bad(name: 'name' | 'email' | 'password') { const c = this.form.controls[name]; return c.invalid && (c.touched || c.dirty); }
  changeMode(value: 'login' | 'register') {
    this.mode = value; this.error = '';
    const name = this.form.controls.name;
    if (this.mode === 'register') name.setValidators([Validators.required, Validators.maxLength(80)]);
    else name.clearValidators();
    name.updateValueAndValidity();
  }
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true; this.error = '';
    const v = this.form.getRawValue();
    const request = this.mode === 'login'
      ? this.auth.login(v.email!.trim(), v.password!)
      : this.auth.register(v.name!.trim(), v.email!.trim(), v.password!);
    request.subscribe({
      next: () => { this.loading = false; void this.router.navigateByUrl('/carte'); },
      error: (e: HttpErrorResponse) => {
        this.loading = false;
        this.error = e.error?.error || e.error?.message
          || (e.status === 0 ? 'Le serveur ne répond pas. Vérifiez que l’API est démarrée et que apiUrl est correct dans environment.ts.' : 'Connexion impossible. Vérifiez votre e-mail et votre mot de passe.');
      }
    });
  }
}
