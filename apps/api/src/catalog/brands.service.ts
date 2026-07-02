import { Injectable } from "@nestjs/common";
import { BaseCrudService } from "../common/service/base-crud.service";
import { BrandsRepository } from "./brand.repository";
import type { Brand } from "./brand.schema";

@Injectable()
export class BrandsService extends BaseCrudService<Brand> {
  protected readonly entityName = "Brand";

  constructor(repo: BrandsRepository) {
    super(repo);
  }

  protected override conflictMessage(): string {
    return "A brand with this name already exists";
  }
}
