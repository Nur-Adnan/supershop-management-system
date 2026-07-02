import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Expense } from "./expense.schema";

@Injectable()
export class ExpenseRepository extends BaseRepository<Expense> {
  constructor(@InjectModel(Expense.name) model: Model<Expense>) {
    super(model);
  }
}
