import type { Principal } from "./principal";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by AuthGuard after a successful JWT verification + user resolution. */
    principal?: Principal;
  }
}
