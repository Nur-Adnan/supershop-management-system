import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { BaseCrudService, type WritePayload } from "../common/service/base-crud.service";
import { CustomerGroupsRepository } from "./customer-group.repository";
import { CustomersRepository } from "./customer.repository";
import type { Customer } from "./customer.schema";

@Injectable()
export class CustomersService extends BaseCrudService<Customer> {
  protected readonly entityName = "Customer";

  constructor(
    private readonly customers: CustomersRepository,
    private readonly groups: CustomerGroupsRepository,
  ) {
    super(customers);
  }

  protected override conflictMessage(): string {
    return "A customer with this phone already exists";
  }

  protected override async validateCreate(input: WritePayload): Promise<void> {
    await this.assertGroupExists(input.groupId);
  }

  protected override async validateUpdate(_id: string, input: WritePayload): Promise<void> {
    await this.assertGroupExists(input.groupId);
  }

  private async assertGroupExists(groupId: unknown): Promise<void> {
    if (groupId && !(await this.groups.findById(String(groupId)))) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Customer group does not exist", 400);
    }
  }
}
