import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "idempotent";

/** Mark a mutating endpoint as requiring an `Idempotency-Key` header (money/stock creators). */
export const Idempotent = (): MethodDecorator & ClassDecorator => SetMetadata(IDEMPOTENT_KEY, true);
