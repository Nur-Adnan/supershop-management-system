import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Payment } from "./payment.schema";

@Injectable()
export class PaymentRepository extends BaseRepository<Payment> {
  constructor(@InjectModel(Payment.name) model: Model<Payment>) {
    super(model);
  }
}
