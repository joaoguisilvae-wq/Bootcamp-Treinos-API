export class notFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class WorkoutPlanNotActiveError extends Error {
  constructor() {
    super("Workout plan is not active");
    this.name = "WorkoutPlanNotActiveError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class WorkoutSessionAlreadyStartedError extends Error {
  constructor() {
    super("Workout session already started for this day");
    this.name = "WorkoutSessionAlreadyStartedError";
  }
}
