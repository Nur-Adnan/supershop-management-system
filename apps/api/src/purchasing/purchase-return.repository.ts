import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { PurchaseReturn } from "./purchase-return.schema";

@Injectable()
export class PurchaseReturnRepository extends BaseRepository<PurchaseReturn> {
  constructor(@InjectModel(PurchaseReturn.name) model: Model<PurchaseReturn>) {
    super(model);
  }
}
