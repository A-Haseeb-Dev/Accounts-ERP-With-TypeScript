-- Opening stock for items.
--
-- An item can be created for goods the company already holds, so the opening
-- quantity / cost / date are recorded on the item itself. These columns are the
-- editable side of the fact; the `OPENING` InventoryTransaction they produce is
-- what stock figures are summed from. Defaults keep every existing row at zero
-- / no opening, so nothing is back-dated here.
ALTER TABLE "Item"
    ADD COLUMN "openingQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN "openingUnitCost" DECIMAL(18,2),
    ADD COLUMN "openingDate" TIMESTAMP(3);