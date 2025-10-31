#!/bin/bash

# Shopify File Upload Example using GraphQL Admin API
# This shows how to upload a file from a URL to Shopify

# Configuration
SHOPIFY_DOMAIN="${SHOPIFY_STORE_DOMAIN}"
SHOPIFY_TOKEN="${SHOPIFY_ADMIN_ACCESS_TOKEN}"
API_VERSION="2024-07"

# File to upload
FILE_URL="https://v5.airtableusercontent.com/v3/u/46/46/1761926400000/3F2pGQPLOsNf1QQIbJuL3Q/c06Z2RCd8FYAV2Nc5Mn_0S8f1SCjo5CTXw6Lbb_h42eUCCD0ChOht0JG6v9Awueggeq2CDOTm4DsoeaKm68GvO3eFYlASA-GxY-J61Up-PtccsMvhPJUSPHVXKYmZsn0dCvui5wywklq8rTVeemzOmwRtSh57FWbQrjmU0UDbXU/enqTzqbjCfypCTghZwL8IMjz-WvtzWDz1nDXFHABX_I"

# GraphQL mutation
MUTATION='mutation fileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id
      alt
      createdAt
    }
    userErrors {
      field
      message
    }
  }
}'

# Variables (without filename for Airtable URLs)
VARIABLES='{
  "files": [
    {
      "originalSource": "'"${FILE_URL}"'",
      "contentType": "FILE"
    }
  ]
}'

# Make the request
curl -X POST \
  "https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" \
  -d '{
    "query": "'"$(echo $MUTATION | tr '\n' ' ')"'",
    "variables": '"${VARIABLES}"'
  }' | jq .

echo ""
echo "Note: File will be served as application/octet-stream but downloads correctly"
