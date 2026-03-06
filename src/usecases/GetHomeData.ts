import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { notFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

export interface GetHomeDataDto {
  userId: string;
  date: string; // YYYY-MM-DD format
}

export interface WorkoutDayInfo {
  workoutPlanId: string;
  id: string;
  name: string;
  isRest: boolean;
  weekDay: string;
  estimatedDurationInSeconds: number;
  coverImageUrl?: string;
  exercisesCount: number;
}

export interface ConsistencyEntry {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

export interface GetHomeDataOutputDto {
  activeWorkoutPlanId: string;
  todayWorkoutDay: WorkoutDayInfo;
  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyEntry>;
}

const WEEK_DAYS = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

export class GetHomeData {
  async execute(dto: GetHomeDataDto): Promise<GetHomeDataOutputDto> {
    // Parse the input date and validate it
    const inputDate = dayjs.utc(dto.date, "YYYY-MM-DD");
    if (!inputDate.isValid()) {
      throw new Error("Invalid date format");
    }

    // Get the active workout plan for the user
    const activeWorkoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: { exercises: true },
        },
      },
    });

    if (!activeWorkoutPlan) {
      throw new notFoundError("No active workout plan found");
    }

    // Find the workout day for the given date
    const dayOfWeek = WEEK_DAYS[inputDate.day()]; // 0 = Sunday, 1 = Monday, etc.
    const todayWorkoutDay = activeWorkoutPlan.workoutDays.find(
      (day) => day.weekDay === dayOfWeek,
    );

    if (!todayWorkoutDay) {
      throw new notFoundError("No workout day found for the given date");
    }

    // Calculate week range (Sunday 00:00:00 to Saturday 23:59:59 UTC)
    const weekStart = inputDate.startOf("week").utc();
    const weekEnd = inputDate.endOf("week").utc();

    // Get all workout sessions for the week
    const weekSessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: activeWorkoutPlan.id,
        },
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
      include: {
        workoutDay: true,
      },
    });

    // Group sessions by date
    const sessionsByDate: Record<string, { completed: boolean; started: boolean }> = {};

    for (let i = 0; i < 7; i++) {
      const date = weekStart.add(i, "day");
      const dateStr = date.format("YYYY-MM-DD");
      sessionsByDate[dateStr] = { completed: false, started: false };
    }

    weekSessions.forEach((session) => {
      const dateStr = dayjs.utc(session.startedAt).format("YYYY-MM-DD");
      if (sessionsByDate[dateStr]) {
        sessionsByDate[dateStr].started = true;
        if (session.completedAt) {
          sessionsByDate[dateStr].completed = true;
        }
      }
    });

    // Calculate workout streak
    let streak = 0;
    let currentDate = inputDate;

    while (true) {
      const dateStr = currentDate.format("YYYY-MM-DD");
      const dayOfWeekStr = WEEK_DAYS[currentDate.day()];

      // Check if workout was completed for this day
      const dayHasWorkout = activeWorkoutPlan.workoutDays.some(
        (day) => day.weekDay === dayOfWeekStr,
      );

      if (!dayHasWorkout) {
        break;
      }

      const sessionData = sessionsByDate[dateStr];
      if (sessionData && sessionData.completed) {
        streak++;
        currentDate = currentDate.subtract(1, "day");
      } else {
        break;
      }
    }

    return {
      activeWorkoutPlanId: activeWorkoutPlan.id,
      todayWorkoutDay: {
        workoutPlanId: todayWorkoutDay.workoutPlanId,
        id: todayWorkoutDay.id,
        name: todayWorkoutDay.name,
        isRest: todayWorkoutDay.isRest,
        weekDay: todayWorkoutDay.weekDay,
        estimatedDurationInSeconds: todayWorkoutDay.estimatedDurationInSeconds,
        coverImageUrl: todayWorkoutDay.coverImageUrl || undefined,
        exercisesCount: todayWorkoutDay.exercises.length,
      },
      workoutStreak: streak,
      consistencyByDay: Object.entries(sessionsByDate).reduce(
        (acc, [date, data]) => {
          acc[date] = {
            workoutDayCompleted: data.completed,
            workoutDayStarted: data.started,
          };
          return acc;
        },
        {} as Record<string, ConsistencyEntry>,
      ),
    };
  }
}
