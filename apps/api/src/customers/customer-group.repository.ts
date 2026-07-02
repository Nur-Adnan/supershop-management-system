import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { CustomerGroup } from "./customer-group.schema";

@Injectable()
export class CustomerGroupsRepository extends BaseRepository<CustomerGroup> {
  constructor(@InjectModel(CustomerGroup.name) model: Model<CustomerGroup>) {
    super(model);
  }
}
