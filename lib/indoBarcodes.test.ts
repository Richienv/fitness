import test from "node:test";
import assert from "node:assert/strict";
import { createBarcodeStabilizer, isValidEanChecksum } from "./barcode.ts";
import { indoBarcodeCount, lookupIndoBarcode } from "./indoBarcodes.ts";

test("isValidEanChecksum validates real GS1 EAN-13 and EAN-8 check digits", () => {
  assert.equal(isValidEanChecksum("8997240600041"), true); // Oatside Oat Milk
  assert.equal(isValidEanChecksum("8996001600269"), true); // Le Minerale
  assert.equal(isValidEanChecksum("8997240600042"), false); // bad check digit
  assert.equal(isValidEanChecksum("96385074"), true); // valid EAN-8
  assert.equal(isValidEanChecksum("96385075"), false);
});

test("createBarcodeStabilizer locks immediately on checksum-verified barcode when enabled", () => {
  const stab = createBarcodeStabilizer(2, 2000, true);
  assert.equal(stab.push("8997240600041", 1000), "8997240600041");
  // Non-EAN-valid sequence still falls back to 2-frame matching
  assert.equal(stab.push("1234567890", 1100), null);
  assert.equal(stab.push("1234567890", 1300), "1234567890");
});

test("lookupIndoBarcode resolves curated Indonesian products and keeps nutrition consistent", () => {
  assert.ok(indoBarcodeCount() >= 50);
  const oatside = lookupIndoBarcode("8997240600041");
  assert.ok(oatside);
  assert.equal(oatside.source, "indo_pack");
  assert.ok(oatside.kcal !== null && oatside.kcal >= 0);

  const tehPucuk = lookupIndoBarcode("8996001600146");
  assert.ok(tehPucuk);
  assert.match(tehPucuk.name, /Teh Pucuk/i);

  assert.equal(lookupIndoBarcode("0000000000000"), null);
});
