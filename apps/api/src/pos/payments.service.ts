import { Injectable } from "@nestjs/common";
import { ErrorCode } from "@supershop/shared";
import { DomainException } from "../common/domain.exception";
import type { ParsedPageQuery } from "../common/query/parse-query";
import { PaymentRepository } from "./payment.repository";
import type { Payment } from "./payment.schema";

@Injectable()
export class PaymentsService {
  constructor(private readonly payments: PaymentRepository) {}

  paginate(query: ParsedPageQuery, baseFilter = {}) {
    return this.payments.paginate(query, baseFilter);
  }

  async getOrThrow(id: string): Promise<Payment> {
    const payment = await this.payments.findById(id);
    if (!payment) throw new DomainException(ErrorCode.NOT_FOUND, "Payment not found", 404);
    return payment;
  }
}
