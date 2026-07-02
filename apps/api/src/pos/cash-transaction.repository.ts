import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { CashTransaction } from "./cash-transaction.schema";

@Injectable()
export class CashTransactionRepository extends BaseRepository<CashTransaction> {
  constructor(@InjectModel(CashTransaction.name) model: Model<CashTransaction>) {
    super(model);
  }
}
