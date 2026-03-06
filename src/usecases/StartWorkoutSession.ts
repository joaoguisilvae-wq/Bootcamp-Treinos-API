import {
  ForbiddenError,
  notFoundError,
  WorkoutPlanNotActiveError,
  WorkoutSessionAlreadyStartedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

export interface StartWorkoutSessionDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

export interface StartWorkoutSessionOutputDto {
  userWorkoutSessionId: string;
}

export class StartWorkoutSession {
  async execute(
    dto: StartWorkoutSessionDto,
  ): Promise<StartWorkoutSessionOutputDto> {
    // fetch the workout plan so we can validate owner and activity state
    const workoutPlan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
    });
    if (!workoutPlan) {
      throw new notFoundError("Workout plan not found");
    }

    if (!workoutPlan.isActive) {
      throw new WorkoutPlanNotActiveError();
    }

    if (workoutPlan.userId !== dto.userId) {
      throw new ForbiddenError();
    }

    // ensure the requested day belongs to the plan
    const workoutDay = await prisma.workoutDay.findUnique({
      where: { id: dto.workoutDayId },
    });
    if (!workoutDay || workoutDay.workoutPlanId !== dto.workoutPlanId) {
      throw new notFoundError("Workout day not found");
    }

    // check for an existing session already started for this day
    const existingSession = await prisma.workoutSession.findFirst({
      where: { workoutDayId: dto.workoutDayId },
    });
    if (existingSession) {
      throw new WorkoutSessionAlreadyStartedError();
    }

    const session = await prisma.workoutSession.create({
      data: {
        workoutDay: { connect: { id: dto.workoutDayId } },
        startedAt: new Date(),
      },
    });

    return { userWorkoutSessionId: session.id };
  }
}
