import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { SYSTEM_ROLES } from "@supershop/shared";
import type { Model, Types } from "mongoose";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { Role, type RoleDocument } from "./role.schema";
import { RolesRepository } from "./roles.repository";

export interface CreateRoleInput {
  name: string;
  permissions?: string[];
  description?: string;
}
export interface UpdateRoleInput {
  permissions?: string[];
  description?: string;
}

@Injectable()
export class RolesService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Role.name) private readonly model: Model<RoleDocument>,
    private readonly repo: RolesRepository,
  ) {}

  /** Idempotently seed/refresh the system roles on every boot. */
  async onApplicationBootstrap(): Promise<void> {
    await this.ensureSystemRoles();
  }

  async ensureSystemRoles(): Promise<void> {
    for (const def of SYSTEM_ROLES) {
      await this.model.updateOne(
        { name: def.name },
        { $set: { permissions: def.permissions, description: def.description, isSystem: true } },
        { upsert: true },
      );
    }
  }

  findByName(name: string) {
    return this.model.findOne({ name }).lean();
  }

  findById(id: string | Types.ObjectId) {
    return this.model.findById(id).lean();
  }

  paginate(query: ParsedPageQuery) {
    return this.repo.paginate(query);
  }

  async getOrThrow(id: string) {
    // Via the repository (not the raw model): its findById applies the same `_id` -> `id`
    // mapping paginate() does, so this client-facing read matches every other endpoint.
    const role = await this.repo.findById(id);
    if (!role) throw new DomainException(ErrorCode.NOT_FOUND, "Role not found", 404);
    return role;
  }

  async create(input: CreateRoleInput) {
    if (!input.name?.trim()) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Role name is required", 400);
    }
    const created = await this.model.create({
      name: input.name.trim(),
      permissions: input.permissions ?? [],
      description: input.description,
      isSystem: false,
    });
    return created.toJSON();
  }

  async update(id: string, input: UpdateRoleInput) {
    const role = await this.model.findById(id);
    if (!role) throw new DomainException(ErrorCode.NOT_FOUND, "Role not found", 404);
    if (role.isSystem) {
      throw new DomainException(ErrorCode.FORBIDDEN, "System roles cannot be modified", 403);
    }
    if (input.permissions) role.permissions = input.permissions;
    if (input.description !== undefined) role.description = input.description;
    await role.save();
    return role.toJSON();
  }

  async remove(id: string): Promise<{ id: string }> {
    const role = await this.model.findById(id);
    if (!role) throw new DomainException(ErrorCode.NOT_FOUND, "Role not found", 404);
    if (role.isSystem) {
      throw new DomainException(ErrorCode.FORBIDDEN, "System roles cannot be deleted", 403);
    }
    await role.deleteOne();
    return { id };
  }
}
