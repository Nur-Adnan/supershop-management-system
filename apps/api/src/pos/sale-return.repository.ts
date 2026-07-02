import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { SaleReturn } from "./sale-return.schema";

@Injectable()
export class SaleReturnRepository extends BaseRepository<SaleReturn> {
  constructor(@InjectModel(SaleReturn.name) model: Model<SaleReturn>) {
    super(model);
  }
}
