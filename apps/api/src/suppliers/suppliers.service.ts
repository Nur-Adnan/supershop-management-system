import { Injectable } from "@nestjs/common";
import { BaseCrudService } from "../common/service/base-crud.service";
import { SuppliersRepository } from "./supplier.repository";
import type { Supplier } from "./supplier.schema";

@Injectable()
export class SuppliersService extends BaseCrudService<Supplier> {
  protected readonly entityName = "Supplier";

  constructor(repo: SuppliersRepository) {
    super(repo);
  }

  protected override conflictMessage(): string {
    return "A supplier with this code already exists";
  }
}
