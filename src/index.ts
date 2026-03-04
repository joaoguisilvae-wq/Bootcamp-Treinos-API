import "dotenv/config";

import fastifyCors from "@fastify/cors";
import fastifySwagger from "@fastify/swagger";
import fastifyApiReference from "@scalar/fastify-api-reference";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from "fastify-type-provider-zod";
import z from "zod";

import { notFoundError } from "./errors/index.js";
import { WeekDay } from "./generated/prisma/enums.js";
import { auth } from "./lib/auth.js";
import { prisma } from "./lib/db.js";
import { CreateWorkoutPlan } from "./usecases/CreateWorkoutPlan.js";

const app = Fastify({
  logger: true,
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: "Bootcamp Treinos Api",
      description: "Api para o bootcamp de treinos do FSC",
      version: "1.0.0",
    },
    servers: [
      {
        description: "LocalHost",
        url: "http://localhost:8080",
      },
    ],
  },
  transform: jsonSchemaTransform,
});

await app.register(fastifyCors, {
  origin: [
    "http://localhost:3000",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ],
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization"],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
});

await app.register(fastifyApiReference, {
  routePrefix: "/docs",
  configuration: {
    sources: [
      {
        title: "Bootcamp Treinos API",
        slug: "bootcamp-treinos-api",
        url: "/swagger.json",
      },
      {
        title: "Auth API",
        slug: "auth-api",
        url: "/api/auth/open-api/generate-schema",
      },
    ],
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "POST",
  url: "/workout-plans",
  schema: {
    body: z.object({
      name: z.string().trim().min(1),
      workoutDays: z.array(
        z.object({
          name: z.string().trim().min(1),
          weekDay: z.enum(WeekDay),
          isRest: z.boolean().default(false),
          estimatedDurationInSeconds: z.number().min(1),
          exercises: z.array(
            z.object({
              order: z.number().min(0),
              name: z.string().trim().min(1),
              sets: z.number().min(1),
              reps: z.number().min(1),
              restTimeInSeconds: z.number().min(1),
            }),
          ),
        }),
      ),
    }),
    response: {
      201: z.object({
        id: z.string().uuid(),
      }),
      400: z.object({
        error: z.string(),
        code: z.string(),
      }),
      401: z.object({
        error: z.literal("Unauthorized"),
        code: z.literal("UNAUTHORIZED"),
      }),
      404: z.object({
        error: z.literal("Not Found"),
        code: z.literal("NOT_FOUND"),
      }),
      500: z.object({
        error: z.string(),
        code: z.string(),
      }),
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
      const result = await createWorkoutPlan.execute({
        userId: session.userId,
        name: request.body.name,
        workoutDays: request.body.workoutDays,
      });

      return reply.status(201).send({ id: result.id });
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

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/swagger.json",
  schema: {
    hide: true,
  },
  handler: async () => {
    return app.swagger();
  },
});

app.withTypeProvider<ZodTypeProvider>().route({
  method: "GET",
  url: "/",
  schema: {
    description: "Hello world",
    tags: ["Hello world"],
    response: {
      200: z.object({
        message: z.string(),
      }),
    },
  },
  handler: () => {
    return {
      message: "Hello world",
    };
  },
});

app.route({
  method: ["GET", "POST"],
  url: "/api/auth/*",
  async handler(request, reply) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`);
      const headers = new Headers();
      Object.entries(request.headers).forEach(([key, value]) => {
        if (value) headers.append(key, value.toString());
      });
      const req = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(request.body ? { body: JSON.stringify(request.body) } : {}),
      });
      const response = await auth.handler(req);
      reply.status(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      reply.send(response.body ? await response.text() : null);
    } catch (error) {
      app.log.error(error);
      reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  },
});

try {
  await app.listen({ port: Number(process.env.PORT) || 8080 });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
