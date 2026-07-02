import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Supplier } from "./supplier.schema";

@Injectable()
export class SuppliersRepository extends BaseRepository<Supplier> {
  constructor(@InjectModel(Supplier.name) model: Model<Supplier>) {
    super(model);
  }
}
