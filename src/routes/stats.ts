import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { notFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { ErrorSchema, GetStatsResponseSchema } from "../schemas/index.js";
import { GetStats, GetStatsDto } from "../usecases/GetStats.js";

export const statsRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      tags: ["Stats"],
      summary: "Get user statistics for a date range",
      querystring: z.object({
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      response: {
        200: GetStatsResponseSchema,
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

        const getStats = new GetStats();
        const dto: GetStatsDto = {
          userId: session.userId,
          from: request.query.from,
          to: request.query.to,
        };
        const result = await getStats.execute(dto);
        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof notFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: "NOT_FOUND",
          });
        }
        if (error instanceof Error && error.message === "Invalid date format") {
          return reply.status(400).send({
            error: "Invalid date format. Use YYYY-MM-DD",
            code: "INVALID_DATE_FORMAT",
          });
        }
        if (
          error instanceof Error &&
          error.message === "From date must be before or equal to to date"
        ) {
          return reply.status(400).send({
            error: "From date must be before or equal to to date",
            code: "INVALID_DATE_RANGE",
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
