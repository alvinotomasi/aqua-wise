#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { shopifyProductSync } = require('./index.js');

// Mock request and response objects
const mockReq = {
  method: 'POST',
  body: require('./test/sample-product.json'),
};

const mockRes = {
  statusCode: null,
  responseData: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(data) {
    this.responseData = data;
    console.log('\n=== RESPONSE STATUS ===');
    console.log(`Status Code: ${this.statusCode}`);
    console.log('\n=== RESPONSE DATA ===');
    console.log(JSON.stringify(data, null, 2));
    return this;
  },
};

console.log('=== STARTING PRODUCT SYNC TEST ===\n');
console.log('Environment Check:');
console.log(`- SHOPIFY_STORE_DOMAIN: ${process.env.SHOPIFY_STORE_DOMAIN ? '✓ Set' : '✗ Missing'}`);
console.log(`- SHOPIFY_ADMIN_ACCESS_TOKEN: ${process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log(`- SHOPIFY_STOREFRONT_DOMAIN: ${process.env.SHOPIFY_STOREFRONT_DOMAIN || '(using default)'}`);
console.log('\n=== PROCESSING SAMPLE PRODUCT ===\n');

// Run the sync
shopifyProductSync(mockReq, mockRes)
  .then(() => {
    console.log('\n=== TEST COMPLETED ===');
    
    if (mockRes.statusCode === 200) {
      console.log('✓ Success!');
      
      const results = mockRes.responseData?.results || [];
      results.forEach((result, index) => {
        console.log(`\n--- Product ${index + 1} ---`);
        console.log(`Status: ${result.status}`);
        console.log(`Operation: ${result.operation || 'N/A'}`);
        console.log(`Product ID: ${result.productId || 'N/A'}`);
        console.log(`Product URL: ${result.productUrl || 'N/A'}`);
        
        if (result.documentation) {
          console.log('\nDocumentation Files:');
          console.log(`- File IDs: ${result.documentation.fileIds?.length || 0} files`);
          result.documentation.fileIds?.forEach((fileId, i) => {
            console.log(`  ${i + 1}. ${fileId}`);
          });
          
          if (result.documentation.errors?.length > 0) {
            console.log('\nDocumentation Errors:');
            result.documentation.errors.forEach((err) => {
              console.log(`  ✗ ${err.url}: ${err.message}`);
            });
          }
          
          if (result.documentation.skipped?.length > 0) {
            console.log('\nDocumentation Skipped:');
            result.documentation.skipped.forEach((skip) => {
              console.log(`  - ${skip.url}: ${skip.reason}`);
            });
          }
        }
        
        if (result.error) {
          console.log(`\n✗ Error: ${result.error}`);
        }
      });
    } else {
      console.log(`✗ Failed with status ${mockRes.statusCode}`);
      console.log(`Error: ${mockRes.responseData?.error || 'Unknown error'}`);
    }
    
    process.exit(mockRes.statusCode === 200 ? 0 : 1);
  })
  .catch((error) => {
    console.error('\n=== TEST FAILED ===');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    process.exit(1);
  });
