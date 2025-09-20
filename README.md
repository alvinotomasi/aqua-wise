# Aqua Wise Shopify Sync Cloud Function

This repository contains a Google Cloud Function that receives an array of product objects and synchronises them with Shopify by performing the following actions for each item:

- Create a Shopify product with metafields and media
- Replace the default variant with a configured variant (price, compare-at price, SKU, option value)
- Look up collections by title and add the newly created product to each matching collection

## Function entry point

The HTTP function exported from `index.js` is named `shopifyProductSync`. Deploy it as an HTTP-triggered Google Cloud Function.

## Expected request payload

Send a `POST` request with a JSON body that is an array of product objects. Each object should follow the shape illustrated below (fields not required by Shopify may be omitted):

```json
[
  {
    "id": "rec511KckPYF0RCRx",
    "Product Name": "EVOSOFT™ City 96K Grains Water Softener - WS1.5-1.5in",
    "Description": "The EVOSOFT™ 96K takes home water treatment to the next level...",
    "Vendor": "Charger",
    "Category": "Water Softener",
    "SKU": "AE9-0022",
    "Website Retail Price": 3357,
    "MSRP": 4028,
    "Option 1 Name": "Size",
    "Option 1 Value": "96,000 Grains",
    "Collection": ["City Water Systems", "Water Softeners"],
    "Image": [
      {
        "url": "https://example.com/image.jpg",
        "thumbnails": {
          "large": { "url": "https://example.com/image_512.jpg" }
        }
      }
    ]
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
