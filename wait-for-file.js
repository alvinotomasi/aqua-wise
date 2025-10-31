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
      fileErrors {
        code
        details
        message
      }
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

async function waitForFile(fileId, maxAttempts = 20, intervalSeconds = 3) {
  console.log(`Waiting for file to be ready: ${fileId}`);
  console.log(`Will check every ${intervalSeconds} seconds (max ${maxAttempts} attempts)\n`);
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    process.stdout.write(`Attempt ${attempt}/${maxAttempts}... `);
    
    const response = await callShopify(FILE_QUERY, { id: fileId });
    const file = response.data?.node;
    
    if (!file) {
      console.log('✗ File not found');
      return null;
    }
    
    const status = file.fileStatus || 'UNKNOWN';
    console.log(`Status: ${status}`);
    
    if (status === 'READY') {
      console.log('\n✓ File is ready!\n');
      console.log('File Details:');
      console.log(`- URL: ${file.url || 'N/A'}`);
      console.log(`- MIME Type: ${file.mimeType || 'N/A'}`);
      console.log(`- File Size: ${file.originalFileSize ? `${(file.originalFileSize / 1024).toFixed(2)} KB` : 'N/A'}`);
      return file;
    }
    
    if (status === 'FAILED') {
      console.log('\n✗ File processing failed');
      if (file.fileErrors && file.fileErrors.length > 0) {
        console.log('\nErrors:');
        file.fileErrors.forEach((error, i) => {
          console.log(`${i + 1}. ${error.message || error.code}`);
          if (error.details) {
            console.log(`   Details: ${error.details}`);
          }
        });
      }
      return null;
    }
    
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
    }
  }
  
  console.log('\n⏱ Timeout: File is still processing after maximum attempts');
  return null;
}

const fileId = process.argv[2] || 'gid://shopify/GenericFile/37279916556527';

waitForFile(fileId)
  .then((file) => {
    if (file && file.url) {
      console.log('\nYou can now download the file from:');
      console.log(file.url);
    }
    process.exit(file ? 0 : 1);
  })
  .catch((error) => {
    console.error('\nError:', error.message);
    process.exit(1);
  });
