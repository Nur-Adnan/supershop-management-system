import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { ClientSession, Model } from "mongoose";
import type { WithId } from "../common/repository/base.repository";
import { BaseRepository } from "../common/repository/base.repository";
import { Promotion } from "./promotion.schema";

@Injectable()
export class PromotionRepository extends BaseRepository<Promotion> {
  constructor(@InjectModel(Promotion.name) model: Model<Promotion>) {
    super(model);
  }
}

/**
 * Case-insensitive lookup for checkout — Mongoose's `uppercase: true` only normalizes on write,
 * not on query filters. Applicability (isActive/window/usage limit/customer group) is NOT
 * checked here — callers validate that via assertPromotionApplicable. Mirrors
 * requireAccountByCode's role for cross-module system lookups by natural key.
 */
export async function findPromotionByCode(
  promotions: PromotionRepository,
  code: string,
  session?: ClientSession,
): Promise<WithId<Promotion> | null> {
  return promotions.findOne({ code: code.toUpperCase() }, { session });
}
