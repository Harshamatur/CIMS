import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Must run before any schema calls `.openapi(...)`. Every module imports `z` from here.
extendZodWithOpenApi(z);

export { z };
