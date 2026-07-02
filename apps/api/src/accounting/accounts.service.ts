import { Injectable, type OnApplicationBootstrap } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { ErrorCode } from "@supershop/shared";
import type { Model } from "mongoose";
import { DomainException } from "../common/domain.exception";
import { BaseCrudService, type WritePayload } from "../common/service/base-crud.service";
import type { Principal } from "../auth/principal";
import { AccountRepository } from "./account.repository";
import { Account } from "./account.schema";
import { SYSTEM_ACCOUNT_DEFS } from "./system-accounts";

@Injectable()
export class AccountsService extends BaseCrudService<Account> implements OnApplicationBootstrap {
  protected readonly entityName = "Account";

  constructor(
    @InjectModel(Account.name) private readonly model: Model<Account>,
    private readonly accounts: AccountRepository,
  ) {
    super(accounts);
  }

  /** Idempotently seed/refresh the system chart of accounts on every boot (mirrors RolesService). */
  async onApplicationBootstrap(): Promise<void> {
    for (const def of SYSTEM_ACCOUNT_DEFS) {
      await this.model.updateOne(
        { code: def.code },
        { $set: { name: def.name, type: def.type, isSystem: true } },
        { upsert: true },
      );
    }
  }

  protected override conflictMessage(): string {
    return "An account with this code already exists";
  }

  protected override async validateCreate(input: WritePayload): Promise<void> {
    await this.assertParentExists(input.parentId);
  }

  protected override async validateUpdate(id: string, input: WritePayload): Promise<void> {
    if (input.parentId === undefined) return;
    if (input.parentId !== null && String(input.parentId) === id) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "An account cannot be its own parent",
        400,
      );
    }
    await this.assertParentExists(input.parentId);
    await this.assertNoCycle(id, input.parentId);
  }

  override async update(id: string, input: object, actor?: Principal): Promise<Account> {
    await this.assertNotSystem(id, "modified");
    return super.update(id, input, actor);
  }

  override async remove(id: string, actor?: Principal): Promise<{ id: string }> {
    await this.assertNotSystem(id, "deleted");
    return super.remove(id, actor);
  }

  private async assertNotSystem(id: string, verb: string): Promise<void> {
    const account = await this.getOrThrow(id);
    if (account.isSystem) {
      throw new DomainException(ErrorCode.FORBIDDEN, `System accounts cannot be ${verb}`, 403);
    }
  }

  private async assertParentExists(parentId: unknown): Promise<void> {
    if (!parentId) return;
    if (!(await this.accounts.findById(String(parentId)))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Parent account does not exist", 400);
    }
  }

  private async assertNoCycle(id: string, parentId: unknown): Promise<void> {
    const seen = new Set<string>([id]);
    let cursor = parentId ? String(parentId) : null;
    while (cursor) {
      if (seen.has(cursor)) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Account parent would form a cycle",
          400,
        );
      }
      seen.add(cursor);
      const node = await this.accounts.findById(cursor);
      cursor = node?.parentId ? String(node.parentId) : null;
    }
  }
}
