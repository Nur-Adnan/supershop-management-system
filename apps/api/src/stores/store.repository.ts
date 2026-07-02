import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Store } from "./store.schema";

@Injectable()
export class StoresRepository extends BaseRepository<Store> {
  constructor(@InjectModel(Store.name) model: Model<Store>) {
    super(model);
  }
}
