# Product Documentation File Upload Fix

## Problem
Product documentation files uploaded to Shopify from Airtable attachments were being created without proper file extensions, making them unable to be opened when downloaded.

## Root Cause
The issue was caused by a mismatch between the filename extension provided to Shopify and the actual URL structure:

1. **Airtable URLs don't have file extensions** in their paths (e.g., `/v3/u/46/46/1761415200000/...`)
2. **Shopify validates** that the filename extension matches the URL's extension
3. When we provided a filename like `document.pdf` but the URL had no `.pdf` extension, Shopify rejected it with: `"Provided filename extension must match original source"`

## Solution
The fix removes the filename parameter for Airtable URLs without extensions, allowing Shopify to:
1. Fetch the file from the Airtable URL
2. Automatically detect the file type from the actual file content
3. Set the correct MIME type and extension

### Code Changes (index.js)
```javascript
// OLD CODE - Always tried to set a filename with extension
fileInput.filename = `${baseFilename}${ext}`;

// NEW CODE - Only set filename if URL has an extension
const urlHasExtension = /\.[A-Za-z0-9]{2,6}(\?|$)/.test(urlPath);

if (urlHasExtension) {
  // URL has extension - use it
  fileInput.filename = `${baseFilename}${ext}`;
} else {
  // Airtable URL - let Shopify auto-detect
  // Don't set filename at all
}
```

## How It Works Now

### For Airtable Attachments (no URL extension):
1. Code detects URL has no file extension
2. Filename is NOT provided to Shopify
3. Shopify fetches the file from Airtable
4. Shopify detects file type from content (e.g., PDF signature `%PDF`)
5. Shopify stores file with correct MIME type and extension

### For Direct URLs (with extension):
1. Code detects URL has file extension (e.g., `.pdf`)
2. Filename is extracted from URL and provided to Shopify
3. Shopify validates extension matches
4. File is stored with provided filename

## Testing

### Run the Test Script
```bash
node test-product-sync.js
```

This will:
- Upload the sample product from `test/sample-product.json`
- Create the product documentation file in Shopify
- Show the file ID in the response

### Verify File Upload
```bash
node verify-file.js [FILE_ID]
```

This will:
- Query Shopify for the file details
- Show file status (PROCESSING, READY, FAILED)
- Display MIME type, file size, and download URL
- Test downloading the file
- Verify file signature (PDF, PNG, JPEG, etc.)

**Note:** Files may take 10-30 seconds to process after upload. Status will show `PROCESSING` until complete.

## Expected Results

### Successful Upload Log:
```
Airtable URL without extension - Shopify will auto-detect file type {
  url: 'https://v5.airtableusercontent.com/...',
  originalFilename: 'Katalox Light® Advanced Filtration Media.pdf',
  note: 'Shopify will fetch the file and set the correct extension automatically'
}
Calling Shopify GraphQL { requestLabel: 'fileCreate', ... }
Shopify GraphQL response { requestLabel: 'fileCreate', status: 200, ok: true }
```

### File Verification (after processing):
```
✓ File found in Shopify
- Status: READY
- URL: https://cdn.shopify.com/...
- MIME Type: application/pdf
- File Size: 7720.25 KB
- File Signature: 25 50 44 46
✓ File is a valid PDF (signature: %PDF)
```

## Key Points

1. **Airtable URLs are special** - they don't have file extensions in the path, but the actual file content has the correct type
2. **Shopify is smart** - it can detect file types from content when no filename is provided
3. **Don't force extensions** - let Shopify handle detection for URLs without extensions
4. **Processing takes time** - files show `PROCESSING` status for 10-30 seconds after upload

## Files Modified
- `index.js` - Fixed `ensureShopifyFileReference()` function
- `test-product-sync.js` - New test script for automated testing
- `verify-file.js` - New verification script to check file upload success

## Testing with Your Data
To test with your own Airtable data:
1. Ensure your Airtable attachment has `filename` and `type` fields
2. Run the sync with your product data
3. Check the logs for "Shopify will auto-detect file type"
4. Wait 30 seconds for processing
5. Verify the file can be downloaded and opened

## Important: Airtable URL Expiration

**Airtable attachment URLs are time-limited and expire after a few hours.** This is normal Airtable behavior for security.

### What This Means:
- URLs in test data (`test/sample-product.json`) will expire
- Fresh data from Airtable API will have valid URLs
- Shopify must fetch the file while the URL is still valid

### Solution:
When syncing products, ensure you're using **fresh data directly from Airtable**, not cached or old test data. The URLs must be valid at the time of sync.

## Troubleshooting

### File shows FAILED status with "Expired Resource" (HTTP 410)
**Cause:** Airtable URL has expired (this is normal after a few hours)

**Solution:**
- Fetch fresh product data from Airtable
- Sync immediately after fetching
- Don't use cached or old test data

### File shows FAILED status (other reasons)
- Check if Airtable URL is accessible
- Verify the URL returns a valid file
- Check Shopify logs for specific error messages
- Use `wait-for-file.js` to see detailed error messages

### File has wrong type
- Ensure Airtable attachment has correct `type` field
- Verify the actual file content matches the type
- Check file signature with verify script

### File can't be downloaded
- Wait longer - processing can take up to 60 seconds for large files
- Check if file status is READY (use `wait-for-file.js`)
- Verify URL is not expired or restricted
