import {
  ForbiddenError,
  notFoundError,
  WorkoutPlanNotActiveError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

export interface UpdateWorkoutSessionDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
  sessionId: string;
  completedAt: string;
}

export interface UpdateWorkoutSessionOutputDto {
  id: string;
  startedAt: string;
  completedAt: string;
}

export class UpdateWorkoutSession {
  async execute(
    dto: UpdateWorkoutSessionDto,
  ): Promise<UpdateWorkoutSessionOutputDto> {
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

    // ensure the session exists and belongs to the day
    const session = await prisma.workoutSession.findUnique({
      where: { id: dto.sessionId },
    });
    if (!session || session.workoutDayId !== dto.workoutDayId) {
      throw new notFoundError("Workout session not found");
    }

    // update the session with completedAt
    const updatedSession = await prisma.workoutSession.update({
      where: { id: dto.sessionId },
      data: { completedAt: new Date(dto.completedAt) },
    });

    return {
      id: updatedSession.id,
      startedAt: updatedSession.startedAt.toISOString(),
      completedAt: updatedSession.completedAt!.toISOString(),
    };
  }
}
