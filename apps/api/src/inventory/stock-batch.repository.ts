import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { StockBatch } from "./stock-batch.schema";

@Injectable()
export class StockBatchRepository extends BaseRepository<StockBatch> {
  constructor(@InjectModel(StockBatch.name) model: Model<StockBatch>) {
    super(model);
  }
}
