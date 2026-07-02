import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { GoodsReceipt } from "./goods-receipt.schema";

@Injectable()
export class GoodsReceiptRepository extends BaseRepository<GoodsReceipt> {
  constructor(@InjectModel(GoodsReceipt.name) model: Model<GoodsReceipt>) {
    super(model);
  }
}
