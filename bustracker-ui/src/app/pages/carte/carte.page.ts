import { Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonIcon, AlertController, ToastController } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { swapHorizontal, add, remove, locateOutline, addCircleOutline, close, bus } from 'ionicons/icons';
import { ViewDidEnter, ViewWillLeave } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import * as L from 'leaflet';
import { interval, Subscription, startWith, switchMap, catchError, of } from 'rxjs';
import { BusService, BusPosition, Line, LineStop } from '../../services/bus.service';
import { AuthService } from '../../services/auth.service';

/**
 * Carte "façon Waze" : fond OpenStreetMap (gratuit, via Leaflet), bus en direct fournis par les passagers,
 * itinéraire routier calculé par OSRM (gratuit), arrêts ajoutés par la communauté.
 */
const MAURICE: L.LatLngExpression = [-20.25, 57.5];
const DEFAULT_KMH = 18;   // vitesse supposée quand le bus ne transmet pas la sienne
const BUS_AHEAD_TOLERANCE_M = 30;
const OFF_ROUTE_M = 250;  // un bus plus loin que ça de la ligne n'est pas pris en compte

/** Trajet sous forme de ligne brisée avec distances cumulées (mètres). */
class Path {
  readonly cum: number[] = [0];
  constructor(readonly pts: L.LatLng[]) {
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i - 1].distanceTo(pts[i]));
  }
  get length() { return this.cum[this.cum.length - 1]; }
  /** Projette un point sur le trajet : abscisse curviligne s (m) et écart d (m). */
  project(lat: number, lng: number): { s: number; d: number } {
    const k = Math.cos((lat * Math.PI) / 180);
    let best = { s: 0, d: Infinity };
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const ax = (a.lng - lng) * k, ay = a.lat - lat, bx = (b.lng - lng) * k, by = b.lat - lat;
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
      const px = ax + t * dx, py = ay + t * dy;
      const d = Math.hypot(px, py) * 111320;
      if (d < best.d) best = { s: this.cum[i - 1] + t * (this.cum[i] - this.cum[i - 1]), d };
    }
    return best;
  }
}

interface Eta { bus: BusPosition; waitMin: number; tripMin: number; distKm: number; nextStopName: string; nextStopMin: number; }

@Component({
  selector: 'app-carte', standalone: true, encapsulation: ViewEncapsulation.None,
  imports: [IonContent, IonIcon],
  template: `
  <ion-content [scrollY]="false" [fullscreen]="true">
    <div id="map" role="application" aria-label="Carte des bus en direct"></div>

    <section class="bt-top">
      <div class="bt-board">
        <div class="bt-line">
          <span class="led bt-num">{{ line?.number || '—' }}</span>
          <span class="bt-dest">
            <span class="led bt-destname">{{ destName }}</span>
            <small>{{ originName }}</small>
          </span>
          <button type="button" class="bt-swap" aria-label="Inverser le sens" [disabled]="!line" (click)="swapDirection()"><ion-icon name="swap-horizontal"></ion-icon></button>
          <select class="bt-pick" aria-label="Choisir une ligne" (change)="onLine($any($event.target).value)">
            <option value="">Choisir une ligne…</option>
            @for (l of lines; track l.id) { <option [value]="l.id" [selected]="line?.id === l.id">{{l.number}} · {{l.name}}</option> }
          </select>
        </div>
        @if (stops.length) {
          <div class="bt-trip">
            <div class="bt-dots" aria-hidden="true"><i></i><b></b><i></i></div>
            <select aria-label="Arrêt de départ" (change)="from = +$any($event.target).value; onTrip()">
              @for (s of stops; track s.id; let i = $index) { <option [value]="i" [selected]="i === from">{{s.name}}</option> }
            </select>
            <select aria-label="Arrêt de destination" (change)="to = +$any($event.target).value; onTrip()">
              @for (s of stops; track s.id; let i = $index) { <option [value]="i" [selected]="i === to">{{s.name}}</option> }
            </select>
          </div>
        }
      </div>
      @if (error) { <p class="bt-msg err" role="alert">{{error}}</p> }
      @if (adding) {
        <p class="bt-msg">Touchez la carte à l’endroit du nouvel arrêt.<button type="button" (click)="toggleAdd()">Annuler</button></p>
      }
    </section>

    <section class="bt-bottom">
      <div class="bt-fabs">
        <button type="button" class="bt-fab zoom" aria-label="Zoom avant" (click)="map?.zoomIn()"><ion-icon name="add"></ion-icon></button>
        <button type="button" class="bt-fab zoom" aria-label="Zoom arrière" (click)="map?.zoomOut()"><ion-icon name="remove"></ion-icon></button>
        <button type="button" class="bt-fab" aria-label="Centrer sur ma position" (click)="locate()"><ion-icon name="locate-outline"></ion-icon></button>
        <button type="button" class="bt-fab add" [class.on]="adding" [attr.aria-pressed]="adding" aria-label="Ajouter un arrêt" (click)="toggleAdd()"><ion-icon [name]="adding ? 'close' : 'add-circle-outline'"></ion-icon></button>
      </div>

      <div class="bt-sheet" [class.min]="minimized">
        <button type="button" class="bt-grab" [attr.aria-label]="minimized ? 'Agrandir le panneau' : 'Réduire le panneau'" [attr.aria-expanded]="!minimized" (click)="minimized = !minimized"><i></i></button>

        @if (eta) {
          <div class="bt-eta-row">
            <div class="led bt-eta" role="img" [attr.aria-label]="'Arrivée dans ' + eta.tripMin + ' minutes'"><b>{{eta.tripMin}}</b><i>min</i></div>
            <div class="bt-eta-info">
              <strong>Bus {{eta.bus.bus_number}}</strong>
              <span>{{eta.bus.registration_number}} · passe à {{stops[from].name}} dans {{eta.waitMin}} min</span>
            </div>
            <span class="badge" [class.ok]="!eta.bus.is_stale" [class.live]="!eta.bus.is_stale" [class.warn]="eta.bus.is_stale">{{eta.bus.is_stale ? 'Position ancienne' : 'En direct'}}</span>
          </div>
          @if (!minimized) {
            <dl class="bt-facts">
              <div><dt>Distance</dt><dd>{{km(eta.distKm)}} km</dd></div>
              <div><dt>Arrivée</dt><dd>{{arrival(eta.tripMin)}}</dd></div>
              <div><dt>Prochain arrêt</dt><dd>{{eta.nextStopName}} · {{eta.nextStopMin}} min</dd></div>
            </dl>
          }
        } @else {
          <div class="bt-idle">
            <strong>{{summary}}</strong>
            <span>{{buses.length}} bus en circulation · mise à jour toutes les 5 s</span>
          </div>
        }

        @if (!minimized) {
          <div class="bt-body">
            @if (stops.length) {
              <ol class="bt-stops">
                @for (s of stops; track s.id; let i = $index) {
                  <li [class.on]="i >= from && i <= to" [class.end]="i === from || i === to" [class.dest]="i === to">
                    <span class="pin"></span><span class="nm">{{s.name}}</span>
                  </li>
                }
              </ol>
            }
          </div>
        }

        <div class="bt-foot">
          <button type="button" class="btn primary block bt-share" (click)="share()"><ion-icon name="bus"></ion-icon>Je suis dans le bus : partager ma position</button>
          @if (!minimized) { <p class="bt-credit">Carte © OpenStreetMap · itinéraires OSRM</p> }
        </div>
      </div>
    </section>
  </ion-content>`,
  styles: [`
  app-carte { display: block; height: 100%; }
  app-carte ion-content { --background: #dfe9ea; }
  app-carte #map { position: absolute; inset: 0; z-index: 0; }

  /* Tableau de destination */
  .bt-top { position: absolute; z-index: 1100; top: calc(10px + env(safe-area-inset-top, 0px)); left: 10px; right: 10px; max-width: 560px; margin: 0 auto; display: grid; gap: 8px; pointer-events: none; }
  .bt-top > * { pointer-events: auto; }
  .bt-board { background: var(--board); border-radius: 20px; box-shadow: var(--shadow-float); overflow: hidden; }
  .bt-line { position: relative; display: flex; align-items: center; gap: 12px; padding: 12px 12px 12px 14px; min-height: 64px; }
  .bt-num { flex: none; min-width: 64px; padding: 6px 8px; text-align: center; font-size: 38px; border-radius: 10px; border: 1.5px solid rgba(255,181,32,.35); }
  .bt-dest { flex: 1; min-width: 0; display: grid; gap: 4px; }
  .bt-destname { background: none; font-size: 21px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bt-dest small { color: #9fbcc2; font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bt-swap { position: relative; z-index: 2; flex: none; width: 44px; height: 44px; border: 0; border-radius: 50%; background: rgba(255,255,255,.1); color: #fff; font-size: 22px; display: grid; place-items: center; cursor: pointer; }
  .bt-swap:disabled { opacity: .3; }
  .bt-pick { position: absolute; top: 0; bottom: 0; left: 0; right: 64px; width: calc(100% - 64px); height: 100%; opacity: 0; cursor: pointer; font-size: 16px; }
  .bt-trip { display: grid; grid-template-columns: 20px minmax(0,1fr); grid-template-rows: auto auto; gap: 0 8px; padding: 10px 12px 12px 14px; background: var(--paper); }
  .bt-trip select { grid-column: 2; width: 100%; min-width: 0; min-height: 42px; border: 0; background: transparent; color: var(--ink); font: 700 15px var(--font-body); text-overflow: ellipsis; padding: 0 4px; }
  .bt-trip select + select { border-top: 1px solid var(--line); }
  .bt-dots { grid-row: 1 / 3; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; }
  .bt-dots i { width: 10px; height: 10px; border-radius: 50%; border: 3px solid var(--lagon); display: block; }
  .bt-dots i:last-child { border-radius: 3px; background: var(--flam); border-color: var(--flam); }
  .bt-dots b { width: 3px; height: 16px; background: repeating-linear-gradient(var(--line) 0 3px, transparent 3px 6px); }
  .bt-msg { margin: 0; justify-self: start; display: flex; align-items: center; gap: 10px; padding: 9px 14px; border-radius: 999px; background: var(--board); color: #fff; font-size: 14px; font-weight: 600; box-shadow: var(--shadow-float); }
  .bt-msg.err { background: var(--flam-soft); color: var(--flam-ink); }
  .bt-msg button { border: 0; background: rgba(255,255,255,.14); color: #fff; border-radius: 999px; padding: 4px 10px; font: 700 13px var(--font-body); cursor: pointer; }

  /* Boutons flottants + panneau */
  .bt-bottom { position: absolute; z-index: 1100; left: 0; right: 0; max-width: 640px; margin: 0 auto; bottom: calc(62px + env(safe-area-inset-bottom, 0px)); padding: 0 10px 10px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; pointer-events: none; }
  .bt-bottom > * { pointer-events: auto; }
  .bt-fabs { display: flex; flex-direction: column; gap: 8px; }
  .bt-fab { width: 48px; height: 48px; border: 0; border-radius: 50%; background: var(--paper); color: var(--ink); font-size: 24px; display: grid; place-items: center; box-shadow: var(--shadow-float); cursor: pointer; }
  .bt-fab.add { background: var(--flam); color: #fff; }
  .bt-fab.add.on { background: var(--board); }
  @media (hover: none) { .bt-fab.zoom { display: none; } }

  .bt-sheet { width: 100%; box-sizing: border-box; max-height: min(40vh, 340px); display: flex; flex-direction: column; background: var(--paper); border-radius: 24px; box-shadow: var(--shadow-float); padding: 0 16px 14px; color: var(--ink); }
  .bt-grab { border: 0; background: none; padding: 10px 0 8px; display: grid; place-items: center; width: 100%; cursor: pointer; }
  .bt-grab i { width: 40px; height: 5px; border-radius: 3px; background: var(--line); display: block; }

  .bt-eta-row { display: flex; align-items: center; gap: 12px; }
  .bt-eta { flex: none; display: flex; align-items: baseline; gap: 4px; padding: 8px 12px; border-radius: 12px; }
  .bt-eta b { font-size: 36px; font-weight: 800; }
  .bt-eta i { font-style: normal; font-size: 15px; font-weight: 700; }
  .bt-eta-info { flex: 1; min-width: 0; display: grid; gap: 2px; }
  .bt-eta-info strong { font: 700 18px var(--font-display); }
  .bt-eta-info span { color: var(--ink-2); font-size: 13px; line-height: 1.35; }
  .bt-facts { display: grid; grid-template-columns: auto auto 1fr; gap: 6px 18px; margin: 14px 0 0; padding-top: 12px; border-top: 1px solid var(--line); }
  .bt-facts dt { color: var(--ink-3); font-size: 12px; font-weight: 600; }
  .bt-facts dd { margin: 2px 0 0; font-weight: 700; font-size: 14px; overflow-wrap: anywhere; }
  .bt-idle { display: grid; gap: 4px; padding: 2px 0 4px; }
  .bt-idle strong { font: 700 17px var(--font-display); line-height: 1.3; }
  .bt-idle span { color: var(--ink-2); font-size: 13px; }

  .bt-body { overflow-y: auto; min-height: 0; margin-top: 12px; }
  .bt-stops { margin-bottom: 0 !important; }
  .bt-stops { list-style: none; margin: 0 0 12px; padding: 0; }
  .bt-stops li { display: grid; grid-template-columns: 24px 1fr; align-items: center; padding: 7px 0; position: relative; color: var(--ink-3); font-size: 14px; font-weight: 600; }
  .bt-stops li::before { content: ''; position: absolute; left: 11px; top: 0; bottom: 0; width: 3px; background: var(--line); }
  .bt-stops li:first-child::before { top: 50%; } .bt-stops li:last-child::before { bottom: 50%; }
  .bt-stops li.on { color: var(--ink); } .bt-stops li.on::before { background: var(--lagon); }
  .bt-stops .pin { width: 13px; height: 13px; border-radius: 50%; border: 3px solid var(--line); background: var(--paper); margin-left: 5px; position: relative; z-index: 1; box-sizing: border-box; }
  .bt-stops li.on .pin { border-color: var(--lagon); } .bt-stops li.end .pin { background: var(--lagon); }
  .bt-stops li.dest .pin { background: var(--flam); border-color: var(--flam); }
  .bt-foot { flex: none; padding-top: 12px; }
  .bt-share { min-height: 54px; font-size: 16px; box-shadow: 0 6px 16px rgba(228,73,43,.35); }
  .bt-share ion-icon { font-size: 22px; }
  .bt-credit { text-align: center; font-size: 11px; color: var(--ink-3); margin: 10px 0 0; }
  .bt-sheet.min .bt-body { display: none; }
  `]
})
export class CartePage implements ViewDidEnter, ViewWillLeave, OnDestroy {
  map?: L.Map;
  lines: Line[] = []; line?: Line; dir: 'AB' | 'BA' = 'AB';
  stops: LineStop[] = []; from = 0; to = 0;
  buses: BusPosition[] = []; eta: Eta | null = null;
  summary = 'Choisissez une ligne pour voir le prochain bus.';
  error = ''; adding = false; minimized = false;

  private path?: Path; private stopS: number[] = [];
  private busMarkers = new Map<number, L.Marker>();
  private routeLayer = L.layerGroup(); private stopLayer = L.layerGroup();
  private meMarker?: L.Marker; private watchId?: string;
  private sub?: Subscription; private routeKey = '';

  constructor(private api: BusService, private auth: AuthService, private router: Router,
              private alerts: AlertController, private toasts: ToastController) {
    addIcons({ swapHorizontal, add, remove, locateOutline, addCircleOutline, close, bus });
  }

  /* Tableau de destination */
  get originName() { return this.line ? 'depuis ' + (this.dir === 'AB' ? this.line.terminus_a : this.line.terminus_b) : 'Touchez ici pour voir les bus d’une ligne'; }
  get destName() { return this.line ? (this.dir === 'AB' ? this.line.terminus_b : this.line.terminus_a) : 'Choisir une ligne'; }
  km(v: number) { return v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }

  ionViewDidEnter() {
    if (!this.map) {
      this.map = L.map('map', { zoomControl: false, attributionControl: false }).setView(MAURICE, 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(this.map);
      this.routeLayer.addTo(this.map); this.stopLayer.addTo(this.map);
      this.map.on('click', (e: L.LeafletMouseEvent) => { if (this.adding) void this.addStopAt(e.latlng); });
    }
    setTimeout(() => this.map?.invalidateSize(), 150);
    this.api.getLines().subscribe({ next: x => this.lines = x, error: () => this.error = 'Impossible de charger les lignes (API démarrée ?)' });
    this.sub = interval(5000).pipe(
      startWith(0),
      switchMap(() => this.api.getPositions().pipe(catchError(() => of([] as BusPosition[]))))
    ).subscribe(rows => { this.buses = rows; this.updateBusMarkers(); this.compute(); });
    void this.startLocation();
  }
  ionViewWillLeave() { this.sub?.unsubscribe(); void this.stopLocation(); }
  ngOnDestroy() { this.sub?.unsubscribe(); void this.stopLocation(); this.map?.remove(); }

  /* ---------- Ligne et trajet ---------- */
  onLine(id: string) {
    this.line = this.lines.find(l => l.id === +id);
    this.dir = 'AB'; this.loadStops();
  }
  swapDirection() { this.dir = this.dir === 'AB' ? 'BA' : 'AB'; this.loadStops(); }
  private loadStops() {
    this.error = ''; this.eta = null; this.stops = []; this.path = undefined; this.routeLayer.clearLayers(); this.stopLayer.clearLayers();
    if (!this.line) { this.summary = 'Choisissez une ligne pour voir le prochain bus.'; return; }
    this.api.getLineStops(this.line.id, this.dir).subscribe({
      next: rows => {
        this.stops = rows;
        if (rows.length < 2) { this.summary = 'Cette ligne n’a pas encore d’arrêts dans ce sens.'; return; }
        this.from = 0; this.to = rows.length - 1; void this.drawRoute();
      },
      error: () => this.error = 'Impossible de charger les arrêts de la ligne.'
    });
  }
  onTrip() {
    if (this.to <= this.from) { this.error = 'La destination doit venir après le départ.'; this.to = Math.min(this.stops.length - 1, this.from + 1); if (this.to <= this.from) this.from = Math.max(0, this.to - 1); } else this.error = '';
    this.drawStops(); this.compute();
  }

  private async drawRoute() {
    this.routeLayer.clearLayers();
    const straight = this.stops.map(s => L.latLng(s.latitude, s.longitude));
    let pts = straight;
    // Itinéraire routier gratuit (OSRM public). En cas d'échec, on relie simplement les arrêts.
    const key = this.stops.map(s => s.id).join('-');
    try {
      if (this.stops.length <= 90) {
        const coords = this.stops.map(s => `${s.longitude},${s.latitude}`).join(';');
        const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`);
        const data = await res.json();
        const geo: number[][] | undefined = data?.routes?.[0]?.geometry?.coordinates;
        if (geo?.length) pts = geo.map(c => L.latLng(c[1], c[0]));
      }
    } catch { /* hors ligne : trait droit */ }
    this.routeKey = key;
    L.polyline(pts, { color: '#fff', weight: 11, opacity: .95 }).addTo(this.routeLayer);
    L.polyline(pts, { color: '#0f7c8a', weight: 7 }).addTo(this.routeLayer);
    this.path = new Path(pts);
    this.stopS = this.stops.map(s => this.path!.project(s.latitude, s.longitude).s);
    this.drawStops();
    this.map?.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [30, 230], paddingBottomRight: [30, 300] });
    this.compute();
  }
  private drawStops() {
    this.stopLayer.clearLayers();
    this.stops.forEach((s, i) => {
      const end = i === this.from, dest = i === this.to;
      const icon = L.divIcon({ className: '', html: `<div class="bt-stop${end ? ' end' : ''}${dest ? ' dest' : ''}"></div>`, iconSize: [12, 12], iconAnchor: [6, 6] });
      L.marker([s.latitude, s.longitude], { icon, title: s.name }).bindTooltip(s.name).addTo(this.stopLayer);
    });
  }

  /* ---------- Bus en direct et ETA ---------- */
  private updateBusMarkers() {
    if (!this.map) return;
    const seen = new Set<number>();
    for (const p of this.buses) {
      seen.add(p.id);
      const broken = p.operational_state === 'panne';
      const html = `<div class="bt-bus${p.is_stale ? ' old' : ''}${broken ? ' broken' : ''}">${this.esc(p.bus_number)}</div>`;
      const pos: L.LatLngExpression = [Number(p.latitude), Number(p.longitude)];
      const m = this.busMarkers.get(p.id);
      if (m) { m.setLatLng(pos); m.setIcon(L.divIcon({ className: '', html, iconSize: [48, 28], iconAnchor: [24, 14] })); }
      else {
        const nm = L.marker(pos, { icon: L.divIcon({ className: '', html, iconSize: [48, 28], iconAnchor: [24, 14] }), zIndexOffset: 500 }).addTo(this.map);
        this.busMarkers.set(p.id, nm);
      }
      this.busMarkers.get(p.id)!.bindPopup(`<strong>Bus ${this.esc(p.bus_number)}</strong><br>${this.esc(p.registration_number)}<br>${p.last_speed_kmh == null ? '' : Math.round(p.last_speed_kmh) + ' km/h<br>'}${p.is_stale ? 'Position ancienne' : 'Position récente'}<br>État : ${this.esc(this.stateLabel(p.operational_state))}`);
    }
    for (const [id, m] of this.busMarkers) if (!seen.has(id)) { m.remove(); this.busMarkers.delete(id); }
  }

  private compute() {
    this.eta = null;
    if (!this.line || !this.path || this.stops.length < 2) return;
    const sFrom = this.stopS[this.from], sTo = this.stopS[this.to];
    let best: { b: BusPosition; s: number; v: number } | null = null;
    for (const b of this.buses) {
      if (b.line_id != null && b.line_id !== this.line.id) continue;
      if (b.direction && b.direction !== this.dir) continue;
      const pr = this.path.project(Number(b.latitude), Number(b.longitude));
      if (pr.d > OFF_ROUTE_M || pr.s > sFrom + BUS_AHEAD_TOLERANCE_M) continue;   // pas sur la ligne, ou déjà passé
      if (!best || pr.s > best.s) best = { b, s: pr.s, v: b.last_speed_kmh && b.last_speed_kmh >= 8 ? b.last_speed_kmh : DEFAULT_KMH };
    }
    this.busMarkers.forEach(m => m.getElement()?.querySelector('.bt-bus')?.classList.remove('best'));
    if (!best) { this.summary = `Aucun bus en approche de ${this.stops[this.from].name}.`; return; }
    const mps = best.v / 3.6;
    const nextIndex = this.stopS.findIndex(s => s > best!.s + BUS_AHEAD_TOLERANCE_M);
    const nextS = nextIndex >= 0 ? this.stopS[nextIndex] : this.path.length;
    const nextName = nextIndex >= 0 ? this.stops[nextIndex].name : this.stops[this.stops.length - 1].name;
    this.eta = {
      bus: best.b,
      waitMin: Math.max(1, Math.round(Math.max(0, sFrom - best.s) / mps / 60)),
      tripMin: Math.max(1, Math.round(Math.max(0, sTo - best.s) / mps / 60)),
      distKm: Math.max(0, sTo - Math.max(0, best.s)) / 1000,
      nextStopName: nextName,
      nextStopMin: Math.max(1, Math.round(Math.max(0, nextS - best.s) / mps / 60))
    };
    this.busMarkers.get(best.b.id)?.getElement()?.querySelector('.bt-bus')?.classList.add('best');
  }
  arrival(min: number) { return new Date(Date.now() + min * 60000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); }
  private stateLabel(state?: string) { return ({marche:'En marche',arret:'À l’arrêt',panne:'En panne',transfert:'En transfert',school:'Service scolaire',plein:'Complet'} as Record<string,string>)[state || ''] || 'État non précisé'; }

  /* ---------- Position de l'utilisateur ---------- */
  private async startLocation() {
    try {
      this.watchId = await Geolocation.watchPosition({ enableHighAccuracy: true }, pos => {
        if (!pos || !this.map) return;
        const ll: L.LatLngExpression = [pos.coords.latitude, pos.coords.longitude];
        if (this.meMarker) this.meMarker.setLatLng(ll);
        else this.meMarker = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="bt-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false, zIndexOffset: 900 }).addTo(this.map);
      });
    } catch { /* localisation refusée : la carte reste utilisable */ }
  }
  private async stopLocation() { if (this.watchId) { try { await Geolocation.clearWatch({ id: this.watchId }); } catch {} this.watchId = undefined; } }
  locate() { if (this.meMarker) this.map?.setView(this.meMarker.getLatLng(), 16); else void this.notify('Position GPS indisponible. Autorisez la localisation.'); }

  /* ---------- Contribution : ajouter un arrêt (comme Waze) ---------- */
  toggleAdd() { this.adding = !this.adding; }
  private async addStopAt(ll: L.LatLng) {
    this.adding = false;
    const a = await this.alerts.create({
      header: 'Nouvel arrêt', inputs: [{ name: 'name', type: 'text', placeholder: 'Nom de l’arrêt', attributes: { maxlength: 100 } }],
      buttons: [{ text: 'Annuler', role: 'cancel' }, { text: 'Ajouter', role: 'confirm' }]
    });
    await a.present();
    const r = await a.onDidDismiss();
    const name = String(r.data?.values?.name ?? '').trim();
    if (r.role !== 'confirm' || !name) return;
    this.api.createStop(name, ll.lat, ll.lng).subscribe({
      next: s => { void this.notify(s.created ? `Arrêt « ${s.name} » ajouté` : `« ${s.name} » existe déjà à cet endroit`);
        L.marker([s.latitude, s.longitude], { icon: L.divIcon({ className: '', html: '<div class="bt-stop end"></div>', iconSize: [12, 12], iconAnchor: [6, 6] }) }).bindTooltip(s.name).addTo(this.map!); },
      error: e => void this.notify(e?.status === 401 ? 'Connectez-vous pour ajouter un arrêt.' : (e?.error?.error || e?.error?.message || 'Ajout impossible.'))
    });
  }
  private async notify(message: string) { (await this.toasts.create({ message, duration: 2600, position: 'top', cssClass: 'bt-toast' })).present(); }

  share() { void this.router.navigateByUrl('/bus'); }
  private esc(v: unknown): string { return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)); }
}
