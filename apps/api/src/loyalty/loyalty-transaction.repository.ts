import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { LoyaltyTransaction } from "./loyalty-transaction.schema";

@Injectable()
export class LoyaltyTransactionRepository extends BaseRepository<LoyaltyTransaction> {
  constructor(@InjectModel(LoyaltyTransaction.name) model: Model<LoyaltyTransaction>) {
    super(model);
  }
}
