import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Category } from "./category.schema";

@Injectable()
export class CategoriesRepository extends BaseRepository<Category> {
  constructor(@InjectModel(Category.name) model: Model<Category>) {
    super(model);
  }
}
