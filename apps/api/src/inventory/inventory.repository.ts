import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Inventory } from "./inventory.schema";

@Injectable()
export class InventoryRepository extends BaseRepository<Inventory> {
  constructor(@InjectModel(Inventory.name) model: Model<Inventory>) {
    super(model);
  }
}
