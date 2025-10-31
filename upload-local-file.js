#!/usr/bin/env node
'use strict';

/**
 * Upload a local file to Shopify using Staged Uploads
 * This gives you proper Content-Type headers!
 * 
 * Usage: node upload-local-file.js <file-path>
 * Example: node upload-local-file.js ./documents/manual.pdf
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GRAPHQL_URL = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
  console.error('Error: SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN must be set');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath || !fs.existsSync(filePath)) {
  console.error('Usage: node upload-local-file.js <file-path>');
  console.error('Example: node upload-local-file.js ./document.pdf');
  process.exit(1);
}

async function callShopify(query, variables) {
  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Shopify request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(data.errors)}`);
  }

  return data;
}

async function uploadLocalFile(filePath) {
  const filename = path.basename(filePath);
  const fileBuffer = fs.readFileSync(filePath);
  const fileSize = fileBuffer.length;
  
  // Detect MIME type
  let mimeType = 'application/octet-stream';
  if (filename.endsWith('.pdf')) mimeType = 'application/pdf';
  else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
  else if (filename.endsWith('.png')) mimeType = 'image/png';
  else if (filename.endsWith('.gif')) mimeType = 'image/gif';
  else if (filename.endsWith('.webp')) mimeType = 'image/webp';
  else if (filename.endsWith('.svg')) mimeType = 'image/svg+xml';

  console.log('Uploading local file to Shopify...');
  console.log(`File: ${filePath}`);
  console.log(`Name: ${filename}`);
  console.log(`Size: ${(fileSize / 1024).toFixed(2)} KB`);
  console.log(`Type: ${mimeType}`);
  console.log('');

  // Step 1: Request staged upload URL
  console.log('Step 1: Requesting staged upload URL...');
  const stagedQuery = `
    mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets {
          url
          resourceUrl
          parameters {
            name
            value
          }
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const stagedResponse = await callShopify(stagedQuery, {
    input: [{
      resource: 'FILE',
      filename,
      mimeType,
      httpMethod: 'POST',
      fileSize: fileSize.toString(),
    }],
  });

  const stagedTarget = stagedResponse.data.stagedUploadsCreate.stagedTargets[0];
  if (!stagedTarget) {
    throw new Error('Failed to get staged upload URL');
  }

  console.log('✓ Got staged upload URL');
  console.log('');

  // Step 2: Upload file to staged URL
  console.log('Step 2: Uploading file to staged URL...');
  
  const formData = new FormData();
  
  // Add parameters from Shopify
  stagedTarget.parameters.forEach(param => {
    formData.append(param.name, param.value);
  });
  
  // Add the file
  const blob = new Blob([fileBuffer], { type: mimeType });
  formData.append('file', blob, filename);

  const uploadResponse = await fetch(stagedTarget.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status}`);
  }

  console.log('✓ File uploaded to staging');
  console.log('');

  // Step 3: Create file reference in Shopify
  console.log('Step 3: Creating file reference in Shopify...');
  const fileCreateQuery = `
    mutation fileCreate($files: [FileCreateInput!]!) {
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
    }
  `;

  const fileResponse = await callShopify(fileCreateQuery, {
    files: [{
      originalSource: stagedTarget.resourceUrl,
      contentType: 'FILE',
      filename,
    }],
  });

  const file = fileResponse.data.fileCreate.files[0];
  if (!file) {
    const errors = fileResponse.data.fileCreate.userErrors;
    throw new Error(`Failed to create file: ${JSON.stringify(errors)}`);
  }

  console.log('✓ File created in Shopify');
  console.log('');
  console.log(`File ID: ${file.id}`);
  console.log('');

  // Step 4: Wait and check status
  console.log('Waiting for file to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  const statusQuery = `
    query getFile($id: ID!) {
      node(id: $id) {
        ... on GenericFile {
          id
          url
          mimeType
          fileStatus
        }
      }
    }
  `;

  const statusResponse = await callShopify(statusQuery, { id: file.id });
  const fileStatus = statusResponse.data.node;

  console.log(`Status: ${fileStatus.fileStatus}`);
  console.log(`MIME Type: ${fileStatus.mimeType}`);
  console.log(`URL: ${fileStatus.url || 'Processing...'}`);
  console.log('');
  console.log('✓ Upload complete!');

  return fileStatus;
}

uploadLocalFile(filePath)
  .then(() => process.exit(0))
  .catch(error => {
    console.error('✗ Upload failed:', error.message);
    process.exit(1);
  });
