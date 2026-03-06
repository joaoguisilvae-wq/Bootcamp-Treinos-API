import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { notFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";
import { ErrorSchema, HomeDataResponseSchema } from "../schemas/index.js";
import { GetHomeData, GetHomeDataDto } from "../usecases/GetHomeData.js";

export const homeRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:date",
    schema: {
      tags: ["Home"],
      summary: "Get home page data for authenticated user",
      params: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
      response: {
        200: HomeDataResponseSchema,
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

        const getHomeData = new GetHomeData();
        const dto: GetHomeDataDto = {
          userId: session.userId,
          date: request.params.date,
        };
        const result = await getHomeData.execute(dto);
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
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_ERROR",
        });
      }
    },
  });
};
