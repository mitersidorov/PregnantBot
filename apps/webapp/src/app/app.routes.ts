import { Routes } from '@angular/router';
import { WorkspacePage } from './workspace.page';
export const routes: Routes = [
  { path: '', component: WorkspacePage, data: { section: 'overview' } },
  { path: 'cycles', pathMatch: 'full', component: WorkspacePage, data: { section: 'cycles' } },
  { path: 'cycles/:id', component: WorkspacePage, data: { section: 'cycle' } },
  { path: 'records', component: WorkspacePage, data: { section: 'records' } },
  { path: '**', redirectTo: '' },
];
