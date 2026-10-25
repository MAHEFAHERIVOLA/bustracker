import { Component, OnDestroy, inject } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { IonContent, ToastController } from '@ionic/angular/standalone';
import { Geolocation } from '@capacitor/geolocation';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { BusService, Line, Stop } from '../../services/bus.service';

@Component({
  selector: 'app-bus', standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ReactiveFormsModule, IonContent],
  template: `
  <ion-content>
    <main class="page">
      <header class="page-head">
        <h1>À bord</h1>
        <p>Bonjour {{ auth.userName || 'passager' }}. Votre position aide les autres passagers à voir ce bus arriver.</p>
      </header>

      <div class="seg" role="tablist" aria-label="Partager ou signaler">
        <button type="button" role="tab" [attr.aria-selected]="tab === 'share'" (click)="tab = 'share'">Partager ma position</button>
        <button type="button" role="tab" [attr.aria-selected]="tab === 'report'" (click)="tab = 'report'">Signaler un problème</button>
      </div>

      @if (tab === 'share') {
        @if (sharing) {
          <section class="live" aria-live="polite">
            <div class="live-top">
              <span class="badge ok live">Partage en cours</span>
              <span class="since">{{ lastSent ? 'Dernier envoi à ' + (lastSent | date:'HH:mm:ss') : 'Premier envoi en cours…' }}</span>
            </div>
            <div class="live-bus">
              <span class="led num">{{ form.value.busNumber }}</span>
              <span class="plate">{{ form.value.registrationNumber?.toUpperCase() }}<small>{{ form.value.direction === 'AB' ? 'Sens aller' : 'Sens retour' }}</small></span>
            </div>
            @if (lastCoords) { <p class="coords">{{ lastCoords.lat | number:'1.5-5' }}, {{ lastCoords.lng | number:'1.5-5' }}</p> }
          </section>
          <button type="button" class="btn danger block stop" (click)="stop()">Arrêter le partage</button>
          <p class="hint">Arrêtez le partage en descendant du bus. Il continue même si vous changez d’onglet.</p>
        } @else {
          <form class="panel" [formGroup]="form" (ngSubmit)="start()" novalidate>
            <h2>Dans quel bus êtes-vous ?</h2>
            <p class="sub">Saisissez ce qui est écrit sur le bus et sur sa plaque.</p>

            <div class="field-row">
              <label class="field" [class.invalid]="bad('registrationNumber')">
                <span>Immatriculation</span>
                <input formControlName="registrationNumber" placeholder="ABC123" maxlength="12" autocapitalize="characters" autocomplete="off">
                @if (bad('registrationNumber')) { <small class="err">3 caractères minimum.</small> }
              </label>
              <label class="field" [class.invalid]="bad('busNumber')">
                <span>Numéro du bus</span>
                <input formControlName="busNumber" placeholder="163" maxlength="10" inputmode="numeric" autocomplete="off">
                @if (bad('busNumber')) { <small class="err">Numéro requis.</small> }
              </label>
            </div>

            <div class="field">
              <span class="field-label">Sens du trajet</span>
              <div class="choices" role="group" aria-label="Sens du trajet">
                <button type="button" [attr.aria-pressed]="form.value.direction === 'AB'" (click)="form.controls.direction.setValue('AB')">Aller (A vers B)</button>
                <button type="button" [attr.aria-pressed]="form.value.direction === 'BA'" (click)="form.controls.direction.setValue('BA')">Retour (B vers A)</button>
              </div>
            </div>

            <label class="field">
              <span>Ligne <small>(facultatif)</small></span>
              <select formControlName="lineId">
                <option [ngValue]="null">Aucune ligne sélectionnée</option>
                @for (line of lines; track line.id) { <option [ngValue]="line.id">{{ line.number }} · {{ line.name }}</option> }
              </select>
            </label>
            <label class="field">
              <span>Arrêt de montée <small>(facultatif)</small></span>
              <select formControlName="boardingStopId">
                <option [ngValue]="null">Non précisé</option>
                @for (stop of stops; track stop.id) { <option [ngValue]="stop.id">{{ stop.name }}</option> }
              </select>
            </label>

            <button type="submit" class="btn primary block" [disabled]="loading">{{ loading ? 'Démarrage…' : 'Démarrer le partage' }}</button>
          </form>
          <p class="hint">Le partage utilise la localisation de votre appareil. Votre navigateur ou Android vous demandera l’autorisation la première fois.</p>
        }
      } @else {
        <section class="panel">
          <h2>Signaler un problème</h2>
          <p class="sub">Un administrateur vérifie chaque signalement avant de modifier l’état officiel du bus.</p>

          <div class="field-row">
            <label class="field">
              <span>Immatriculation</span>
              <input [(ngModel)]="reportPlate" name="reportPlate" placeholder="ABC123" maxlength="12" autocapitalize="characters" autocomplete="off">
            </label>
            <label class="field">
              <span>Numéro du bus</span>
              <input [(ngModel)]="reportBusNumber" name="reportBusNumber" placeholder="163" maxlength="10" inputmode="numeric" autocomplete="off">
            </label>
          </div>

          <div class="field">
            <span class="field-label">Type de problème</span>
            <div class="choices" role="group" aria-label="Type de problème">
              @for (c of categories; track c.value) {
                <button type="button" [attr.aria-pressed]="reportCategory === c.value" (click)="reportCategory = c.value">{{ c.label }}</button>
              }
            </div>
          </div>

          @if (reportCategory === 'panne' || reportCategory === 'etat_incorrect') {
            <div class="field">
              <span class="field-label">État du bus</span>
              <div class="choices" role="group" aria-label="État du bus">
                @for (s of states; track s.value) {
                  <button type="button" [attr.aria-pressed]="reportState === s.value" (click)="reportState = s.value">{{ s.label }}</button>
                }
              </div>
            </div>
          }

          <label class="field">
            <span>Ligne <small>(facultatif)</small></span>
            <select [(ngModel)]="reportLineId" name="reportLineId">
              <option [ngValue]="null">Non précisée</option>
              @for (line of lines; track line.id) { <option [ngValue]="line.id">{{ line.number }} · {{ line.name }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Arrêt concerné <small>(facultatif)</small></span>
            <select [(ngModel)]="reportStopId" name="reportStopId">
              <option [ngValue]="null">Non précisé</option>
              @for (stop of stops; track stop.id) { <option [ngValue]="stop.id">{{ stop.name }}</option> }
            </select>
          </label>
          <label class="field">
            <span>Description <small>(facultatif)</small></span>
            <textarea [(ngModel)]="reportDescription" name="reportDescription" maxlength="1000" placeholder="Que s’est-il passé ?"></textarea>
          </label>

          <button type="button" class="btn primary block" (click)="submitReport()" [disabled]="reportBusy">{{ reportBusy ? 'Envoi…' : 'Envoyer le signalement' }}</button>
        </section>
      }
    </main>
  </ion-content>`,
  styles: [`
    .seg { margin-bottom: 16px; }
    .live { background: var(--board); color: #fff; border-radius: var(--r-lg); padding: 18px; display: grid; gap: 16px; }
    .live-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
    .live .badge.ok { background: rgba(70,194,131,.18); color: #7ee2ad; }
    .since { color: #9fbcc2; font-size: 13px; font-weight: 600; }
    .live-bus { display: flex; align-items: center; gap: 14px; }
    .num { background: none; font-size: 56px; padding: 6px 14px; border-radius: 12px; border: 1.5px solid rgba(255,181,32,.35); min-width: 90px; text-align: center; }
    .plate { display: grid; gap: 4px; font: 700 22px var(--font-display); letter-spacing: .04em; }
    .plate small { font: 600 14px var(--font-body); letter-spacing: 0; color: #9fbcc2; }
    .coords { margin: 0; color: #9fbcc2; font-size: 13px; font-variant-numeric: tabular-nums; }
    .stop { margin-top: 14px; }
  `]
})
export class BusPage implements OnDestroy {
  private fb = inject(FormBuilder);
  lines: Line[] = []; stops: Stop[] = [];
  form = this.fb.group({
    registrationNumber: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(12)]],
    busNumber: ['', [Validators.required, Validators.maxLength(10)]],
    direction: ['AB' as 'AB'|'BA', Validators.required],
    lineId: [null as number|null],
    boardingStopId: [null as number|null]
  });
  tab: 'share' | 'report' = 'share';
  readonly categories = [
    { value: 'panne', label: 'Panne' }, { value: 'retard', label: 'Retard' }, { value: 'position_incorrecte', label: 'Position incorrecte' },
    { value: 'etat_incorrect', label: 'État incorrect' }, { value: 'autre', label: 'Autre' }
  ];
  readonly states = [
    { value: 'panne', label: 'En panne' }, { value: 'marche', label: 'En marche' }, { value: 'arret', label: 'À l’arrêt' }, { value: 'plein', label: 'Complet' }
  ];
  sharing = false; loading = false; sessionId: number|null = null;
  bad(name: 'registrationNumber' | 'busNumber') { const c = this.form.controls[name]; return c.invalid && (c.touched || c.dirty); }
  reportPlate=''; reportBusNumber=''; reportLineId:number|null=null; reportStopId:number|null=null; reportCategory='panne'; reportState='panne'; reportDescription=''; reportBusy=false;
  lastSent: Date|null = null; lastCoords: {lat:number;lng:number}|null = null;
  private watchId: string|null = null; private lastSentTs = 0;
  constructor(private api: BusService, public auth: AuthService, private toast: ToastController, private router: Router) {
    this.api.getLines().subscribe({next: x => this.lines = x, error: () => {}});
    this.api.getStops().subscribe({next: x => this.stops = x, error: () => {}});
  }
  async start() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading = true;
    try {
      // Le navigateur ou Android affiche sa demande de permission au premier accès GPS.
      const current = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000 });
      const v = this.form.getRawValue();
      const result = await firstValueFrom(this.api.startTracking({
        registrationNumber: v.registrationNumber!.trim().toUpperCase(),
        busNumber: v.busNumber!.trim(), direction: v.direction!,
        lineId: v.lineId, boardingStopId: v.boardingStopId,
        lat: current.coords.latitude, lng: current.coords.longitude
      }));
      this.sessionId = result.sessionId;
      this.sharing = true;
      this.onPosition(current.coords.latitude, current.coords.longitude, current.coords.speed == null ? null : current.coords.speed * 3.6);
      this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true, timeout: 15000 }, (pos, err) => {
        if (!err && pos) this.onPosition(pos.coords.latitude, pos.coords.longitude, pos.coords.speed == null ? null : pos.coords.speed * 3.6);
      });
      await this.show('Partage démarré. Merci !');
    } catch (e: any) {
      await this.show(e?.error?.error || e?.error?.message || 'Impossible de démarrer. Vérifie le serveur, la base et la localisation.');
    } finally { this.loading = false; }
  }
  private onPosition(lat:number, lng:number, speed:number|null) {
    this.lastCoords = {lat,lng};
    const now = Date.now();
    if (now - this.lastSentTs < 5000 || this.sessionId == null) return;
    this.lastSentTs = now;
    this.api.sendPosition(this.sessionId, lat, lng, speed).subscribe({
      next: () => this.lastSent = new Date(),
      error: () => {}
    });
  }
  async submitReport() {
    if (!this.reportPlate.trim() || !this.reportBusNumber.trim()) { await this.show('Saisis l’immatriculation et le numéro du bus.'); return; }
    this.reportBusy = true;
    try {
      let coords: {lat:number;lng:number}|null = null;
      try { const p = await Geolocation.getCurrentPosition({timeout:5000}); coords = {lat:p.coords.latitude,lng:p.coords.longitude}; } catch { /* La position est facultative pour un signalement. */ }
      await firstValueFrom(this.api.createReport({
        registrationNumber:this.reportPlate.trim().toUpperCase(), busNumber:this.reportBusNumber.trim(),
        lineId:this.reportLineId, stopId:this.reportStopId, category:this.reportCategory,
        state:(this.reportCategory==='panne'||this.reportCategory==='etat_incorrect')?this.reportState:null,
        description:this.reportDescription.trim(), ...(coords || {})
      }));
      this.reportPlate=this.reportBusNumber=this.reportDescription=''; this.reportLineId=this.reportStopId=null;
      await this.show('Signalement envoyé. Il sera traité par un administrateur.');
    } catch (e:any) { await this.show(e?.error?.error || e?.error?.message || 'Impossible d’envoyer le signalement.'); }
    finally { this.reportBusy=false; }
  }
  async stop() {
    if (this.watchId) { await Geolocation.clearWatch({id:this.watchId}); this.watchId = null; }
    if (this.sessionId != null) {
      try { await firstValueFrom(this.api.stopTracking(this.sessionId)); } catch {}
    }
    this.sessionId = null; this.sharing = false;
    await this.show('Partage arrêté.');
  }
  logout() {
    void this.stop().finally(() => { this.auth.logout(); void this.router.navigateByUrl('/connexion'); });
  }
  private async show(message:string) { const t = await this.toast.create({message,duration:3000,position:'top',cssClass:'bt-toast'}); await t.present(); }
  ngOnDestroy() { if (this.watchId) void Geolocation.clearWatch({id:this.watchId}); }
}
