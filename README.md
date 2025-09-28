# Aqua Wise Shopify Functions

This repository contains Google Cloud Functions that synchronise Aqua Wise catalogue data with Shopify:

- `shopifyProductSync` (root `index.js`): receives standard product records and creates/publishes them in Shopify.
- `createBundleProducts` (`bundles/AQUA-WISE/index.js`): receives bundle definitions plus supporting products and creates bundle products in Shopify.

Both functions share a common Shopify helper module. When deploying only the bundle function, include `bundles/AQUA-WISE/shopify-helpers.js` in the build source (for example by deploying from repository root or keeping the helper alongside the function code).

## Bundle creation payload

```json
{
  "bundles": [
    {
      "id": "recOa8cVaFOYJCrLK",
      "Bundle Name": "WellFusion™ Bundle 96K Iron Remover",
      "Website Retail Price": 13559,
      "MSRP": 16270,
      "Products": ["recgqM0ywEzv1AM7J", "recocZUd5DofGgvFf"]
    }
  ],
  "products": [
    {
      "id": "recgqM0ywEzv1AM7J",
      "Product Name": "AQUAREX™ 20” Heavy-Duty Whole House Water Filtration System",
      "Description": "..."
    }
  ]
}
```

- Each bundle becomes a single Shopify product, with description composed from the bundle description plus each included product's narrative.
- Pricing info is taken from the bundle record when present; otherwise it falls back to the sum of the included products' values.
- Metafields `custom.included_products` and `custom.bundle_product_ids` document the bundle composition.
- Bundles inherit collections from both the bundle record and its constituent products.

## Standard product payload

Send a `POST` request with a JSON body that is an array of product objects. Each object should follow the shape illustrated below (fields not required by Shopify may be omitted):

```json
[
  {
    "id": "rec00bn8NBs99R6Fh",
    "createdTime": "2024-10-05T16:05:28.000Z",
    "Product Name": "0-200 PSI Pressure Gauge",
    "Product ID": 43,
    "Image": [
      {
        "id": "attSEjSjluVCuLite",
        "width": 1200,
        "height": 1200,
        "url": "https://v5.airtableusercontent.com/v3/u/45/45/1759075200000/UPvgUfrg52NzGkLr4RbwLw/9T22R3DTNK4jdcs55DryCV3MPv8f7QpxGu6K6t-djprSbX3UxEGFESZiscbJhR8hOsPLL6oc2fmxNtkqIUBwpTBeBYYCvscERCvTxl-uPw1hIUDCDuN94Ltla7znUdQ6UhuQ7A6BOCqgajLJvYb4u-8AsXWlt8nZIw2Eq4CvBr4/dhRvC0sozIDKOMoLYG9B6TzHFhQhUA75DjJa1LtQo_Y",
        "filename": "61dOKN5bHgL._SL1200_.jpg",
        "size": 82669,
        "type": "image/jpeg",
        "thumbnails": {
          "small": {
            "url": "https://v5.airtableusercontent.com/v3/u/45/45/1759075200000/JvKPhifS-CuGACkOCiZP3A/H89PVBj9XG3HMSr4U1-QIFSWpbgj3EOZVx2zwO3Jtvopgm0k7Ql-Q1Xea_KKtVwYjSMDl_EYg8RODe4lMeuWOjFDcLlKSxZD_XciVzXMWlm_Xvt6MBI_TI-j47qjDWMorjhHEVGfDGkczcrKrtIzxA/P3hgBWU_cR2sGrfrXk0z3XuiNYNSJG-z7Pqu0tTCZEY",
            "width": 36,
            "height": 36
          },
          "large": {
            "url": "https://v5.airtableusercontent.com/v3/u/45/45/1759075200000/hP5uhiNRvK16EToDZekPyA/keymdaeeZv_bqnjjw9FVsyhSjsNoD-B22umfCvmZVHyjkbMTeyjpPHr9Bd4BWCuw0zpHuhQCjSWaA3JNst43PW3aQ3r49pkRWdHk0lAUFZZdyY4HXDUlUEC9C8LAqyTSVclAXTWLx4mPOL1vpFAarg/hC2YHkKrS3f5PXzjjggaSeZRsvfM4pEBUUULtH9aORU",
            "width": 512,
            "height": 512
          },
          "full": {
            "url": "https://v5.airtableusercontent.com/v3/u/45/45/1759075200000/dTVQ0N6Ak_6ki9y4v9AR3Q/7vy_Kf8wOMlN3XJ5XHGXbadmYAxDRrlO0ohsTGW3k_-uFrFAYku1jLvbd0DSAuICkp2t2SzYlcaMxRKlXtaCfUgaUHdn__flNDYdqBjtQ11LRd1kEmV3MkY3NXCGWpi8F5etC8iJninHnrsE-0k73w/P3alCVM-r5KOwDD7snaBI7pIQbRgz5nE-AfHkVbrQjI",
            "width": 1200,
            "height": 1200
          }
        }
      }
    ],
    "Category": "Parts",
    "Vendor": "Amazon",
    "Client Price": 89,
    "Vendor Price": 50,
    "Gross Profit": 39,
    "Line Items": [
      "recr3idBRqSfneeMc",
      "rectPJH2IVpJgfNUV"
    ],
    "Website Price No Shipping": 89,
    "Shipping Price": 0,
    "Website Retail Price": 49,
    "Web Net Profit": -1,
    "SKU": "02P-0121",
    "Key Product Features": "Plumbing or monitoring accessory for installs",
    "Problems solved (keywords)": "leaks, low-pressure, poor-monitoring",
    "Sell on Website": true,
    "True Web Cost": 50,
    "MSRP": 59,
    "Contaminants removed": [
      "N/A"
    ],
    "Brand": "AQUALIVIA",
    "Shopify Product Id": "gid://shopify/Product/9071322562799"
  }
]
```

Any additional attributes (occupants, tank size, contaminants, etc.) are mapped to Shopify metafields when present.

## Required environment variables

| Variable | Description |
| -------- | ----------- |
| `SHOPIFY_STORE_DOMAIN` | Shopify store domain, e.g. `my-store.myshopify.com` |
| `SHOPIFY_ADMIN_ACCESS_TOKEN` | Admin API access token with write_product permissions |
| `SHOPIFY_ADMIN_API_VERSION` | (Optional) Shopify Admin API version, defaults to `2024-07` |

## Running locally

Install dependencies and launch the emulator via the Functions Framework:

```bash
npm install
npm run start
```

Then invoke the function with any HTTP client:

```bash
curl --location \
  --header "Content-Type: application/json" \
  --data @sample.json \
  http://localhost:8080
```

## Deploying to Google Cloud Functions

```bash
gcloud functions deploy shopifyProductSync \
  --entry-point shopifyProductSync \
  --runtime nodejs18 \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars SHOPIFY_STORE_DOMAIN=your-store.myshopify.com,SHOPIFY_ADMIN_ACCESS_TOKEN=***
```

Adjust authentication and environment variables to match your deployment environment.

## Response payload

The function responds with a summary describing the outcome for each product, including Shopify product ID, created variant IDs, and collection attachment results. Errors are reported per product without interrupting the processing of subsequent products.
