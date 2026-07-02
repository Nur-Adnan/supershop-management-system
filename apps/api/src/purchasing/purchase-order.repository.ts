import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { PurchaseOrder } from "./purchase-order.schema";

@Injectable()
export class PurchaseOrderRepository extends BaseRepository<PurchaseOrder> {
  constructor(@InjectModel(PurchaseOrder.name) model: Model<PurchaseOrder>) {
    super(model);
  }
}
