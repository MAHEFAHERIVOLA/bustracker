import { Component, OnInit } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { AlertController, ToastController, IonContent } from '@ionic/angular/standalone';
import { BusService, AdminBus, AdminSummary, AdminUser, BusReport, Line, Stop } from '../../services/bus.service';

@Component({
  selector: 'app-admin', standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, IonContent],
  template: `
  <ion-content>
    <main class="page wide">
      <header class="page-head">
        <h1>Administration</h1>
        <p>Confirmez les bus, organisez les lignes et traitez les signalements.</p>
      </header>

      @if (error) { <p class="alert" role="alert">{{ error }}</p> }

      @if (summary) {
        <dl class="stats">
          <div><dd>{{ summary.buses.total }}</dd><dt>Bus</dt></div>
          <div [class.hot]="summary.buses.pending > 0"><dd>{{ summary.buses.pending }}</dd><dt>À confirmer</dt></div>
          <div><dd>{{ summary.lines }}</dd><dt>Lignes</dt></div>
          <div><dd>{{ summary.stops }}</dd><dt>Arrêts</dt></div>
        </dl>
      }

      <nav class="chips" role="tablist" aria-label="Sections">
        @for (s of sections; track s.value) {
          <button type="button" role="tab" [attr.aria-selected]="section === s.value" (click)="section = s.value; onSectionChange()">{{ s.label }}</button>
        }
      </nav>

      <!-- ============ Bus ============ -->
      @if (section === 'buses') {
        <details class="fold">
          <summary>Ajouter un bus</summary>
          <div class="fold-body">
            <div class="field-row">
              <label class="field"><span>Immatriculation</span><input [(ngModel)]="busPlate" name="busPlate" placeholder="ABC123" maxlength="12" autocapitalize="characters"></label>
              <label class="field"><span>Numéro du bus</span><input [(ngModel)]="busNumber" name="busNumber" placeholder="163" maxlength="10"></label>
            </div>
            <label class="field"><span>Ligne habituelle <small>(facultatif)</small></span>
              <select [(ngModel)]="busLineId" name="busLineId"><option [ngValue]="null">Aucune</option>@for (l of lines; track l.id) { <option [ngValue]="l.id">{{ l.number }} · {{ l.name }}</option> }</select>
            </label>
            <button type="button" class="btn primary block" (click)="addBus()" [disabled]="busy">Ajouter le bus</button>
            <p class="hint">Un nouveau bus reste invisible sur la carte tant qu’il n’est pas confirmé.</p>
          </div>
        </details>

        <ul class="rows">
          @for (b of buses; track b.id) {
            <li class="row">
              <div class="main"><strong>{{ b.bus_number }}</strong><span>{{ b.registration_number }} · {{ b.line_number || 'Sans ligne' }}</span></div>
              <span class="badge" [class.ok]="b.approval_status === 'approved'" [class.bad]="b.approval_status === 'rejected'" [class.warn]="b.approval_status === 'pending'">{{ statusLabel(b.approval_status) }}</span>
              <div class="acts">
                @if (b.approval_status !== 'approved') { <button type="button" class="btn sm ok" (click)="approval(b, 'approved')">Confirmer</button> }
                @if (b.approval_status !== 'rejected') { <button type="button" class="btn sm danger" (click)="approval(b, 'rejected')">Refuser</button> }
                <button type="button" class="btn sm ghost" (click)="editBus(b)">Modifier</button>
                <button type="button" class="btn sm ghost" (click)="deleteBus(b)">Désactiver</button>
              </div>
            </li>
          } @empty {
            <li class="empty"><strong>Aucun bus enregistré</strong>Ajoutez le premier bus avec le bouton ci-dessus.</li>
          }
        </ul>
      }

      <!-- ============ Lignes ============ -->
      @if (section === 'lines') {
        <details class="fold">
          <summary>Créer une ligne</summary>
          <div class="fold-body">
            <div class="field-row">
              <label class="field"><span>Numéro de ligne</span><input [(ngModel)]="lineNumber" name="lineNumber" placeholder="163"></label>
              <label class="field"><span>Opérateur <small>(facultatif)</small></span><input [(ngModel)]="operator" name="operator"></label>
            </div>
            <label class="field"><span>Nom du trajet</span><input [(ngModel)]="lineName" name="lineName" placeholder="Port-Louis – Curepipe"></label>
            <div class="field-row">
              <label class="field"><span>Terminus A</span><input [(ngModel)]="terminusA" name="terminusA"></label>
              <label class="field"><span>Terminus B</span><input [(ngModel)]="terminusB" name="terminusB"></label>
            </div>
            <button type="button" class="btn primary block" (click)="addLine()" [disabled]="busy">Créer la ligne</button>
          </div>
        </details>

        <section class="panel">
          <h2>Ordre des arrêts</h2>
          <p class="sub">Touchez les arrêts dans l’ordre de passage du bus.</p>
          <div class="field-row">
            <label class="field"><span>Ligne</span>
              <select [(ngModel)]="selectedLineId" name="selectedLineId"><option [ngValue]="null">Choisir une ligne</option>@for (l of lines; track l.id) { <option [ngValue]="l.id">{{ l.number }} · {{ l.name }}</option> }</select>
            </label>
            <div class="field"><span class="field-label">Sens</span>
              <div class="choices"><button type="button" [attr.aria-pressed]="direction === 'AB'" (click)="direction = 'AB'">A vers B</button><button type="button" [attr.aria-pressed]="direction === 'BA'" (click)="direction = 'BA'">B vers A</button></div>
            </div>
          </div>
          <ul class="rows tight">
            @for (s of stops; track s.id) {
              <li class="row pick" [class.on]="selectedStopIds.includes(s.id)">
                <button type="button" class="pick-btn" [attr.aria-pressed]="selectedStopIds.includes(s.id)" (click)="toggleStop(s.id)">
                  <span class="order">{{ selectedStopIds.includes(s.id) ? selectedStopIds.indexOf(s.id) + 1 : '' }}</span>
                  <span class="nm">{{ s.name }}</span>
                  <span class="act">{{ selectedStopIds.includes(s.id) ? 'Retirer' : 'Ajouter' }}</span>
                </button>
              </li>
            } @empty {
              <li class="empty"><strong>Aucun arrêt</strong>Créez des arrêts dans l’onglet Arrêts.</li>
            }
          </ul>
          <button type="button" class="btn primary block" (click)="saveRoute()" [disabled]="busy || !selectedLineId || selectedStopIds.length < 2">
            Enregistrer {{ selectedStopIds.length }} arrêt{{ selectedStopIds.length > 1 ? 's' : '' }}
          </button>
        </section>
      }

      <!-- ============ Arrêts ============ -->
      @if (section === 'stops') {
        <details class="fold">
          <summary>Ajouter un arrêt</summary>
          <div class="fold-body">
            <label class="field"><span>Nom de l’arrêt</span><input [(ngModel)]="stopName" name="stopName"></label>
            <div class="field-row">
              <label class="field"><span>Latitude</span><input type="number" inputmode="decimal" [(ngModel)]="stopLat" name="stopLat" placeholder="-20.263"></label>
              <label class="field"><span>Longitude</span><input type="number" inputmode="decimal" [(ngModel)]="stopLng" name="stopLng" placeholder="57.479"></label>
            </div>
            <button type="button" class="btn primary block" (click)="addStop()" [disabled]="busy">Ajouter l’arrêt</button>
            <p class="hint">Les coordonnées doivent se trouver à Maurice.</p>
          </div>
        </details>
        <ul class="rows">
          @for (s of stops; track s.id) {
            <li class="row"><div class="main"><strong>{{ s.name }}</strong><span>{{ s.latitude | number:'1.4-6' }}, {{ s.longitude | number:'1.4-6' }}</span></div></li>
          } @empty {
            <li class="empty"><strong>Aucun arrêt</strong>Ajoutez un arrêt avec ses coordonnées GPS.</li>
          }
        </ul>
      }

      <!-- ============ Signalements ============ -->
      @if (section === 'reports') {
        <div class="toolbar">
          <label class="field"><span>Statut</span>
            <select [(ngModel)]="reportFilter" name="reportFilter" (ngModelChange)="loadReports()">
              <option value="">Tous</option><option value="pending">En attente</option><option value="in_review">En vérification</option><option value="approved">Validés</option><option value="rejected">Rejetés</option>
            </select>
          </label>
          <button type="button" class="btn outline" (click)="loadReports()">Actualiser</button>
        </div>
        @for (r of reports; track r.id) {
          <article class="panel report">
            <header>
              <h2>{{ categoryLabel(r.category) }}</h2>
              <span class="badge" [class.ok]="r.review_status === 'approved'" [class.bad]="r.review_status === 'rejected'" [class.info]="r.review_status === 'in_review'" [class.warn]="r.review_status === 'pending'">{{ reportStatusLabel(r.review_status) }}</span>
            </header>
            <p class="who">Bus {{ r.bus_number || 'non précisé' }} · {{ r.registration_number || 'plaque inconnue' }}</p>
            <p class="desc">{{ r.description || 'Aucune description.' }}</p>
            <dl class="meta">
              <div><dt>Ligne</dt><dd>{{ r.line_number || 'Non précisée' }}</dd></div>
              <div><dt>Arrêt</dt><dd>{{ r.stop_name || 'Non précisé' }}</dd></div>
              <div><dt>État signalé</dt><dd>{{ r.operational_state || 'Non précisé' }}</dd></div>
              <div><dt>Envoyé par</dt><dd>{{ r.reporter_name || 'Utilisateur' }}, le {{ r.created_at | date:'dd/MM/yyyy HH:mm' }}</dd></div>
            </dl>
            @if (r.review_status === 'pending' || r.review_status === 'in_review') {
              <label class="field"><span>Note pour l’équipe <small>(facultatif)</small></span><textarea [(ngModel)]="reportNotes[r.id]" [name]="'note' + r.id" maxlength="1000"></textarea></label>
              <div class="acts">
                <button type="button" class="btn sm outline" (click)="review(r, 'in_review')">Mettre en vérification</button>
                <button type="button" class="btn sm ok" (click)="review(r, 'approved')">Valider</button>
                <button type="button" class="btn sm danger" (click)="review(r, 'rejected')">Rejeter</button>
              </div>
            }
            @if (r.admin_note) { <p class="note">Note : {{ r.admin_note }}</p> }
          </article>
        } @empty {
          <p class="empty"><strong>Aucun signalement</strong>Rien à traiter pour ce filtre.</p>
        }
      }

      <!-- ============ Comptes ============ -->
      @if (section === 'users') {
        <div class="toolbar one">
          <p class="hint">Réservez le rôle administrateur aux personnes autorisées.</p>
          <button type="button" class="btn outline" (click)="loadUsers()">Actualiser</button>
        </div>
        <ul class="rows">
          @for (u of users; track u.id) {
            <li class="row">
              <div class="main"><strong>{{ u.name }}</strong><span>{{ u.email }} · créé le {{ u.created_at | date:'dd/MM/yyyy' }}</span></div>
              <span class="badge" [class.info]="u.role === 'admin'">{{ u.role === 'admin' ? 'Administrateur' : 'Utilisateur' }}</span>
              <div class="acts"><button type="button" class="btn sm outline" (click)="changeRole(u)">{{ u.role === 'admin' ? 'Retirer les droits' : 'Nommer administrateur' }}</button></div>
            </li>
          } @empty {
            <li class="empty"><strong>Aucun compte chargé</strong>Touchez Actualiser pour afficher la liste.</li>
          }
        </ul>
      }
    </main>
  </ion-content>`,
  styles: [`
    .wide { max-width: 860px; }
    .alert { margin: 0 0 14px; padding: 12px 14px; border-radius: var(--r-sm); background: var(--flam-soft); color: var(--flam-ink); font-size: 14px; font-weight: 600; }
    .stats { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); margin: 0 0 18px; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
    .stats > div { padding: 14px 8px; text-align: center; display: flex; flex-direction: column-reverse; gap: 2px; border-left: 1px solid var(--line); }
    .stats > div:first-child { border-left: 0; }
    .stats dd { margin: 0; font: 800 28px var(--font-display); font-variant-numeric: tabular-nums; }
    .stats dt { color: var(--ink-2); font-size: 12px; font-weight: 600; }
    .stats .hot dd { color: var(--flam); }
    @media (max-width: 420px) { .stats dd { font-size: 23px; } .stats dt { font-size: 11px; } }

    .chips { display: flex; gap: 8px; overflow-x: auto; padding: 2px 0 14px; margin: 0 -16px; padding-left: 16px; padding-right: 16px; scrollbar-width: none; }
    .chips::-webkit-scrollbar { display: none; }
    .chips button { flex: none; min-height: 42px; padding: 0 16px; border-radius: 999px; border: 1.5px solid var(--line); background: var(--paper); color: var(--ink-2); font: 700 14px var(--font-body); cursor: pointer; }
    .chips button[aria-selected='true'] { background: var(--board); border-color: var(--board); color: #fff; }

    .fold { background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg); margin-bottom: 14px; }
    .fold summary { list-style: none; cursor: pointer; padding: 16px 18px; font: 700 17px var(--font-display); display: flex; justify-content: space-between; align-items: center; }
    .fold summary::-webkit-details-marker { display: none; }
    .fold summary::after { content: '+'; font: 700 22px var(--font-body); color: var(--lagon); }
    .fold[open] summary::after { content: '−'; }
    .fold-body { padding: 0 18px 18px; }

    .rows { list-style: none; margin: 0 0 14px; padding: 0; background: var(--paper); border: 1px solid var(--line); border-radius: var(--r-lg); overflow: hidden; }
    .rows.tight { margin: 0 0 14px; }
    .row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; padding: 14px 16px; border-top: 1px solid var(--line); }
    .row:first-child { border-top: 0; }
    .row .main { flex: 1 1 200px; min-width: 0; display: grid; gap: 2px; }
    .row .main strong { font: 700 17px var(--font-display); overflow-wrap: anywhere; }
    .row .main span { color: var(--ink-2); font-size: 13px; overflow-wrap: anywhere; }
    .acts { display: flex; flex-wrap: wrap; gap: 6px; flex-basis: 100%; }
    .rows .empty { padding: 28px 16px; }

    .row.pick { padding: 0; }
    .pick-btn { width: 100%; display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 12px; padding: 12px 16px; border: 0; background: transparent; color: var(--ink); font: 600 15px var(--font-body); text-align: left; cursor: pointer; min-height: 52px; }
    .pick .order { width: 30px; height: 30px; border-radius: 50%; border: 2px solid var(--line); display: grid; place-items: center; font: 800 14px var(--font-display); }
    .pick.on .order { background: var(--lagon); border-color: var(--lagon); color: #fff; }
    .pick .act { color: var(--lagon-ink); font-size: 13px; font-weight: 700; }
    .pick.on { background: var(--lagon-soft); }

    .toolbar { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; margin-bottom: 14px; }
    .toolbar .btn { margin-bottom: 14px; }
    .toolbar.one { align-items: center; } .toolbar.one .btn { margin: 0; } .toolbar.one .hint { margin: 0; }

    .report header { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .report .who { margin: 4px 0 0; font-weight: 700; }
    .report .desc { margin: 10px 0 0; color: var(--ink-2); line-height: 1.5; }
    .meta { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px 16px; margin: 14px 0; padding: 12px 0; border-block: 1px solid var(--line); }
    .meta dt { color: var(--ink-3); font-size: 12px; font-weight: 600; }
    .meta dd { margin: 2px 0 0; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .note { margin: 12px 0 0; padding: 10px 12px; border-radius: var(--r-sm); background: var(--mist); color: var(--ink-2); font-size: 14px; }
    @media (min-width: 700px) { .acts { flex-basis: auto; } .meta { grid-template-columns: repeat(4, minmax(0,1fr)); } }
  `]
})
export class AdminPage implements OnInit {
 readonly sections: { value: 'buses'|'lines'|'stops'|'reports'|'users'; label: string }[] = [
  { value: 'buses', label: 'Bus' }, { value: 'lines', label: 'Lignes' }, { value: 'stops', label: 'Arrêts' }, { value: 'reports', label: 'Signalements' }, { value: 'users', label: 'Comptes' }
];
 section:'buses'|'lines'|'stops'|'reports'|'users'='buses'; users:AdminUser[]=[]; reports:BusReport[]=[]; reportFilter='' ; summary:AdminSummary|null=null; buses:AdminBus[]=[]; lines:Line[]=[]; stops:Stop[]=[]; error=''; busy=false;
 busPlate='';busNumber='';busLineId:number|null=null;lineNumber='';lineName='';terminusA='';terminusB='';operator='';stopName='';stopLat:number|null=null;stopLng:number|null=null;selectedLineId:number|null=null;direction:'AB'|'BA'='AB';selectedStopIds:number[]=[];
 reportNotes:Record<number,string>={};
 constructor(private api:BusService,private toast:ToastController,private alert:AlertController){}
 ngOnInit(){this.refresh();}
 refresh(){if(this.section==='reports')this.loadReports();this.api.getAdminSummary().subscribe({next:x=>this.summary=x,error:e=>this.fail(e)});this.api.getAdminBuses().subscribe({next:x=>this.buses=x,error:e=>this.fail(e)});this.api.getAdminLines().subscribe({next:x=>this.lines=x,error:e=>this.fail(e)});this.api.getAdminStops().subscribe({next:x=>this.stops=x,error:e=>this.fail(e)});}
 categoryLabel(c:string){return c==='panne'?'Panne':c==='retard'?'Retard':c==='position_incorrecte'?'Position incorrecte':c==='etat_incorrect'?'État incorrect':'Autre';}
 statusLabel(s:string){return s==='approved'?'Confirmé':s==='rejected'?'Refusé':'En attente';}
 reportStatusLabel(s:string){return s==='approved'?'Validé':s==='rejected'?'Rejeté':s==='in_review'?'En vérification':'En attente';}
 onSectionChange(){if(this.section==='reports')this.loadReports();if(this.section==='users')this.loadUsers();}
 loadUsers(){this.api.getAdminUsers().subscribe({next:x=>this.users=x,error:e=>this.fail(e)});}
 async changeRole(u:AdminUser){const next=u.role==='admin'?'user':'admin';const a=await this.alert.create({header:next==='admin'?'Promouvoir le compte ?':'Retirer les droits administrateur ?',message:`${u.name} — ${u.email}`,buttons:[{text:'Annuler',role:'cancel'},{text:'Confirmer',handler:()=>this.api.setAdminUserRole(u.id,next).subscribe({next:()=>{this.done('Rôle mis à jour.');this.loadUsers();},error:e=>this.fail(e)})}]});await a.present();}
 loadReports(){this.api.getReports(this.reportFilter).subscribe({next:x=>this.reports=x,error:e=>this.fail(e)});}
 review(r:BusReport,status:'in_review'|'approved'|'rejected'){this.api.reviewReport(r.id,status,this.reportNotes[r.id]||'').subscribe({next:()=>{this.done(status==='approved'?'Signalement validé. L’état officiel du bus a été mis à jour si nécessaire.':status==='rejected'?'Signalement rejeté.':'Signalement placé en vérification.');this.loadReports();},error:e=>this.fail(e)});}
 addBus(){if(!this.busPlate.trim()||!this.busNumber.trim()){this.message('Saisis l’immatriculation et le numéro du bus.');return;}this.busy=true;this.api.createAdminBus({registrationNumber:this.busPlate,busNumber:this.busNumber,lineId:this.busLineId}).subscribe({next:()=>{this.busPlate='';this.busNumber='';this.busLineId=null;this.done('Bus ajouté en attente de confirmation.');},error:e=>this.fail(e),complete:()=>this.busy=false});}
 approval(b:AdminBus,status:'approved'|'rejected'){this.api.setBusApproval(b.id,status).subscribe({next:()=>this.done(status==='approved'?'Bus confirmé et autorisé à apparaître sur la carte.':'Bus refusé.'),error:e=>this.fail(e)});}
 async editBus(b:AdminBus){
  const alert=await this.alert.create({header:'Modifier le bus',inputs:[{name:'registrationNumber',type:'text',label:'Immatriculation',value:b.registration_number},{name:'busNumber',type:'text',label:'Numéro du bus',value:b.bus_number}],buttons:[{text:'Annuler',role:'cancel'},{text:'Enregistrer',handler:(v)=>{if(!v.registrationNumber?.trim()||!v.busNumber?.trim())return false;this.api.updateAdminBus(b.id,{registrationNumber:v.registrationNumber,busNumber:v.busNumber,lineId:b.line_id}).subscribe({next:()=>this.done('Bus modifié.'),error:e=>this.fail(e)});return true;}}]}); await alert.present();
 }
 async deleteBus(b:AdminBus){
  const alert=await this.alert.create({header:'Désactiver ce bus ?',message:`Le bus ${b.bus_number} sera masqué de la carte. L'historique sera conservé.`,buttons:[{text:'Annuler',role:'cancel'},{text:'Désactiver',role:'destructive',handler:()=>this.api.deleteAdminBus(b.id).subscribe({next:()=>this.done('Bus désactivé. Historique conservé.'),error:e=>this.fail(e)})}]}); await alert.present();
 }
 addLine(){if(!this.lineNumber.trim()||!this.lineName.trim()||!this.terminusA.trim()||!this.terminusB.trim()){this.message('Complète le numéro, le nom et les deux terminus.');return;}this.busy=true;this.api.createAdminLine({number:this.lineNumber,name:this.lineName,terminusA:this.terminusA,terminusB:this.terminusB,operator:this.operator}).subscribe({next:l=>{this.lineNumber=this.lineName=this.terminusA=this.terminusB=this.operator='';this.selectedLineId=l.id;this.done('Ligne créée. Ajoute maintenant ses arrêts.');},error:e=>this.fail(e),complete:()=>this.busy=false});}
 addStop(){if(!this.stopName.trim()||this.stopLat==null||this.stopLng==null){this.message('Saisis le nom, la latitude et la longitude.');return;}this.busy=true;this.api.createAdminStop(this.stopName,Number(this.stopLat),Number(this.stopLng)).subscribe({next:()=>{this.stopName='';this.stopLat=this.stopLng=null;this.done('Arrêt ajouté.');},error:e=>this.fail(e),complete:()=>this.busy=false});}
 toggleStop(id:number){this.selectedStopIds=this.selectedStopIds.includes(id)?this.selectedStopIds.filter(x=>x!==id):[...this.selectedStopIds,id];}
 saveRoute(){if(!this.selectedLineId||this.selectedStopIds.length<2)return;this.busy=true;this.api.setAdminLineStops(this.selectedLineId,this.direction,this.selectedStopIds).subscribe({next:r=>this.done(`${r.count} arrêts enregistrés dans l’ordre.`),error:e=>this.fail(e),complete:()=>this.busy=false});}
 private done(m:string){this.error='';this.message(m);this.refresh();}
 private fail(e:HttpErrorResponse){this.busy=false;this.error=e.error?.error||e.error?.message||'Erreur API. Vérifie le serveur, la base et les droits administrateur.';}
 private async message(m:string){const t=await this.toast.create({message:m,duration:2800,position:'top',cssClass:'bt-toast'});await t.present();}
}
