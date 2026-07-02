import type { ClientSession, Model, QueryFilter, UpdateQuery } from "mongoose";
import { idTransform } from "../base.schema";
import { Page } from "../pagination/page";
import type { ParsedPageQuery } from "../query/parse-query";

export interface RepoOptions {
  session?: ClientSession;
}

/** Every document returned by this repository carries `id` (see mapId) — reflect that in the
 * type so callers that need a just-fetched/created document's own id (e.g. to link it from
 * another document created in the same transaction) don't need an unsound cast. */
export type WithId<T> = T & { id: string };

/**
 * `.lean()` returns a plain POJO straight from the driver — it skips Mongoose document
 * machinery entirely, including the registered toObject/toJSON transform (idTransform:
 * `_id` -> `id`) that `create()` gets via `.toObject()`. Without this, every lean-based read
 * (findById/findOne/paginate/updateById) would return `_id` while create() returns `id`,
 * an inconsistent API contract. Apply the same transform by hand so both paths agree.
 */
function mapId<T>(doc: T | null): WithId<T> | null {
  if (!doc) return null;
  idTransform(null, doc as Record<string, unknown>);
  return doc as WithId<T>;
}

/**
 * Thin, typed, session-aware wrapper over a Mongoose model. Every mutating method
 * accepts a `session` so it can participate in a `withTransaction` block. Reads return
 * lean POJOs; domain services own business logic (no logic here).
 */
export abstract class BaseRepository<TDoc> {
  protected constructor(protected readonly model: Model<TDoc>) {}

  async create(doc: Partial<TDoc>, opts: RepoOptions = {}): Promise<WithId<TDoc>> {
    const created = new this.model(doc);
    await created.save({ session: opts.session });
    // Mongoose's own .toObject() typing doesn't model the schema's registered idTransform
    // (_id -> id, drops __v) — the cast is correct at runtime, just unprovable statically.
    return created.toObject() as unknown as WithId<TDoc>;
  }

  async findById(id: string, opts: RepoOptions = {}): Promise<WithId<TDoc> | null> {
    const doc = await this.model
      .findById(id, undefined, { session: opts.session })
      .lean<TDoc>()
      .exec();
    return mapId(doc);
  }

  async findOne(filter: QueryFilter<TDoc>, opts: RepoOptions = {}): Promise<WithId<TDoc> | null> {
    const doc = await this.model
      .findOne(filter, undefined, { session: opts.session })
      .lean<TDoc>()
      .exec();
    return mapId(doc);
  }

  async exists(filter: QueryFilter<TDoc>, opts: RepoOptions = {}): Promise<boolean> {
    const found = await this.model.exists(filter).session(opts.session ?? null);
    return found !== null;
  }

  count(filter: QueryFilter<TDoc> = {}, opts: RepoOptions = {}): Promise<number> {
    return this.model
      .countDocuments(filter)
      .session(opts.session ?? null)
      .exec();
  }

  async updateById(
    id: string,
    update: UpdateQuery<TDoc>,
    opts: RepoOptions = {},
  ): Promise<WithId<TDoc> | null> {
    const doc = await this.model
      .findByIdAndUpdate(id, update, { returnDocument: "after", session: opts.session })
      .lean<TDoc>()
      .exec();
    return mapId(doc);
  }

  /**
   * Soft-delete: stamp `deletedAt`/`deletedBy`. The schema read-filter (see applyBaseSchema)
   * both hides the result from future reads AND ensures an already-deleted doc won't re-delete
   * (the filter adds `deletedAt: null`), so a second call returns null → the service raises 404.
   */
  softDelete(id: string, deletedBy?: string, opts: RepoOptions = {}): Promise<WithId<TDoc> | null> {
    const patch: Record<string, unknown> = { deletedAt: new Date() };
    if (deletedBy) patch.deletedBy = deletedBy;
    return this.updateById(id, { $set: patch } as UpdateQuery<TDoc>, opts);
  }

  /** Page-based pagination. `baseFilter` (server-imposed scope) merges over the parsed client filter. */
  async paginate(
    query: ParsedPageQuery,
    baseFilter: QueryFilter<TDoc> = {},
    opts: RepoOptions = {},
  ): Promise<Page<WithId<TDoc>>> {
    const filter = { ...query.filter, ...baseFilter } as QueryFilter<TDoc>;
    const [items, total] = await Promise.all([
      this.model
        .find(filter, undefined, { session: opts.session })
        .sort(query.sort)
        .skip(query.skip)
        .limit(query.limit)
        .lean<TDoc[]>()
        .exec(),
      this.model
        .countDocuments(filter)
        .session(opts.session ?? null)
        .exec(),
    ]);
    const mapped = items.map((item) => mapId(item)) as WithId<TDoc>[];
    return new Page(mapped, {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.ceil(total / query.limit),
      hasMore: query.skip + items.length < total,
    });
  }
}
