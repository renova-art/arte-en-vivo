import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/landing/landing').then((m) => m.Landing) },
  {
    path: 'solicitar-presupuesto',
    loadComponent: () => import('./features/form/quote-form').then((m) => m.QuoteForm),
  },
  {
    path: 'admin/login',
    loadComponent: () => import('./features/admin/login/login').then((m) => m.Login),
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/admin-shell').then((m) => m.AdminShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'presupuestos' },
      {
        path: 'presupuestos',
        loadComponent: () => import('./features/admin/dashboard/dashboard').then((m) => m.Dashboard),
      },
      {
        path: 'presupuestos/:id',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/admin/detail/detail').then((m) => m.Detail),
      },
      {
        path: 'configuracion',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/admin/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
