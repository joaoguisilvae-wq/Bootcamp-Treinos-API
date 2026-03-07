import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";

import { notFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

dayjs.extend(utc);

export interface GetStatsDto {
  userId: string;
  from: string; // YYYY-MM-DD format
  to: string; // YYYY-MM-DD format
}

export interface StatsOutputDto {
  workoutStreak: number;
  consistencyByDay: Record<
    string,
    {
      workoutDayCompleted: boolean;
      workoutDayStarted: boolean;
    }
  >;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: GetStatsDto): Promise<StatsOutputDto> {
    // Parse and validate dates
    const fromDate = dayjs.utc(dto.from, "YYYY-MM-DD");
    const toDate = dayjs.utc(dto.to, "YYYY-MM-DD");

    if (!fromDate.isValid() || !toDate.isValid()) {
      throw new Error("Invalid date format");
    }

    if (fromDate.isAfter(toDate)) {
      throw new Error("From date must be before or equal to to date");
    }

    // Get the active workout plan for the user
    const activeWorkoutPlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: true,
      },
    });

    if (!activeWorkoutPlan) {
      throw new notFoundError("No active workout plan found");
    }

    // Get all workout sessions in the date range
    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlanId: activeWorkoutPlan.id,
        },
        startedAt: {
          gte: fromDate.toDate(),
          lte: toDate.toDate(),
        },
      },
      include: {
        workoutDay: true,
      },
    });

    // Group sessions by date
    const sessionsByDate: Record<
      string,
      {
        completed: boolean;
        started: boolean;
      }
    > = {};

    sessions.forEach((session) => {
      const dateStr = dayjs.utc(session.startedAt).format("YYYY-MM-DD");

      if (!sessionsByDate[dateStr]) {
        sessionsByDate[dateStr] = { completed: false, started: false };
      }

      sessionsByDate[dateStr].started = true;
      if (session.completedAt) {
        sessionsByDate[dateStr].completed = true;
      }
    });

    // Calculate statistics
    const dates = Object.keys(sessionsByDate).sort();
    const totalSessions = dates.length;
    const completedSessions = dates.filter(
      (date) => sessionsByDate[date].completed,
    ).length;
    const conclusionRate =
      totalSessions > 0 ? completedSessions / totalSessions : 0;
    const totalTimeInSeconds = sessions
      .filter((session) => session.completedAt)
      .reduce((total, session) => {
        const duration = dayjs
          .utc(session.completedAt)
          .diff(dayjs.utc(session.startedAt), "second");
        return total + duration;
      }, 0);

    // Calculate workout streak - count consecutive days with completed workouts
    let streak = 0;
    let currentDate = dayjs.utc().startOf("day");

    // Check backwards from today to find the current streak
    while (true) {
      const dateStr = currentDate.format("YYYY-MM-DD");
      const sessionData = sessionsByDate[dateStr];

      // If we have a completed session for this date, increment streak and check previous day
      if (sessionData && sessionData.completed) {
        streak++;
        currentDate = currentDate.subtract(1, "day");
      } else {
        // If no completed session found, break the streak calculation
        break;
      }
    }

    return {
      workoutStreak: streak,
      consistencyByDay: Object.entries(sessionsByDate).reduce(
        (acc, [date, data]) => {
          acc[date] = {
            workoutDayCompleted: data.completed,
            workoutDayStarted: data.started,
          };
          return acc;
        },
        {} as Record<
          string,
          { workoutDayCompleted: boolean; workoutDayStarted: boolean }
        >,
      ),
      completedWorkoutsCount: completedSessions,
      conclusionRate,
      totalTimeInSeconds,
    };
  }
}
