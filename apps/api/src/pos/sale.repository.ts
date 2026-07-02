import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Sale } from "./sale.schema";

@Injectable()
export class SaleRepository extends BaseRepository<Sale> {
  constructor(@InjectModel(Sale.name) model: Model<Sale>) {
    super(model);
  }
}
