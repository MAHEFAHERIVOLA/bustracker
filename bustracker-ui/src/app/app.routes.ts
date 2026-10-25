import { Routes } from '@angular/router';
import { AuthPage } from './pages/auth/auth.page';
import { TabsPage } from './tabs/tabs.page';
import { authGuard } from './services/auth.guard';
import { adminGuard } from './services/admin.guard';
export const routes: Routes = [
  { path: 'connexion', component: AuthPage },
  { path: '', component: TabsPage, canActivate: [authGuard], children: [
    { path: 'carte', loadComponent: () => import('./pages/carte/carte.page').then(m => m.CartePage) },
    { path: 'bus', loadComponent: () => import('./pages/bus/bus.page').then(m => m.BusPage) },
    { path: 'compte', loadComponent: () => import('./pages/compte/compte.page').then(m => m.ComptePage) },
    { path: 'admin', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/admin.page').then(m => m.AdminPage) },
    { path: '', redirectTo: 'carte', pathMatch: 'full' }
  ]},
  { path: '**', redirectTo: '' }
];
