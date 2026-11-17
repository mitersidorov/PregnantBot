import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkspaceNavigationState {
  private readonly authenticatedState = signal(false);
  private readonly hasAttemptsState = signal<boolean | null>(null);
  private readonly hasAnalysesState = signal<boolean | null>(null);

  readonly showNavigation = computed(
    () =>
      this.authenticatedState() &&
      (this.hasAttemptsState() === true || this.hasAnalysesState() === true),
  );
  readonly hasAttempts = computed(() => this.hasAttemptsState() === true);
  readonly isAuthenticated = computed(() => this.authenticatedState());

  setAuthenticated(authenticated: boolean): void {
    this.authenticatedState.set(authenticated);
    if (!authenticated) this.clearDataState();
  }

  clearDataState(): void {
    this.hasAttemptsState.set(false);
    this.hasAnalysesState.set(false);
  }

  setHasAttempts(hasAttempts: boolean): void {
    this.hasAttemptsState.set(hasAttempts);
  }

  setHasAnalyses(hasAnalyses: boolean): void {
    this.hasAnalysesState.set(hasAnalyses);
  }
}
