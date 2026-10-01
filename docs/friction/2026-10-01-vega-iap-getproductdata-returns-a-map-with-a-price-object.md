# vega iap getProductData returns a Map with a price object

Task attempted: Show the localized Lingo Plus price on Vega (LING-007, `apps/vega/iap/vegaStore.template.ts`).
Steps:
  1. Plan and sample notes said `PurchasingService.getProductData({ skus })` → `productDataMap[sku]` → `{ price, title }`.
  2. `npm pack @amazon-devices/keplerscript-appstore-iap-lib@2.13.0` and read `dist/types/IAPTypes.d.ts`.
Expected: A plain object keyed by SKU, with `price` as a display string, as on Fire OS (`Product.getPrice()` is a string).
Actual: `ProductDataResponse.productData` is a `Map<string, Product>`, and `Product.price` is `{ priceStr, priceCurrencyCode,
valueInMicros: bigint }`. Response codes are numeric enums, and they are not aligned: `PurchaseResponseCode.SUCCESSFUL = 0`, but
`PurchaseUpdatesResponseCode.SUCCESSFUL = 1`. A truthiness check or a reused comparison gets it wrong without a type error.
Severity: Low. About 20 minutes; found by type-checking the template against the published typings, before any device run.
Workaround: `r.productData.get(sku)?.price.priceStr`, and an explicit `switch` per response enum.
Suggestion: Show the Map and the `Price` object in the Vega IAP API reference examples, and say that the enums use different
numbering.
Environment: Linux container, @amazon-devices/keplerscript-appstore-iap-lib 2.13.0 typings (no device).
Links:
  - https://developer.amazon.com/docs/vega/0.22/vega-iap-overview.html
  - https://github.com/AmazonAppDev/vega-video-sample (src/iap/utils)
