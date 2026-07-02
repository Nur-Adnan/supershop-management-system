import { Injectable } from "@nestjs/common";
import { BaseCrudService } from "../common/service/base-crud.service";
import { UnitsRepository } from "./unit.repository";
import type { Unit } from "./unit.schema";

@Injectable()
export class UnitsService extends BaseCrudService<Unit> {
  protected readonly entityName = "Unit";

  constructor(repo: UnitsRepository) {
    super(repo);
  }

  protected override conflictMessage(): string {
    return "A unit with this code already exists";
  }
}
