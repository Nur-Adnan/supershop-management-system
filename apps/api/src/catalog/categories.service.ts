import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import { BaseCrudService, type WritePayload } from "../common/service/base-crud.service";
import { CategoriesRepository } from "./category.repository";
import type { Category } from "./category.schema";

@Injectable()
export class CategoriesService extends BaseCrudService<Category> {
  protected readonly entityName = "Category";

  constructor(private readonly categories: CategoriesRepository) {
    super(categories);
  }

  protected override async validateCreate(input: WritePayload): Promise<void> {
    await this.assertParentExists(input.parentId);
  }

  protected override async validateUpdate(id: string, input: WritePayload): Promise<void> {
    if (input.parentId === undefined) return;
    if (input.parentId !== null && String(input.parentId) === id) {
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        "A category cannot be its own parent",
        400,
      );
    }
    await this.assertParentExists(input.parentId);
    await this.assertNoCycle(id, input.parentId);
  }

  private async assertParentExists(parentId: unknown): Promise<void> {
    if (!parentId) return;
    const parent = await this.categories.findById(String(parentId));
    if (!parent) {
      throw new DomainException(ErrorCode.VALIDATION_ERROR, "Parent category does not exist", 400);
    }
  }

  /** Walk the proposed parent's ancestor chain; reaching `id` would form a cycle. */
  private async assertNoCycle(id: string, parentId: unknown): Promise<void> {
    const seen = new Set<string>([id]);
    let cursor = parentId ? String(parentId) : null;
    while (cursor) {
      if (seen.has(cursor)) {
        throw new DomainException(
          ErrorCode.VALIDATION_ERROR,
          "Category parent would form a cycle",
          400,
        );
      }
      seen.add(cursor);
      const node = await this.categories.findById(cursor);
      cursor = node?.parentId ? String(node.parentId) : null;
    }
  }
}
