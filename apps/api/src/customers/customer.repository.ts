import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Customer } from "./customer.schema";

@Injectable()
export class CustomersRepository extends BaseRepository<Customer> {
  constructor(@InjectModel(Customer.name) model: Model<Customer>) {
    super(model);
  }
}
