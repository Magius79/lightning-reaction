// This file is a placeholder for potential future expansion of the state machine logic
// Currently, state transitions are handled directly in GameEngine.ts

export class StateMachine {
  private currentState: string;

  constructor(initialState: string) {
    this.currentState = initialState;
  }

  transitionTo(newState: string) {
    this.currentState = newState;
  }

  getCurrentState(): string {
    return this.currentState;
  }
}
