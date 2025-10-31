#!/usr/bin/env node
'use strict';

require('dotenv').config();

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GRAPHQL_URL = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`;

const FILE_QUERY = `
query getFile($id: ID!) {
  node(id: $id) {
    ... on GenericFile {
      id
      url
      mimeType
      originalFileSize
      alt
      createdAt
      updatedAt
      fileStatus
      ... on Node {
        id
      }
    }
    ... on MediaImage {
      id
      image {
        url
      }
      mimeType
      alt
      fileStatus
    }
  }
}
`;

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
    const text = await response.text();
    throw new Error(`Shopify request failed with status ${response.status}: ${text}`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload;
}

async function verifyFile(fileId) {
  console.log(`\n=== Verifying File: ${fileId} ===\n`);
  
  const response = await callShopify(FILE_QUERY, { id: fileId });
  const file = response.data?.node;
  
  if (!file) {
    console.log('✗ File not found');
    return;
  }
  
  console.log('✓ File found in Shopify');
  console.log('\nFile Details:');
  console.log(`- ID: ${file.id}`);
  console.log(`- Status: ${file.fileStatus || 'N/A'}`);
  console.log(`- URL: ${file.url || file.image?.url || 'N/A'}`);
  console.log(`- MIME Type: ${file.mimeType || 'N/A'}`);
  console.log(`- File Size: ${file.originalFileSize ? `${(file.originalFileSize / 1024).toFixed(2)} KB` : 'N/A'}`);
  console.log(`- Alt Text: ${file.alt || 'N/A'}`);
  console.log(`- Created: ${file.createdAt || 'N/A'}`);
  console.log(`- Updated: ${file.updatedAt || 'N/A'}`);
  
  if (file.fileStatus === 'PROCESSING' || file.fileStatus === 'UPLOADED') {
    console.log('\n⏳ File is still being processed by Shopify. Please wait and try again in a few moments.');
  }
  
  const downloadUrl = file.url || file.image?.url;
  if (downloadUrl) {
    console.log('\n=== Testing File Download ===');
    try {
      const downloadResponse = await fetch(downloadUrl);
      console.log(`- Status: ${downloadResponse.status} ${downloadResponse.statusText}`);
      console.log(`- Content-Type: ${downloadResponse.headers.get('content-type')}`);
      console.log(`- Content-Length: ${downloadResponse.headers.get('content-length')} bytes`);
      
      if (downloadResponse.ok) {
        const buffer = await downloadResponse.arrayBuffer();
        console.log(`- Downloaded: ${buffer.byteLength} bytes`);
        
        // Check file signature
        const bytes = new Uint8Array(buffer);
        const signature = Array.from(bytes.slice(0, 4))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        console.log(`- File Signature: ${signature}`);
        
        // Detect file type from signature
        if (signature.startsWith('25 50 44 46')) {
          console.log('✓ File is a valid PDF (signature: %PDF)');
        } else if (signature.startsWith('89 50 4e 47')) {
          console.log('✓ File is a valid PNG');
        } else if (signature.startsWith('ff d8 ff')) {
          console.log('✓ File is a valid JPEG');
        } else if (signature.startsWith('50 4b 03 04') || signature.startsWith('50 4b 05 06')) {
          console.log('✓ File is a valid ZIP/Office document');
        } else {
          console.log(`⚠ Unknown file type (signature: ${signature})`);
        }
      } else {
        console.log('✗ Download failed');
      }
    } catch (error) {
      console.log(`✗ Download error: ${error.message}`);
    }
  }
}

// Get file ID from command line or use the one from the test
const fileId = process.argv[2] || 'gid://shopify/GenericFile/37279916556527';

verifyFile(fileId)
  .then(() => {
    console.log('\n=== Verification Complete ===\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n=== Verification Failed ===');
    console.error('Error:', error.message);
    process.exit(1);
  });
