import { Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { Model } from "mongoose";
import { BaseRepository } from "../common/repository/base.repository";
import { JournalEntry } from "./journal-entry.schema";

@Injectable()
export class JournalEntryRepository extends BaseRepository<JournalEntry> {
  constructor(@InjectModel(JournalEntry.name) model: Model<JournalEntry>) {
    super(model);
  }
}
