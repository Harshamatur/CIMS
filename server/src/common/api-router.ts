import { Router, type Request, type RequestHandler, type Response } from "express";
import type { ZodType, z } from "zod";
import type { AuthUser } from "../types.js";
import { AppError, type FieldError } from "./errors.js";
import type { Role } from "./permissions.js";
import { authenticate, requireRoles } from "../middleware/auth.js";
import type { ServiceContext } from "../modules/audit/audit.service.js";

export type Access = "public" | "authenticated" | readonly Role[];
type Method = "get" | "post" | "patch" | "delete";

export interface HandlerArgs<P, Q, B, H> {
  params: P;
  query: Q;
  body: B;
  headers: H;
  user: AuthUser;
  ctx: ServiceContext;
  req: Request;
  res: Response;
}

export interface RouteDef<
  P extends ZodType,
  Q extends ZodType,
  B extends ZodType,
  H extends ZodType,
  R extends ZodType,
> {
  method: Method;
  /** Express-style path relative to /api/v1, e.g. "/requests/:id". */
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  access: Access;
  params?: P;
  query?: Q;
  body?: B;
  headers?: H;
  /** Success body schema — drives the OpenAPI document and (in NODE_ENV=test) response-drift checks. */
  response?: R;
  successStatus?: number;
  /** Extra documented error statuses besides the standard ones. */
  errorStatuses?: number[];
  /** Handler writes the response itself (e.g. CSV download). */
  raw?: boolean;
  /** Handler gets `user` even on public routes when a session exists (never required). */
  handler: (args: HandlerArgs<z.output<P>, z.output<Q>, z.output<B>, z.output<H>>) => Promise<unknown>;
}

/** Type-erased metadata kept for OpenAPI generation. */
export interface RouteMeta {
  method: Method;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  access: Access;
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
  headers?: ZodType;
  response?: ZodType;
  successStatus: number;
  errorStatuses: number[];
  raw: boolean;
}

function parseOrCollect(
  schema: ZodType | undefined,
  value: unknown,
  where: string,
  errors: FieldError[],
): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    errors.push({ path: [where, ...issue.path].join("."), message: issue.message });
  }
  return undefined;
}

export class ApiRouter {
  readonly router = Router();
  readonly catalog: RouteMeta[] = [];

  constructor(private readonly options: { validateResponses: boolean } = { validateResponses: false }) {}

  route<P extends ZodType, Q extends ZodType, B extends ZodType, H extends ZodType, R extends ZodType>(
    def: RouteDef<P, Q, B, H, R>,
  ): void {
    const successStatus = def.successStatus ?? 200;
    this.catalog.push({
      method: def.method,
      path: def.path,
      summary: def.summary,
      description: def.description,
      tags: def.tags,
      access: def.access,
      params: def.params,
      query: def.query,
      body: def.body,
      headers: def.headers,
      response: def.response,
      successStatus,
      errorStatuses: def.errorStatuses ?? [],
      raw: def.raw ?? false,
    });

    const chain: RequestHandler[] = [];
    if (def.access !== "public") {
      chain.push(authenticate);
      if (def.access !== "authenticated") chain.push(requireRoles(def.access));
    }

    const validateResponses = this.options.validateResponses;
    chain.push(async (req, res) => {
      const errors: FieldError[] = [];
      const params = parseOrCollect(def.params, req.params, "params", errors);
      const query = parseOrCollect(def.query, req.query, "query", errors);
      const body = parseOrCollect(def.body, req.body ?? {}, "body", errors);
      const headers = parseOrCollect(def.headers, req.headers, "headers", errors);
      if (errors.length) throw new AppError(400, "VALIDATION_ERROR", "Request validation failed.", errors);

      const user = req.user as AuthUser; // undefined only on public routes, which must not read it
      const ctx: ServiceContext = {
        actorId: user?.id ?? null,
        requestId: String(req.id),
        ip: req.ip ?? null,
      };
      const result = await def.handler({
        params: params as z.output<P>,
        query: query as z.output<Q>,
        body: body as z.output<B>,
        headers: headers as z.output<H>,
        user,
        ctx,
        req,
        res,
      });
      if (def.raw || res.headersSent) return; // handler already wrote a non-JSON body (e.g. CSV)
      if (validateResponses && def.response) {
        const check = def.response.safeParse(JSON.parse(JSON.stringify(result)));
        if (!check.success) {
          throw new Error(
            `Response for ${def.method.toUpperCase()} ${def.path} does not match its OpenAPI schema: ${check.error.message}`,
          );
        }
      }
      res.status(successStatus).json(result);
    });

    this.router[def.method](def.path, ...chain);
  }
}
