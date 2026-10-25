import { Component } from '@angular/core';
import { IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { mapOutline, busOutline, shieldCheckmarkOutline, personCircleOutline } from 'ionicons/icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-tabs', standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel],
  template: `
  <ion-tabs>
    <ion-tab-bar slot="bottom">
      <ion-tab-button tab="carte" href="/carte"><ion-icon name="map-outline"></ion-icon><ion-label>Carte</ion-label></ion-tab-button>
      <ion-tab-button tab="bus" href="/bus"><ion-icon name="bus-outline"></ion-icon><ion-label>À bord</ion-label></ion-tab-button>
      @if (auth.isAdmin) { <ion-tab-button tab="admin" href="/admin"><ion-icon name="shield-checkmark-outline"></ion-icon><ion-label>Admin</ion-label></ion-tab-button> }
      <ion-tab-button tab="compte" href="/compte"><ion-icon name="person-circle-outline"></ion-icon><ion-label>Compte</ion-label></ion-tab-button>
    </ion-tab-bar>
  </ion-tabs>`
})
export class TabsPage {
  constructor(public auth: AuthService) { addIcons({ mapOutline, busOutline, shieldCheckmarkOutline, personCircleOutline }); }
}
