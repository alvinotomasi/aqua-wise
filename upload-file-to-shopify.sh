#!/bin/bash

# Simple Shopify File Upload Script
# Usage: ./upload-file-to-shopify.sh <file-url>

set -e

# Load environment variables
source .env 2>/dev/null || true

SHOPIFY_DOMAIN="${SHOPIFY_STORE_DOMAIN}"
SHOPIFY_TOKEN="${SHOPIFY_ADMIN_ACCESS_TOKEN}"
API_VERSION="2024-07"

if [ -z "$SHOPIFY_DOMAIN" ] || [ -z "$SHOPIFY_TOKEN" ]; then
  echo "Error: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must be set"
  exit 1
fi

FILE_URL="${1:-}"
if [ -z "$FILE_URL" ]; then
  echo "Usage: $0 <file-url>"
  echo "Example: $0 https://example.com/document.pdf"
  exit 1
fi

echo "Uploading file to Shopify..."
echo "URL: $FILE_URL"
echo ""

# Create the GraphQL request
curl -X POST \
  "https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" \
  -d @- << EOF | jq .
{
  "query": "mutation fileCreate(\$files: [FileCreateInput!]!) { fileCreate(files: \$files) { files { id alt createdAt } userErrors { field message } } }",
  "variables": {
    "files": [
      {
        "originalSource": "${FILE_URL}",
        "contentType": "FILE"
      }
    ]
  }
}
EOF

echo ""
echo "✓ Upload request sent"
echo "Note: File will process asynchronously. Check status with the returned file ID."
