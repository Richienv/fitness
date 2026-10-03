# Chinese nutrition labels

Use **Scan barcode → Scan label nutrisi** to bypass the product catalogue. The camera reads the table continuously and opens a review form after two matching complete readings (or three matching partial readings with at least two core nutrients), with a recognized reference basis or nutrition-table heading. The user reviews, names, edits and adds the food. An image file can use the same OCR and review flow. No food is automatically saved.

Recognition uses the official PaddleOCR.js 0.4.2 SDK with PP-OCRv5 mobile detection and recognition models in a browser worker. `scripts/prepare-ocr.mjs` bundles the SDK, copies its worker and matching ONNX Runtime 1.24.3 files, and downloads SHA-256-pinned official model archives. All runtime assets are served from `/ocr/paddle-v1` by this app. Photo pixels remain on-device; no OCR account, cloud key or paid API is required. The first load downloads the recognition assets and is slower than later reads. Generated assets are ignored by Git and prepared by both app builds and local development.

The parser joins detected cells along the table's slanted rows, then maps Chinese and English nutrient labels. It uses explicit amount units; it never uses NRV percentages as amounts. kJ is divided by 4.184 to produce kcal. Sodium is stored in mg, other optional nutrients in g. Saturated and trans fat stay separate from total fat. Salt and sodium stay separate; sodium × 2.5 / 1000 is displayed as a salt-equivalent explanation, without filling an unobserved salt field. Unknown nutrients remain blank. An unknown reference basis requires a user selection.

Per 100 g/ml and per serving are supported. The review form scales all nutrients to the entered consumed amount. Sugar, sodium, salt, saturated fat, trans fat and fiber survive the tray, meal JSON, server import and recipe composition. Existing meals and catalogue records require no migration.

The supplied sample label declares per 100 g: energy 2228 kJ (532.5048 kcal), protein 8.2 g, total fat 28.6 g, saturated fat 16 g, trans fat 0 g, carbohydrates 60.6 g, sugar 18 g and sodium 251 mg. Its salt amount is not declared.

OCR quality depends on legibility. Glare, folds, severe perspective and blur can omit or misread fields; the review form remains mandatory. A browser test with a static image camera fixture verifies the automatic loop and actual OCR, but does not substitute for testing the physical phone camera.

Sources: [official SDK](https://github.com/PaddlePaddle/PaddleOCR/tree/main/paddleocr-js), [official SDK API](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md). PaddleOCR is Apache-2.0; the generated SDK bundle retains license notices.
