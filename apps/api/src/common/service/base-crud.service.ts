import { HttpException } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import type { QueryFilter, UpdateQuery } from "mongoose";
import type { Principal } from "../../auth/principal";
import { DomainException } from "../domain.exception";
import { throwConflictOnDuplicate } from "../mongo.util";
import type { Page } from "../pagination/page";
import type { ParsedPageQuery } from "../query/parse-query";
import type { BaseRepository } from "../repository/base.repository";

/** A validated create/update payload as a plain record. String ids from Zod DTOs are cast to
 * ObjectId by Mongoose on write — this is the DTO → persistence boundary. Public methods accept
 * `object` (a DTO instance qualifies; a `Record` doesn't) and normalize to this internally. */
export type WritePayload = Record<string, unknown>;

/** Normalize a DTO instance (or any object) to a plain record for persistence. */
export const toWritePayload = (input: object): WritePayload => input as WritePayload;

/** Set createdBy (on insert) and updatedBy from the acting principal. */
function stamp(input: WritePayload, actor: Principal | undefined, isCreate: boolean): WritePayload {
  if (!actor?.userId) return input;
  const out: WritePayload = { ...input, updatedBy: actor.userId };
  if (isCreate) out.createdBy = actor.userId;
  return out;
}

/**
 * Generic master-data CRUD: create/paginate/get/update/soft-delete with createdBy/updatedBy
 * stamping and unique-index → 409 CONFLICT mapping. Entity-specific rules go in the
 * `validateCreate`/`validateUpdate` hooks and `conflictMessage`. Soft-delete-aware throughout.
 */
export abstract class BaseCrudService<TDoc> {
  protected abstract readonly entityName: string;

  protected constructor(protected readonly repo: BaseRepository<TDoc>) {}

  /** Message for a duplicate-key violation. Override to name the offending field. */
  protected conflictMessage(): string {
    return `${this.entityName} already exists`;
  }

  /** Cross-document invariants before insert (e.g. referenced ids exist). Default: none. */
  protected async validateCreate(input: WritePayload): Promise<void> {
    void input;
  }

  /** Cross-document invariants before update. Default: none. */
  protected async validateUpdate(id: string, input: WritePayload): Promise<void> {
    void id;
    void input;
  }

  paginate(query: ParsedPageQuery, baseFilter: QueryFilter<TDoc> = {}): Promise<Page<TDoc>> {
    return this.repo.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<TDoc> {
    const doc = await this.repo.findById(id);
    if (!doc) throw new DomainException(ErrorCode.NOT_FOUND, `${this.entityName} not found`, 404);
    return doc;
  }

  async create(input: object, actor?: Principal): Promise<TDoc> {
    const payload = toWritePayload(input);
    await this.validateCreate(payload);
    try {
      return await this.repo.create(stamp(payload, actor, true) as Partial<TDoc>);
    } catch (err) {
      throwConflictOnDuplicate(err, this.conflictMessage());
    }
  }

  async update(id: string, input: object, actor?: Principal): Promise<TDoc> {
    const payload = toWritePayload(input);
    await this.getOrThrow(id);
    await this.validateUpdate(id, payload);
    try {
      const updated = await this.repo.updateById(id, {
        $set: stamp(payload, actor, false),
      } as UpdateQuery<TDoc>);
      if (!updated)
        throw new DomainException(ErrorCode.NOT_FOUND, `${this.entityName} not found`, 404);
      return updated;
    } catch (err) {
      if (err instanceof HttpException) throw err; // don't mask our own 404
      throwConflictOnDuplicate(err, this.conflictMessage());
    }
  }

  async remove(id: string, actor?: Principal): Promise<{ id: string }> {
    const deleted = await this.repo.softDelete(id, actor?.userId);
    if (!deleted)
      throw new DomainException(ErrorCode.NOT_FOUND, `${this.entityName} not found`, 404);
    return { id };
  }
}
