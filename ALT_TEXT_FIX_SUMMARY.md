# Product Documentation Alt Text Fix

## Problem
When uploading product documentation files to Shopify, the `alt` attribute was empty. This affects accessibility and makes it harder to identify files in the Shopify admin.

## Root Cause
The code had two upload paths:
1. **Direct URL upload** - Had partial alt text support (only from `documentEntry.description`)
2. **Staged upload** - Had NO alt text support at all

Since Airtable attachments don't have a `description` field, the alt text was always empty.

## Solution
Updated both upload paths to use a fallback chain for alt text:
1. First try `documentEntry.description` (if provided)
2. Fall back to `documentEntry.filename` (from Airtable)
3. Fall back to the derived `filename` (for staged uploads)

This ensures every uploaded file has meaningful alt text, typically the filename like:
- `"Katalox Light® Advanced Filtration Media for Iron, Manganese and Hydrogen Sulfide Removal.pdf"`

## Changes Made

### File: `index.js`

#### 1. Staged Upload Path (lines ~1057-1073)
**Before:**
```javascript
const fileCreateResponse = await callShopify(
  FILE_CREATE_MUTATION,
  {
    files: [{
      originalSource: stagedTarget.resourceUrl,
      contentType: 'FILE',
      filename,
    }],
  },
  'fileCreate'
);
```

**After:**
```javascript
const fileInput = {
  originalSource: stagedTarget.resourceUrl,
  contentType: 'FILE',
  filename,
};

// Set alt text from description or fallback to filename
if (documentEntry && typeof documentEntry === 'object') {
  const alt = documentEntry.description || documentEntry.filename || filename;
  if (alt) {
    fileInput.alt = String(alt).trim();
  }
} else if (filename) {
  fileInput.alt = filename;
}

const fileCreateResponse = await callShopify(
  FILE_CREATE_MUTATION,
  {
    files: [fileInput],
  },
  'fileCreate'
);
```

#### 2. Direct URL Upload Path (lines ~1187-1195)
**Before:**
```javascript
if (documentEntry && typeof documentEntry === 'object' && documentEntry.description) {
  const alt = String(documentEntry.description).trim();
  if (alt) {
    fileInput.alt = alt;
  }
}
```

**After:**
```javascript
// Set alt text from description or fallback to filename
if (documentEntry && typeof documentEntry === 'object') {
  const alt = documentEntry.description || documentEntry.filename || fileInput.filename;
  if (alt) {
    fileInput.alt = String(alt).trim();
  }
} else if (fileInput.filename) {
  fileInput.alt = fileInput.filename;
}
```

#### 3. Enhanced Logging (line ~1098)
Added alt text to success log:
```javascript
console.log('✓ Staged upload successful with proper Content-Type', {
  fileId: createdFile.id,
  filename,
  mimeType,
  alt: fileInput.alt || '(none)',
});
```

## Benefits
1. **Accessibility** - Screen readers can now identify documentation files
2. **Admin UX** - Files are easier to identify in Shopify admin
3. **Consistency** - All files now have alt text, regardless of upload path
4. **Meaningful defaults** - Filename is a sensible fallback when no description exists

## Testing
To test with your product data:
```bash
node test-product-sync.js
```

Look for the log output showing alt text:
```
✓ Staged upload successful with proper Content-Type {
  fileId: 'gid://shopify/GenericFile/...',
  filename: 'Product Manual.pdf',
  mimeType: 'application/pdf',
  alt: 'Product Manual.pdf'
}
```

## Future Enhancement
If you want to provide custom descriptions for documentation files, you can add a `description` field to your Airtable attachment records, and it will be used as the alt text instead of the filename.
