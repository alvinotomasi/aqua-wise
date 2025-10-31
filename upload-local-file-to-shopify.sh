#!/bin/bash

# Upload a LOCAL file to Shopify using Staged Uploads
# Usage: ./upload-local-file-to-shopify.sh <local-file-path>

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

LOCAL_FILE="${1:-}"
if [ -z "$LOCAL_FILE" ] || [ ! -f "$LOCAL_FILE" ]; then
  echo "Usage: $0 <local-file-path>"
  echo "Example: $0 /path/to/document.pdf"
  exit 1
fi

FILENAME=$(basename "$LOCAL_FILE")
FILESIZE=$(stat -f%z "$LOCAL_FILE" 2>/dev/null || stat -c%s "$LOCAL_FILE" 2>/dev/null)
MIMETYPE=$(file -b --mime-type "$LOCAL_FILE")

echo "Uploading local file to Shopify..."
echo "File: $LOCAL_FILE"
echo "Name: $FILENAME"
echo "Size: $FILESIZE bytes"
echo "Type: $MIMETYPE"
echo ""

# Step 1: Request a staged upload URL
echo "Step 1: Requesting staged upload URL..."
STAGED_RESPONSE=$(curl -s -X POST \
  "https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" \
  -d @- << EOF
{
  "query": "mutation stagedUploadsCreate(\$input: [StagedUploadInput!]!) { stagedUploadsCreate(input: \$input) { stagedTargets { url resourceUrl parameters { name value } } userErrors { field message } } }",
  "variables": {
    "input": [
      {
        "resource": "FILE",
        "filename": "${FILENAME}",
        "mimeType": "${MIMETYPE}",
        "httpMethod": "POST",
        "fileSize": "${FILESIZE}"
      }
    ]
  }
}
EOF
)

# Extract upload URL and parameters
UPLOAD_URL=$(echo "$STAGED_RESPONSE" | jq -r '.data.stagedUploadsCreate.stagedTargets[0].url')
RESOURCE_URL=$(echo "$STAGED_RESPONSE" | jq -r '.data.stagedUploadsCreate.stagedTargets[0].resourceUrl')
PARAMETERS=$(echo "$STAGED_RESPONSE" | jq -r '.data.stagedUploadsCreate.stagedTargets[0].parameters')

if [ "$UPLOAD_URL" = "null" ] || [ -z "$UPLOAD_URL" ]; then
  echo "✗ Failed to get staged upload URL"
  echo "$STAGED_RESPONSE" | jq '.data.stagedUploadsCreate.userErrors'
  exit 1
fi

echo "✓ Got staged upload URL"
echo ""

# Step 2: Upload the file to the staged URL
echo "Step 2: Uploading file to staged URL..."

# Build form data from parameters
FORM_DATA=""
while IFS= read -r param; do
  NAME=$(echo "$param" | jq -r '.name')
  VALUE=$(echo "$param" | jq -r '.value')
  FORM_DATA="$FORM_DATA -F ${NAME}=${VALUE}"
done < <(echo "$PARAMETERS" | jq -c '.[]')

# Upload file
UPLOAD_RESPONSE=$(curl -s -w "\n%{http_code}" \
  $FORM_DATA \
  -F "file=@${LOCAL_FILE}" \
  "$UPLOAD_URL")

HTTP_CODE=$(echo "$UPLOAD_RESPONSE" | tail -n1)

if [ "$HTTP_CODE" != "201" ] && [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "204" ]; then
  echo "✗ Upload failed with HTTP $HTTP_CODE"
  echo "$UPLOAD_RESPONSE"
  exit 1
fi

echo "✓ File uploaded to staging"
echo ""

# Step 3: Create the file reference in Shopify
echo "Step 3: Creating file reference in Shopify..."
FILE_RESPONSE=$(curl -s -X POST \
  "https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" \
  -d @- << EOF
{
  "query": "mutation fileCreate(\$files: [FileCreateInput!]!) { fileCreate(files: \$files) { files { id alt createdAt } userErrors { field message } } }",
  "variables": {
    "files": [
      {
        "originalSource": "${RESOURCE_URL}",
        "contentType": "FILE",
        "filename": "${FILENAME}"
      }
    ]
  }
}
EOF
)

FILE_ID=$(echo "$FILE_RESPONSE" | jq -r '.data.fileCreate.files[0].id')

if [ "$FILE_ID" = "null" ] || [ -z "$FILE_ID" ]; then
  echo "✗ Failed to create file reference"
  echo "$FILE_RESPONSE" | jq '.data.fileCreate.userErrors'
  exit 1
fi

echo "✓ File created in Shopify"
echo ""
echo "File ID: $FILE_ID"
echo ""
echo "Waiting for file to process..."
sleep 3

# Step 4: Check file status
STATUS_RESPONSE=$(curl -s -X POST \
  "https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json" \
  -H "Content-Type: application/json" \
  -H "X-Shopify-Access-Token: ${SHOPIFY_TOKEN}" \
  -d @- << EOF
{
  "query": "query getFile(\$id: ID!) { node(id: \$id) { ... on GenericFile { id url mimeType fileStatus } } }",
  "variables": {
    "id": "${FILE_ID}"
  }
}
EOF
)

FILE_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.node.fileStatus')
FILE_URL=$(echo "$STATUS_RESPONSE" | jq -r '.data.node.url')
FILE_MIME=$(echo "$STATUS_RESPONSE" | jq -r '.data.node.mimeType')

echo "Status: $FILE_STATUS"
echo "MIME Type: $FILE_MIME"
echo "URL: $FILE_URL"
echo ""
echo "✓ Upload complete!"
