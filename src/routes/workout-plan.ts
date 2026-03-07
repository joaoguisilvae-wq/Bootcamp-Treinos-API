import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import {
  ForbiddenError,
  notFoundError,
  WorkoutPlanNotActiveError,
  WorkoutSessionAlreadyStartedError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";
import {
  ErrorSchema,
  GetWorkoutDayResponseSchema,
  GetWorkoutPlanResponseSchema,
  UpdateWorkoutSessionBodySchema,
  UpdateWorkoutSessionResponseSchema,
  WorkoutPlanSchema,
  WorkoutSessionCreatedSchema,
} from "../schemas/index.js";
import {
  CreateWorkoutPlan,
  CreateWorkoutPlanDto,
} from "../usecases/CreateWorkoutPlan.js";
import { GetWorkoutDay } from "../usecases/GetWorkoutDay.js";
import { GetWorkoutPlan } from "../usecases/GetWorkoutPlan.js";
import {
  StartWorkoutSession,
  StartWorkoutSessionDto,
} from "../usecases/StartWorkoutSession.js";
import {
  UpdateWorkoutSession,
  UpdateWorkoutSessionDto,
} from "../usecases/UpdateWorkoutSession.js";

export const workoutPlanRoutes = async (app: FastifyInstance) => {
  // GET /workout-plans - Get all workout plans with optional active filter
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      tags: ["Workout Plan"],
      summary: "Get all workout plans with optional active filter",
      querystring: z.object({
        active: z.boolean().optional(),
      }),
      response: {
        200: z.array(GetWorkoutPlanResponseSchema),
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        // Build where clause based on active filter
        // If active is not provided, return all plans (both active and inactive)
        const whereClause: { userId: string; isActive?: boolean } = {
          userId: session.userId,
        };
        if (request.query.active !== undefined) {
          whereClause.isActive = request.query.active;
        }

        const workoutPlans = await prisma.workoutPlan.findMany({
          where: whereClause,
          include: {
            workoutDays: {
              include: {
                _count: {
                  select: { exercises: true },
                },
              },
            },
          },
        });

        const result = workoutPlans.map((plan) => ({
          id: plan.id,
          name: plan.name,
          workoutDays: plan.workoutDays.map((day) => ({
            id: day.id,
            weekDay: day.weekDay,
            name: day.name,
            isRest: day.isRest,
            coverImageUrl: day.coverImageUrl,
            estimatedDurationInSeconds: day.estimatedDurationInSeconds,
            exercisesCount: day._count.exercises,
          })),
        }));

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });

  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["Workout Plan"],
      summary: "Create a new workout plan",
      body: WorkoutPlanSchema.omit({ id: true }),
      response: {
        201: WorkoutPlanSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;

        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");

        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });

        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const createWorkoutPlan = new CreateWorkoutPlan();
        const dto: CreateWorkoutPlanDto = {
          userId: session.userId,
          name: request.body.name,
          workoutDays: request.body.workoutDays,
        };
        const result = await createWorkoutPlan.execute(dto);

        return reply.status(201).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: "Not Found",
            code: "NOT_FOUND",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });

  // GET /workout-plans/:id - Get a workout plan by id
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:id",
    schema: {
      tags: ["Workout Plan"],
      summary: "Get a workout plan by id",
      params: z.object({
        id: z.string().uuid(),
      }),
      response: {
        200: GetWorkoutPlanResponseSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getWorkoutPlan = new GetWorkoutPlan();
        const result = await getWorkoutPlan.execute({
          userId: session.userId,
          workoutPlanId: request.params.id,
        });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });

  // new route for starting workout sessions
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/:workoutPlanId/days/:workoutDayId/sessions",
    schema: {
      tags: ["Workout Plan"],
      summary: "Start a workout session for a plan day",
      params: z.object({
        workoutPlanId: z.string().uuid(),
        workoutDayId: z.string().uuid(),
      }),
      body: z.object({}),
      response: {
        201: WorkoutSessionCreatedSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        409: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const startWorkoutSession = new StartWorkoutSession();
        const dto: StartWorkoutSessionDto = {
          userId: session.userId,
          workoutPlanId: request.params.workoutPlanId,
          workoutDayId: request.params.workoutDayId,
        };
        const result = await startWorkoutSession.execute(dto);
        return reply.status(201).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof WorkoutPlanNotActiveError) {
          return reply.status(400).send({
            error: error.message,
            code: "WORKOUT_PLAN_NOT_ACTIVE",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        if (error instanceof WorkoutSessionAlreadyStartedError) {
          return reply.status(409).send({
            error: error.message,
            code: "WORKOUT_SESSION_ALREADY_STARTED",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });

  // new route for updating workout sessions
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "PATCH",
    url: "/:workoutPlanId/days/:workoutDayId/sessions/:sessionId",
    schema: {
      tags: ["Workout Plan"],
      summary: "Update a workout session",
      params: z.object({
        workoutPlanId: z.string().uuid(),
        workoutDayId: z.string().uuid(),
        sessionId: z.string().uuid(),
      }),
      body: UpdateWorkoutSessionBodySchema,
      response: {
        200: UpdateWorkoutSessionResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const updateWorkoutSession = new UpdateWorkoutSession();
        const dto: UpdateWorkoutSessionDto = {
          userId: session.userId,
          workoutPlanId: request.params.workoutPlanId,
          workoutDayId: request.params.workoutDayId,
          sessionId: request.params.sessionId,
          completedAt: request.body.completedAt,
        };
        const result = await updateWorkoutSession.execute(dto);
        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof WorkoutPlanNotActiveError) {
          return reply.status(400).send({
            error: error.message,
            code: "WORKOUT_PLAN_NOT_ACTIVE",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });

  // GET /workout-plans/:id/days/:id - Get a workout day by id
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:workoutPlanId/days/:workoutDayId",
    schema: {
      tags: ["Workout Plan"],
      summary: "Get a workout day by id",
      params: z.object({
        workoutPlanId: z.string().uuid(),
        workoutDayId: z.string().uuid(),
      }),
      response: {
        200: GetWorkoutDayResponseSchema,
        401: ErrorSchema,
        403: ErrorSchema,
        404: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const authHeader = request.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const token = authHeader.replace("Bearer ", "");
        const session = await prisma.session.findUnique({
          where: { token },
          include: { user: true },
        });
        if (!session || new Date(session.expiresAt) < new Date()) {
          return reply.status(401).send({
            error: "Unauthorized",
            code: "UNAUTHORIZED",
          });
        }

        const getWorkoutDay = new GetWorkoutDay();
        const result = await getWorkoutDay.execute({
          userId: session.userId,
          workoutPlanId: request.params.workoutPlanId,
          workoutDayId: request.params.workoutDayId,
        });

        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof ForbiddenError) {
          return reply.status(403).send({
            error: error.message,
            code: "FORBIDDEN",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });
};
