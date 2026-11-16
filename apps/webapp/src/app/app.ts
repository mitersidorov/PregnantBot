import { Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { WorkspaceNavigationState } from './core/workspace-navigation-state.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  template: ` <main class="app-shell" [class.with-nav]="navigation.showNavigation()">
    @if (navigation.showNavigation()) {
      <aside class="rail">
        <nav class="rail-nav" aria-label="Основная навигация">
          <a class="nav-item" routerLink="/"
            >⌂
            <span>{{
              navigation.hasAttempts() ? 'Загрузить анализ' : 'Начать подготовку к стимуляции'
            }}</span></a
          >
          <a class="nav-item" routerLink="/records">▤ <span>Все анализы</span></a>
        </nav>
      </aside>
    }
    <section class="workspace"><router-outlet /></section>
  </main>`,
  styleUrl: './app.scss',
})
export class App {
  readonly navigation = inject(WorkspaceNavigationState);
}
