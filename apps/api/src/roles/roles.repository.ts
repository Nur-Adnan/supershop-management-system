import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { Role } from "./role.schema";

@Injectable()
export class RolesRepository extends BaseRepository<Role> {
  constructor(@InjectModel(Role.name) model: Model<Role>) {
    super(model);
  }
}
