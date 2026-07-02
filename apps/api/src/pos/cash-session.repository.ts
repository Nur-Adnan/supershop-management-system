import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { CashSession } from "./cash-session.schema";

@Injectable()
export class CashSessionRepository extends BaseRepository<CashSession> {
  constructor(@InjectModel(CashSession.name) model: Model<CashSession>) {
    super(model);
  }
}
