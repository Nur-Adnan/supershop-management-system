import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";

/**
 * A product's referenced unit must exist, and a product sold by weight must use a unit that
 * allows decimal quantities (e.g. kg), never a discrete unit (e.g. piece). Pure — unit-tested.
 */
export function assertUnitSupportsProduct(
  isWeighted: boolean,
  unit: { allowDecimal: boolean } | null,
): void {
  if (!unit) {
    throw new DomainException(ErrorCode.VALIDATION_ERROR, "Unit does not exist", 400);
  }
  if (isWeighted && !unit.allowDecimal) {
    throw new DomainException(
      ErrorCode.VALIDATION_ERROR,
      "A weighted product must use a unit that allows decimals",
      400,
    );
  }
}
