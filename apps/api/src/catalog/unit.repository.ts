import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Unit } from "./unit.schema";

@Injectable()
export class UnitsRepository extends BaseRepository<Unit> {
  constructor(@InjectModel(Unit.name) model: Model<Unit>) {
    super(model);
  }
}
