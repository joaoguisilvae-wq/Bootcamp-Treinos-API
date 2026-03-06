import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { notFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { ErrorSchema, WorkoutPlanSchema } from "../schemas/index.js";
import {
  CreateWorkoutPlan,
  CreateWorkoutPlanDto,
} from "../usecases/CreateWorkoutPlan.js";

export const workoutPlanRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
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
};
