import { z } from "zod";
import { createZodDto } from "../common/zod/zod-dto";

export const assignRoleSchema = z.object({ roleId: z.string().min(1) }).strict();
export class AssignRoleDto extends createZodDto(assignRoleSchema) {}

export const assignStoresSchema = z.object({ storeIds: z.array(z.string()).default([]) }).strict();
export class AssignStoresDto extends createZodDto(assignStoresSchema) {}

export const setStatusSchema = z.object({ status: z.enum(["active", "disabled"]) }).strict();
export class SetStatusDto extends createZodDto(setStatusSchema) {}
