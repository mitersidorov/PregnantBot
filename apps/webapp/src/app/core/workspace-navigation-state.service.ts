import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WorkspaceNavigationState {
  private readonly hasAttemptsState = signal<boolean | null>(null);
  private readonly hasAnalysesState = signal<boolean | null>(null);

  readonly showNavigation = computed(
    () => this.hasAttemptsState() === true || this.hasAnalysesState() === true,
  );
  readonly hasAttempts = computed(() => this.hasAttemptsState() === true);

  setHasAttempts(hasAttempts: boolean): void {
    this.hasAttemptsState.set(hasAttempts);
  }

  setHasAnalyses(hasAnalyses: boolean): void {
    this.hasAnalysesState.set(hasAnalyses);
  }
}
