import test from "node:test";
import assert from "node:assert/strict";
import { parseBarcodeProduct } from "./barcode.ts";

const code = "6921168509256";

test("Chinese-only product names preserve the product and its declared nutrition", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        code,
        product_name_zh: "农夫山泉",
        nutrition_data_per: "100ml",
        nutriments: {
          "energy-kcal_100g": 0,
          proteins_100g: 0,
          carbohydrates_100g: 0,
          fat_100g: 0,
        },
      },
    },
    code,
  );
  assert.equal(product?.name, "农夫山泉");
  assert.equal(product?.basis, "ml");
  assert.equal(product?.kcal, 0);
  assert.equal(product?.protein, 0);
});

test("blank preferred language fields do not hide an available name", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name_id: "  ",
        product_name: "  Milk  ",
        product_name_en: "Milk",
        nutriments: { "energy-kcal_100g": 60 },
      },
    },
    code,
  );
  assert.equal(product?.name, "Milk");
  assert.equal(product?.nameMissing, undefined);
});

test("missing names do not discard existing nutrition or fabricate a food name", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        code,
        brands: "Brand",
        nutriments: { "energy-kcal_100g": 100, proteins_100g: 5 },
      },
    },
    code,
  );
  assert.equal(product?.name, `Produk ${code}`);
  assert.equal(product?.nameMissing, true);
  assert.equal(product?.kcal, 100);
  assert.equal(product?.protein, 5);
  assert.equal(product?.fat, null);
});

test("numeric strings and the explicit kJ field retain available nutrients", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name: "Product",
        nutriments: {
          "energy-kj_100g": "418.4",
          proteins_100g: " 2,5 ",
          carbohydrates_100g: "12",
          fat_100g: "0",
        },
      },
    },
    code,
  );
  assert.equal(product?.basis, "g");
  assert.ok(Math.abs(product!.kcal! - 100) < 1e-9);
  assert.equal(product?.protein, 2.5);
  assert.equal(product?.carbs, 12);
  assert.equal(product?.fat, 0);
  assert.equal(product?.sugar, null);
});

test("malformed and missing nutrient values are never converted to zero", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name: "Product",
        nutriments: {
          "energy-kcal_100g": "",
          proteins_100g: false,
          carbohydrates_100g: "NaN",
          fat_100g: "-2",
          sugars_100g: "Infinity",
        },
      },
    },
    code,
  );
  assert.equal(product?.kcal, null);
  assert.equal(product?.protein, null);
  assert.equal(product?.carbs, null);
  assert.equal(product?.fat, null);
  assert.equal(product?.sugar, null);
});

test("the provider's explicit 100g basis overrides bottle volume", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name: "Product",
        quantity: "500 ml",
        product_quantity_unit: "ml",
        nutrition_data_per: "100g",
        nutriments: { "energy-kcal_100g": 60 },
      },
    },
    code,
  );
  assert.equal(product?.basis, "g");
});

test("Chinese volume and the provider's quantity unit identify ml when no basis is declared", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name_zh: "饮料",
        quantity: "500毫升",
        nutriments: { "energy-kcal_100g": 60 },
      },
    },
    code,
  );
  assert.equal(product?.basis, "ml");
});

test("a product record without nutrition stays identifiable with unknown values", () => {
  const product = parseBarcodeProduct(
    { product: { code, product_name_zh: "饮用水" } },
    code,
  );
  assert.equal(product?.name, "饮用水");
  assert.equal(product?.kcal, null);
  assert.equal(product?.protein, null);
});

test("not-found and malformed provider responses do not become products", () => {
  for (const response of [
    null,
    {},
    { product: null },
    { product: [] },
    { product: {} },
    { product: "bad" },
  ]) {
    assert.equal(parseBarcodeProduct(response, code), null);
  }
});

test("declared 100ml basis survives when only minerals are present", () => {
  const product = parseBarcodeProduct(
    {
      product: {
        product_name_zh: "矿泉水",
        nutrition_data_per: "100ml",
        nutriments: { calcium_100g: 0.0006, salt_100g: 0.0015 },
      },
    },
    code,
  );
  assert.equal(product?.basis, "ml");
  assert.equal(product?.kcal, null);
  assert.equal(product?.protein, null);
});
