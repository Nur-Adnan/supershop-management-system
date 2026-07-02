import { Injectable } from "@nestjs/common";
import { BaseCrudService } from "../common/service/base-crud.service";
import { CustomerGroupsRepository } from "./customer-group.repository";
import type { CustomerGroup } from "./customer-group.schema";

@Injectable()
export class CustomerGroupsService extends BaseCrudService<CustomerGroup> {
  protected readonly entityName = "Customer group";

  constructor(repo: CustomerGroupsRepository) {
    super(repo);
  }

  protected override conflictMessage(): string {
    return "A customer group with this name already exists";
  }
}
