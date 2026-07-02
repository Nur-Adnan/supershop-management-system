import { Injectable } from "@nestjs/common";
import { BaseCrudService } from "../common/service/base-crud.service";
import { StoresRepository } from "./store.repository";
import type { Store } from "./store.schema";

@Injectable()
export class StoresService extends BaseCrudService<Store> {
  protected readonly entityName = "Store";

  constructor(repo: StoresRepository) {
    super(repo);
  }

  protected override conflictMessage(): string {
    return "A store with this code already exists";
  }
}
