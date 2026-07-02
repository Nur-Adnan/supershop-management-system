import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { StockMovement } from "./stock-movement.schema";

@Injectable()
export class StockMovementRepository extends BaseRepository<StockMovement> {
  constructor(@InjectModel(StockMovement.name) model: Model<StockMovement>) {
    super(model);
  }
}
