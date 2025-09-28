'use strict';

const { helpers } = require('../../index');

const {
  normaliseArray,
  createProduct,
  createVariant,
  attachCollections,
  publishProduct,
  buildVariantInput,
  asSingleLineValue,
} = helpers;

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean).map((item) => String(item).trim()).filter(Boolean)));
}

function mapIncludedProducts(bundle, productLookup) {
  const referencedIds = ensureArray(bundle.Products);
  const included = [];
  const missing = [];

  for (const recordId of referencedIds) {
    const product = productLookup.get(recordId);
    if (product) {
      included.push(product);
    } else {
      missing.push(recordId);
    }
  }

  return { included, missing, referencedIds };
}

function sumNumericField(records, field) {
  return records.reduce((total, record) => {
    const value = record?.[field];
    if (value === undefined || value === null || value === '') {
      return total;
    }
    const number = Number(value);
    if (Number.isNaN(number)) {
      return total;
    }
    return total + number;
  }, 0);
}

function composeBundleDescription(bundle, includedProducts) {
  const segments = [];

  if (bundle.Description) {
    segments.push(String(bundle.Description).trim());
  }

  for (const product of includedProducts) {
    const name = asSingleLineValue(product['Product Name'] || product.Name || product.id) || 'Unnamed product';
    const description = String(product.Description || product['Product Description'] || '').trim();
    if (description) {
      segments.push(`${name}: ${description}`);
    } else {
      segments.push(name);
    }
  }

  if (!segments.length) {
    return 'Bundle description not available.';
  }

  return segments.join('\n\n');
}

function resolveBundleSku(bundle) {
  if (bundle.SKU) {
    return String(bundle.SKU).trim();
  }
  if (bundle['Product ID']) {
    return `BUNDLE-${bundle['Product ID']}`;
  }
  if (bundle.id) {
    return `BUNDLE-${bundle.id}`;
  }
  return undefined;
}

function buildIncludedProductNames(includedProducts) {
  return includedProducts
    .map((product) => asSingleLineValue(product['Product Name'] || product.Name || product.id))
    .filter(Boolean);
}

function buildIncludedProductIdentifiers(includedProducts) {
  return includedProducts
    .map((product) => product['Shopify Product Id'] || product['Product ID'] || product.id)
    .filter(Boolean)
    .map((value) => String(value));
}

function mergeCollections(bundle, includedProducts) {
  const bundleCollections = normaliseArray(bundle.Collection);
  const productCollections = includedProducts.flatMap((product) => normaliseArray(product.Collection));
  return dedupe(bundleCollections.concat(productCollections));
}

function buildBundleProductRecord(bundle, includedProducts) {
  const description = composeBundleDescription(bundle, includedProducts);
  const includedNames = buildIncludedProductNames(includedProducts);
  const includedIds = buildIncludedProductIdentifiers(includedProducts);

  const resolvedPrice = Number(bundle['Website Retail Price']) > 0
    ? bundle['Website Retail Price']
    : sumNumericField(includedProducts, 'Website Retail Price') || undefined;

  const resolvedCompareAtPrice = Number(bundle.MSRP) > 0
    ? bundle.MSRP
    : sumNumericField(includedProducts, 'MSRP') || undefined;

  const resolvedVendorPrice = Number(bundle['Vendor Price']) > 0
    ? bundle['Vendor Price']
    : sumNumericField(includedProducts, 'Vendor Price') || undefined;

  const resolvedTrueWebCost = Number(bundle['True Web Cost']) > 0
    ? bundle['True Web Cost']
    : sumNumericField(includedProducts, 'True Web Cost') || undefined;

  const collections = mergeCollections(bundle, includedProducts);

  return {
    ...bundle,
    'Product Name': bundle['Bundle Name'] || bundle.Name || `Bundle ${bundle.id || ''}`,
    Description: description,
    Collection: collections.length ? collections : bundle.Collection,
    'Website Retail Price': resolvedPrice ?? bundle['Website Retail Price'],
    MSRP: resolvedCompareAtPrice ?? bundle.MSRP,
    'Vendor Price': resolvedVendorPrice ?? bundle['Vendor Price'],
    'True Web Cost': resolvedTrueWebCost ?? bundle['True Web Cost'],
    SKU: resolveBundleSku(bundle),
    Vendor: bundle.Brand || bundle['Sub Brand'] || bundle.Vendor || 'AQUALIVIA',
    Category: bundle.Category || 'Bundles',
    Image: bundle.Image,
    'Included Products': includedNames,
    'Bundle Product IDs': includedIds,
    'Sell on Website': bundle['Sell on Website'] === false ? false : true,
  };
}

exports.createBundleProducts = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  const { bundles, products } = req.body || {};

  if (!Array.isArray(bundles) || !Array.isArray(products)) {
    res.status(400).json({ error: 'Request body must include "bundles" and "products" arrays.' });
    return;
  }

  const productLookup = new Map();
  for (const product of products) {
    if (product && product.id) {
      productLookup.set(product.id, product);
    }
  }

  const results = [];
  const collectionCache = new Map();

  for (const bundle of bundles) {
    const bundleId = bundle?.id || bundle?.['Bundle Name'] || 'unknown';

    try {
      const { included, missing, referencedIds } = mapIncludedProducts(bundle, productLookup);

      if (!included.length) {
        results.push({
          bundleId,
          status: 'failed',
          error: 'No matching products found for bundle Products references.',
          missingProducts: missing,
          referencedProducts: referencedIds,
        });
        continue;
      }

      const bundleProductRecord = buildBundleProductRecord(bundle, included);

      const created = await createProduct(bundleProductRecord);

      const preparedVariant = buildVariantInput(bundleProductRecord);
      let variantIds = [];
      if (preparedVariant) {
        const variantResult = await createVariant(created.productId, bundleProductRecord);
        variantIds = variantResult.variantIds;
      }

      const collections = await attachCollections(created.productId, bundleProductRecord, collectionCache);

      const publishResult = created.productStatus === 'DRAFT'
        ? { published: false, skipped: true, reason: 'Product created with DRAFT status.' }
        : await publishProduct(created.productId);

      results.push({
        bundleId,
        bundleName: bundleProductRecord['Product Name'],
        productId: created.productId,
        productStatus: created.productStatus,
        variantIds,
        collections,
        publish: publishResult,
        missingProducts: missing,
        includedProducts: buildIncludedProductIdentifiers(included),
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to process bundle', { bundleId }, error);
      results.push({
        bundleId,
        status: 'failed',
        error: error.message,
      });
    }
  }

  res.status(200).json({
    processed: results.length,
    results,
  });
};

