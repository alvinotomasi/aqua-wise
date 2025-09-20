'use strict';

require('dotenv').config();

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GRAPHQL_URL = SHOPIFY_DOMAIN
  ? `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`
  : null;

/**
 * Basic HTML escaping to protect description payloads.
 */
function escapeHtml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function splitParagraphs(value) {
  return value
    .split(/\r?\n+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function toDescriptionHtml(product) {
  const sections = [];
  if (product.Description) {
    sections.push(...splitParagraphs(String(product.Description)));
  }
  if (product['Key Product Features']) {
    sections.push(`Key product features: ${String(product['Key Product Features'])}`);
  }
  if (product['Problems solved (keywords)']) {
    sections.push(`Problems solved: ${String(product['Problems solved (keywords)'])}`);
  }

  if (sections.length === 0) {
    return '<p>No description provided.</p>';
  }

  return sections.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
}

function normaliseArray(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  return [input];
}

function asSingleLineValue(input) {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (Array.isArray(input)) {
    return input.map((item) => String(item).trim()).filter(Boolean).join(', ');
  }
  const value = String(input).trim();
  return value.length > 0 ? value : undefined;
}

function asMultiLineValue(input) {
  if (input === undefined || input === null) {
    return undefined;
  }
  if (Array.isArray(input)) {
    const joined = input.map((item) => String(item).trim()).filter(Boolean).join('\n');
    return joined.length > 0 ? joined : undefined;
  }
  const value = String(input).trim();
  return value.length > 0 ? value : undefined;
}

function buildMetafields(product) {
  const metafields = [];

  const singleLineMappings = [
    { key: 'Occupants', source: product.Occupants },
    { key: 'Household_Size', source: product['Household Size'] },
    { key: 'Stories_Max', source: product['Stories Max'] },
    { key: 'Max_Flow_GPM', source: product['Max Flow GPM'] },
    { key: 'cu_ft', source: product['Cu.Ft'] },
    { key: 'Tank_Size', source: product['Tank Size'] },
    { key: 'Media_Type', source: product['Media Type'] },
    { key: 'Capacity', source: product.Capacity },
    { key: 'Valve', source: product.Valve },
    { key: 'City_or_Well', source: product['City/Well'] },
    { key: 'Product_Dimensions', source: product['Product Dimensions'] },
    { key: 'Number_of_Bathroom', source: product['Number of Bathroom'] },
    { key: 'Micron', source: product.Micron || product['Micron'] },
    { key: 'Practical Service Flow', source: product['Practical Service Flow (gpm @ EBCT≈2 min)'] },
    { key: 'Backwash', source: product['Backwash (DLFC) (gpm)'] },
    { key: 'Product Weight lb', source: product['Product Weight lb'] },
    { key: 'Number of Bathroom', source: product['Number of Bathroom'] },
  ];

  for (const mapping of singleLineMappings) {
    const value = asSingleLineValue(mapping.source);
    if (value) {
      metafields.push({
        namespace: 'custom',
        key: mapping.key,
        type: 'single_line_text_field',
        value,
      });
    }
  }

  const contaminants = asMultiLineValue(product['Contaminants removed']);
  if (contaminants) {
    metafields.push({
      namespace: 'custom',
      key: 'Contaminants_Removed',
      type: 'multi_line_text_field',
      value: contaminants,
    });
  }

  const certifications = asSingleLineValue(product.Certifications);
  if (certifications) {
    metafields.push({
      namespace: 'custom',
      key: 'Certifications',
      type: 'single_line_text_field',
      value: certifications,
    });
  }

  return metafields;
}

function buildProductInput(product) {
  const descriptionHtml = toDescriptionHtml(product);
  const input = {
    title: product['Product Name'] ? String(product['Product Name']) : undefined,
    descriptionHtml,
    status: product['Sell on Website'] === false ? 'DRAFT' : 'ACTIVE',
    productType: asSingleLineValue(product.Category),
    vendor: asSingleLineValue(product.Vendor),
    metafields: buildMetafields(product),
    tags: normaliseArray(product.Collection).concat(normaliseArray(product['Problems solved (keywords)'])).filter(Boolean),
  };


  if (!input.metafields.length) {
    delete input.metafields;
  }

  if (!input.tags.length) {
    delete input.tags;
  }

  return input;
}

function buildProductMedia(product) {
  const images = Array.isArray(product.Image) ? product.Image : [];
  if (images.length === 0) {
    return null;
  }

  const [firstImage] = images;
  const candidates = [
    firstImage?.thumbnails?.full?.url,
    firstImage?.thumbnails?.large?.url,
    firstImage?.url,
  ].filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  return {
    alt: String(product['Product Name'] || 'Product image'),
    mediaContentType: 'IMAGE',
    originalSource: candidates[0],
  };
}

function buildVariantInput(product) {
  const price = product['Website Retail Price'];
  const compareAtPrice = product.MSRP;
  const sku = product.SKU;

  if (!price && !sku) {
    return null;
  }

  const inventoryItem = { tracked: false };
  if (sku) {
    inventoryItem.sku = String(sku);
  }

  const variant = {
    price: price !== undefined && price !== null ? String(price) : undefined,
    compareAtPrice:
      compareAtPrice !== undefined && compareAtPrice !== null
        ? String(compareAtPrice)
        : undefined,
    inventoryPolicy: 'CONTINUE',
    inventoryItem,
  };

  if (!variant.options) {
    delete variant.options;
  }

  return variant;
}

async function callShopify(query, variables = {}, requestLabel = 'graphqlRequest') {
  if (!GRAPHQL_URL || !SHOPIFY_TOKEN) {
    throw new Error('Shopify configuration missing. Ensure SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN env vars are set.');
  }

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
    throw new Error(`Shopify request failed (${requestLabel}) with status ${response.status}: ${text}`);
  }

  const payload = await response.json();
  if (payload.errors) {
    throw new Error(
      `Shopify GraphQL errors (${requestLabel}): ${JSON.stringify(payload.errors)}`
    );
  }

  return payload;
}

const PRODUCT_CREATE_MUTATION = `
mutation productCreate($input: ProductInput!, $media: [CreateMediaInput!]) {
  productCreate(input: $input, media: $media) {
    product {
      id
      variants(first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
    userErrors {
      field
      message
    }
  }
}
`;

const VARIANTS_BULK_MUTATION = `
mutation productVariantsBulkCreate(
  $productId: ID!
  $variants: [ProductVariantsBulkInput!]!
  $strategy: ProductVariantsBulkCreateStrategy
) {
  productVariantsBulkCreate(productId: $productId, variants: $variants, strategy: $strategy) {
    product {
      id
      title
    }
    productVariants {
      id
      title
      price
      sku
    }
    userErrors {
      code
      field
      message
    }
  }
}
`;

const COLLECTION_SEARCH_QUERY = `
query collectionByTitle($query: String!) {
  collections(first: 1, query: $query) {
    edges {
      node {
        id
        title
      }
    }
  }
}
`;

const COLLECTION_ADD_MUTATION = `
mutation collectionAddProducts($collectionId: ID!, $productIds: [ID!]!) {
  collectionAddProducts(id: $collectionId, productIds: $productIds) {
    collection {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`;

async function createProduct(product) {
  const input = buildProductInput(product);
  if (!input.title) {
    throw new Error('Product name is required to create a product.');
  }

  const media = buildProductMedia(product);
  const variables = {
    input,
    media: media ? [media] : [],
  };

  const response = await callShopify(PRODUCT_CREATE_MUTATION, variables, 'productCreate');
  const result = response.data?.productCreate;
  const userErrors = result?.userErrors || [];

  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`productCreate userErrors: ${message}`);
  }

  const productId = result?.product?.id;
  if (!productId) {
    throw new Error('productCreate did not return a product id.');
  }

  return {
    productId,
    productTitle: result.product.title,
  };
}

async function createVariant(productId, product) {
  const variantInput = buildVariantInput(product);
  if (!variantInput) {
    return { variantIds: [], variantErrors: [] };
  }

  const variables = {
    productId,
    strategy: 'REMOVE_STANDALONE_VARIANT',
    variants: [variantInput],
  };

  const response = await callShopify(
    VARIANTS_BULK_MUTATION,
    variables,
    'productVariantsBulkCreate'
  );

  const payload = response.data?.productVariantsBulkCreate;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`productVariantsBulkCreate userErrors: ${message}`);
  }

  const variantIds = (payload?.productVariants || []).map((variant) => variant.id);
  return {
    variantIds,
    variantErrors: [],
  };
}

async function findCollectionIdByName(name, cache) {
  const trimmed = String(name || '').trim();
  if (!trimmed) {
    return null;
  }

  if (cache.has(trimmed)) {
    return cache.get(trimmed);
  }

  const queryString = `title:'${trimmed.replace(/'/g, "\\'")}'`;
  console.log(`Searching for collection with query: ${queryString}`);
  const response = await callShopify(
    COLLECTION_SEARCH_QUERY,
    { query: queryString },
    'collectionSearch'
  );
  console.log('Collection search response:', JSON.stringify(response));

  const node = response.data?.collections?.edges?.[0]?.node;
  const collectionId = node?.id || null;
  cache.set(trimmed, collectionId);
  return collectionId;
}

async function addProductToCollection(collectionId, productId) {
  console.log(`Adding product ${productId} to collection ${collectionId}`);
  const response = await callShopify(
    COLLECTION_ADD_MUTATION,
    { collectionId, productIds: [productId] },
    'collectionAddProducts'
  );
  console.log('Collection add products response:', JSON.stringify(response));

  const payload = response.data?.collectionAddProducts;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`collectionAddProducts userErrors: ${message}`);
  }

  return payload?.collection?.id || collectionId;
}

async function attachCollections(productId, product, cache) {
  const names = normaliseArray(product.Collection).map((value) => String(value).trim()).filter(Boolean);
  const added = [];
  const missing = [];

  for (const name of names) {
    const collectionId = await findCollectionIdByName(name, cache);
    if (!collectionId) {
      missing.push(name);
      continue;
    }

    try {
      await addProductToCollection(collectionId, productId);
      added.push({ name, collectionId });
    } catch (error) {
      missing.push(`${name} (error: ${error.message})`);
    }
  }

  return { added, missing };
}

exports.shopifyProductSync = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    return;
  }

  if (!Array.isArray(req.body)) {
    res.status(400).json({ error: 'Request body must be an array of product objects.' });
    return;
  }

  const collectionCache = new Map();
  const results = [];

  for (const product of req.body) {
    const sourceId = product?.id || product?.ProductID || 'unknown';
    const context = { sourceId };
    try {
      const created = await createProduct(product);
      const variant = await createVariant(created.productId, product);
      const collections = await attachCollections(created.productId, product, collectionCache);

      results.push({
        ...context,
        productId: created.productId,
        productTitle: created.productTitle,
        variantIds: variant.variantIds,
        collections,
        status: 'success',
      });
    } catch (error) {
      console.error('Failed to process product', context, error);
      results.push({
        ...context,
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
