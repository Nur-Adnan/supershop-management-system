# Database Blueprint (MongoDB)

> Reference for all phases. Design principle: **embed what is read and written together
> and bounded in size; reference what is shared, large, or independently mutated.**
> Denormalize the few display fields you need at write time (e.g. product name/sku onto a
> sale line) so historical documents are immutable.

Every collection carries: `_id`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, and
soft-delete (`deletedAt`, `deletedBy`) for master data. Financial documents are never
hard-deleted — they are voided/reversed. Money is `{ amount: <int minor units>, currency }`.

## Core collections

| Collection                    | Purpose                                  | Key fields / notes                                                                                                                                    |
| ----------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`                       | App profile mirror of Supabase identity  | `supabaseId` (unique), `email`, `roleId`, `storeIds[]`, `employeeId?`, `status`                                                                       |
| `roles`                       | RBAC roles                               | `name`, `permissions[]` (string keys), `isSystem`                                                                                                     |
| `stores`                      | Branches/outlets                         | `name`, `code`, `address`, `timezone`, `currency`, `taxConfig`, `isActive`                                                                            |
| `categories` `brands` `units` | Catalog taxonomy                         | tree for categories (`parentId`); units carry `precision`, `allowDecimal`                                                                             |
| `products`                    | Catalog                                  | `sku`, `barcodes[]`, `name`, `categoryId`, `brandId`, `unitId`, `variants[]`, `taxRate`, `isWeighted`, `reorderLevel`, `images[]`, `pricing`          |
| `inventory`                   | Current stock cache per (product, store) | `productId`, `storeId`, `currentQty`, `reservedQty`, unique compound index                                                                            |
| `stock_batches`               | Batch/lot + expiry per (product, store)  | `batchNo`, `expiryDate`, `qty`, `costPrice`, FEFO index on `expiryDate`                                                                               |
| `stock_movements`             | Append-only ledger (source of truth)     | `productId`, `storeId`, `batchId?`, `type` (RECEIPT/SALE/TRANSFER_IN/TRANSFER_OUT/ADJUSTMENT/RETURN), `qty` (signed), `refType`, `refId`, `createdBy` |
| `stock_transfers`             | Inter-store transfers                    | `fromStoreId`, `toStoreId`, `lines[]`, `status` (DRAFT/IN_TRANSIT/RECEIVED)                                                                           |
| `stock_adjustments`           | Manual corrections / wastage             | `storeId`, `lines[]`, `reason`, `approvedBy`                                                                                                          |
| `suppliers`                   | Vendors                                  | `name`, `contact`, `paymentTerms`, `openingBalance`                                                                                                   |
| `purchase_orders`             | POs                                      | `number`, `supplierId`, `storeId`, `lines[]`, `status`, totals                                                                                        |
| `goods_receipts`              | GRN against PO                           | `number`, `poId`, `lines[]` (with batch/expiry/cost), `status`                                                                                        |
| `purchase_returns`            | Returns to supplier                      | `grnId?`, `supplierId`, `lines[]`                                                                                                                     |
| `customers`                   | Buyers (incl. credit customers)          | `name`, `phone`, `groupId`, `loyaltyPoints`, `creditLimit`, `openingBalance`                                                                          |
| `customer_groups`             | Pricing/loyalty tiers                    | `name`, `priceRule`, `discountRule`                                                                                                                   |
| `sales`                       | Invoices (POS + back-office)             | `number`, `storeId`, `customerId?`, `shiftId`, `lines[]` (embedded, denormalized), `discounts`, `tax`, `total`, `status`, `idempotencyKey`            |
| `sale_returns`                | Refunds                                  | `saleId`, `lines[]`, `refundMethod`                                                                                                                   |
| `payments`                    | Money in/out (polymorphic)               | `direction` (IN/OUT), `method` (CASH/CARD/BKASH/NAGAD/ROCKET/CREDIT), `refType`, `refId`, `amount`, `idempotencyKey`                                  |
| `cash_sessions` (shifts)      | Register open→close                      | `storeId`, `terminalId`, `openedBy`, `openingFloat`, `closingCount`, `expectedCash`, `variance`, `status`                                             |
| `cash_transactions`           | Drawer ins/outs                          | `sessionId`, `type` (SALE/PAYIN/PAYOUT/REFUND), `amount`                                                                                              |
| `accounts`                    | Chart of accounts                        | `code`, `name`, `type` (ASSET/LIABILITY/EQUITY/INCOME/EXPENSE), `parentId`                                                                            |
| `journal_entries`             | Double-entry postings                    | `number`, `date`, `lines[]` (`{accountId, debit, credit}`), invariant: Σdebit = Σcredit                                                               |
| `expenses`                    | Operating expenses                       | `accountId`, `amount`, `storeId`, `paidVia`                                                                                                           |
| `promotions`                  | Offers/coupons                           | `type` (PERCENT/FIXED/BOGO/BUNDLE), `conditions`, `validFrom/To`, `usageLimit`                                                                        |
| `loyalty_transactions`        | Points earn/redeem                       | `customerId`, `points` (signed), `refId`                                                                                                              |
| `employees`                   | HR records                               | `name`, `userId?`, `storeId`, `position`, `salary`, `commissionRule`                                                                                  |
| `attendance`                  | Clock in/out                             | `employeeId`, `date`, `checkIn`, `checkOut`, `hours`                                                                                                  |
| `payroll_runs`                | Salary cycles                            | `period`, `lines[]`, `status`                                                                                                                         |
| `notifications`               | In-app alerts                            | `userId?`, `roleId?`, `type`, `payload`, `readAt`                                                                                                     |
| `audit_logs`                  | Immutable action log                     | `actorId`, `action`, `entityType`, `entityId`, `before?`, `after?`, `ip`, `at`                                                                        |
| `idempotency_keys`            | Replay protection                        | `key` (unique), `endpoint`, `resultRef`, `expiresAt` (TTL index)                                                                                      |
| `counters`                    | Sequential business numbers              | `name`, `seq` (atomic `$inc`)                                                                                                                         |
| `settings`                    | Org/store config                         | currency, VAT, receipt template, units, feature flags                                                                                                 |

## Indexing strategy (examples)

- `products`: text index on name; unique sparse on `barcodes`; compound `{categoryId, isActive}`.
- `inventory`: unique compound `{productId, storeId}`.
- `stock_batches`: `{productId, storeId, expiryDate}` for FEFO selection.
- `stock_movements`: `{storeId, createdAt}`, `{productId, storeId, createdAt}`, `{refType, refId}`.
- `sales`: `{storeId, createdAt}`, unique sparse `{idempotencyKey}`, `{customerId, createdAt}`.
- `payments`: `{refType, refId}`, `{method, createdAt}`.
- `idempotency_keys`: unique `{key}` + TTL on `expiresAt`.

## Transaction boundaries (must be atomic — `session.withTransaction`)

- **Checkout:** create sale → FEFO-select batches per line → write signed `stock_movements`
  → decrement `inventory.currentQty` + `stock_batches.qty` → write `payments` →
  update `cash_session`/`cash_transactions` → post sale journal entry → bump invoice counter.
- **GRN posting:** create/append batches → write RECEIPT movements → increment inventory →
  update supplier ledger → post purchase journal entry.
- **Transfer receive:** TRANSFER_OUT at source + TRANSFER_IN at destination + batch moves.
- **Journal posting:** lines balanced (Σdebit = Σcredit) enforced before commit.
