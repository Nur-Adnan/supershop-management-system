import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode } from "@supershop/shared";
import { type Model, Types } from "mongoose";
import { DomainException } from "../common/domain.exception";
import { isDuplicateKeyError } from "../common/mongo.util";
import type { ParsedPageQuery } from "../common/query/parse-query";
import type { Env } from "../config/env";
import type { Principal } from "../auth/principal";
import { AuditService } from "../audit/audit.service";
import { TransactionService } from "../database/transaction.service";
import { RolesService } from "../roles/roles.service";
import { User, type UserDocument } from "./user.schema";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  private readonly defaultRoleName: string;

  constructor(
    @InjectModel(User.name) private readonly model: Model<UserDocument>,
    private readonly repo: UsersRepository,
    private readonly roles: RolesService,
    private readonly txn: TransactionService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.defaultRoleName = config.get("AUTH_DEFAULT_ROLE", { infer: true });
  }

  /** Lazily provisions the Mongo user on first sight, then resolves their RBAC principal. */
  async resolvePrincipal(supabaseId: string, email: string): Promise<Principal> {
    // withDeleted: a soft-deleted/disabled user must still be found here so they're denied
    // (otherwise the read filter hides them and they'd be silently re-provisioned).
    const user =
      (await this.model.findOne({ supabaseId }).setOptions({ withDeleted: true }).lean()) ??
      (await this.provision(supabaseId, email));
    const role = await this.roles.findById(user.roleId);
    if (!role) {
      throw new DomainException(ErrorCode.FORBIDDEN, "User has no valid role assigned", 403);
    }
    return {
      userId: String(user._id),
      supabaseId: user.supabaseId,
      email: user.email,
      roleName: role.name,
      permissions: role.permissions,
      storeIds: (user.storeIds ?? []).map((s) => String(s)),
      status: user.status,
    };
  }

  private async provision(supabaseId: string, email: string) {
    const role = await this.roles.findByName(this.defaultRoleName);
    if (!role) {
      throw new DomainException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `Default role '${this.defaultRoleName}' is not seeded`,
        503,
      );
    }
    try {
      const created = await this.model.create({
        supabaseId,
        email,
        roleId: role._id,
        storeIds: [],
        status: "active",
      });
      return created.toObject();
    } catch (err) {
      // Concurrent first-request from the same new user — re-read the winner.
      if (!isDuplicateKeyError(err)) throw err;
      const existing = await this.model
        .findOne({ supabaseId })
        .setOptions({ withDeleted: true })
        .lean();
      if (!existing) throw err;
      return existing;
    }
  }

  // --- Supabase webhook sync ---

  async deactivateBySupabaseId(supabaseId: string): Promise<void> {
    await this.model.updateOne(
      { supabaseId },
      { $set: { status: "disabled", deletedAt: new Date() } },
    );
  }

  async upsertFromAuthEvent(supabaseId: string, email: string): Promise<void> {
    const role = await this.roles.findByName(this.defaultRoleName);
    if (!role) {
      throw new DomainException(
        ErrorCode.SERVICE_UNAVAILABLE,
        `Default role '${this.defaultRoleName}' is not seeded`,
        503,
      );
    }
    await this.model.updateOne(
      { supabaseId },
      { $set: { email }, $setOnInsert: { roleId: role._id, storeIds: [], status: "active" } },
      { upsert: true },
    );
  }

  // --- Management ---

  paginate(query: ParsedPageQuery) {
    return this.repo.paginate(query);
  }

  async getOrThrow(id: string) {
    // Via the repository (not the raw model): its findById applies the same `_id` -> `id`
    // mapping paginate() does, so this client-facing read matches every other endpoint.
    const user = await this.repo.findById(id);
    if (!user) throw new DomainException(ErrorCode.NOT_FOUND, "User not found", 404);
    return user;
  }

  async assignRole(userId: string, roleId: string, actor?: Principal) {
    const role = await this.roles.findById(roleId);
    if (!role) throw new DomainException(ErrorCode.VALIDATION_ERROR, "Role does not exist", 400);
    return this.auditedUpdate(
      userId,
      { roleId: new Types.ObjectId(roleId) },
      "user.role.assign",
      (u) => ({ roleId: String(u.roleId) }),
      actor,
    );
  }

  async assignStores(userId: string, storeIds: string[], actor?: Principal) {
    const ids = storeIds.map((s) => {
      if (!Types.ObjectId.isValid(s)) {
        throw new DomainException(ErrorCode.VALIDATION_ERROR, `Invalid storeId: ${s}`, 400);
      }
      return new Types.ObjectId(s);
    });
    return this.auditedUpdate(
      userId,
      { storeIds: ids },
      "user.stores.assign",
      (u) => ({ storeIds: (u.storeIds ?? []).map((id) => String(id)) }),
      actor,
    );
  }

  async setStatus(userId: string, status: "active" | "disabled", actor?: Principal) {
    return this.auditedUpdate(
      userId,
      { status },
      "user.status.set",
      (u) => ({ status: u.status }),
      actor,
    );
  }

  /** Applies a $set update and writes the before/after audit record in ONE transaction. */
  private auditedUpdate(
    userId: string,
    update: Partial<User>,
    action: string,
    snapshot: (user: User) => Record<string, unknown>,
    actor?: Principal,
  ) {
    return this.txn.withTransaction(async (session) => {
      const before = await this.repo.findById(userId, { session });
      if (!before) throw new DomainException(ErrorCode.NOT_FOUND, "User not found", 404);
      const after = await this.repo.updateById(userId, { $set: update }, { session });
      if (!after) throw new DomainException(ErrorCode.NOT_FOUND, "User not found", 404);
      await this.audit.record(
        {
          action,
          entityType: "User",
          entityId: userId,
          actorId: actor?.userId,
          actorEmail: actor?.email,
          before: snapshot(before),
          after: snapshot(after),
        },
        session,
      );
      return after;
    });
  }
}
