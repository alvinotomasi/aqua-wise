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

function getRecordIds(record) {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const keys = ['id', 'Id', 'ID', 'recordId', 'record_id', 'Record ID', 'Record Id', 'RecordID', 'Recordid'];
  const ids = new Set();

  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null) {
      continue;
    }

    const values = Array.isArray(value) ? value : [value];
    for (const entry of values) {
      if (entry === undefined || entry === null) {
        continue;
      }
      const text = String(entry).trim();
      if (text.length > 0) {
        ids.add(text);
      }
    }
  }

  return Array.from(ids);
}

function getShopifyProductIdFromRecord(record) {
  if (!record || typeof record !== 'object') {
    return undefined;
  }

  const candidates = [
    record['Shopify Product Id'],
    record['Shopify Product ID'],
    record['shopify_product_id'],
    record['ShopifyProductId'],
    record['shopifyProductId'],
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) {
      continue;
    }
    const text = String(candidate).trim();
    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function extractAddonShopifyProductIds(record) {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const candidateKeys = [
    'Shopify Product Id (from Add-ons)',
    'Shopify Product ID (from Add-ons)',
    'Shopify Product Id (From Add-ons)',
    'Shopify Product Id (from add-ons)',
    'ShopifyProductIdFromAddOns',
    'shopify_product_id_from_addons',
    'Shopify Product Id (Add-ons)',
  ];

  const referenceIds = new Set();

  for (const key of candidateKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const values = normaliseArray(record[key]);
    for (const value of values) {
      if (value === undefined || value === null) {
        continue;
      }
      const text = String(value).trim();
      if (text) {
        referenceIds.add(text);
      }
    }
  }

  return Array.from(referenceIds);
}

function normaliseShopifyProductGid(raw) {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const value = String(raw).trim();
  if (!value) {
    return undefined;
  }

  const gidMatch = value.match(/^gid:\/\/shopify\/Product\/(\d+)$/i);
  if (gidMatch) {
    return `gid://shopify/Product/${gidMatch[1]}`;
  }

  const numericMatch = value.match(/^(\d+)$/);
  if (numericMatch) {
    return `gid://shopify/Product/${numericMatch[1]}`;
  }

  const productPathMatch = value.match(/Product\/(\d+)/i);
  if (productPathMatch) {
    return `gid://shopify/Product/${productPathMatch[1]}`;
  }

  const urlMatch = value.match(/products\/(\d+)/i);
  if (urlMatch) {
    return `gid://shopify/Product/${urlMatch[1]}`;
  }

  return undefined;
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

// --- Numeric parsing helpers for metafields ---
function firstNumber(input) {
  if (input === undefined || input === null) return undefined;
  const text = Array.isArray(input) ? input.join(' ') : String(input);
  const cleaned = text.replace(/,/g, ' ');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  return Number.isNaN(num) ? undefined : num;
}

function toIntegerString(input) {
  const n = firstNumber(input);
  if (n === undefined) return undefined;
  return String(Math.round(n));
}

function toDecimalString(input) {
  const n = firstNumber(input);
  if (n === undefined) return undefined;
  return String(n);
}

function parseMinMax(input) {
  if (input === undefined || input === null) return { min: undefined, max: undefined };
  const text = Array.isArray(input) ? input.join(' ') : String(input);
  const cleaned = text.replace(/,/g, ' ');
  const matches = cleaned.match(/-?\d+(\.\d+)?/g) || [];
  if (matches.length >= 2) {
    const a = Number(matches[0]);
    const b = Number(matches[1]);
    const min = Math.min(a, b);
    const max = Math.max(a, b);
    return { min: String(min), max: String(max) };
  }
  if (matches.length === 1) {
    const v = String(Number(matches[0]));
    return { min: v, max: v };
  }
  return { min: undefined, max: undefined };
}
 
function buildAddonMetafield(addonShopifyProductIds) {
  if (!Array.isArray(addonShopifyProductIds) || addonShopifyProductIds.length === 0) {
    return {
      metafield: null,
      validReferenceIds: [],
      invalidReferenceIds: [],
    };
  }

  const validReferenceIds = [];
  const invalidReferenceIds = [];
  const seen = new Set();

  for (const raw of addonShopifyProductIds) {
    const normalised = normaliseShopifyProductGid(raw);
    if (!normalised) {
      if (raw !== undefined && raw !== null) {
        invalidReferenceIds.push(String(raw).trim());
      }
      continue;
    }

    if (seen.has(normalised)) {
      continue;
    }

    seen.add(normalised);
    validReferenceIds.push(normalised);
  }

  if (!validReferenceIds.length) {
    if (invalidReferenceIds.length) {
      console.warn('No valid Shopify product references found for addons metafield.', {
        provided: addonShopifyProductIds,
        invalidReferenceIds,
      });
    }
    return {
      metafield: null,
      validReferenceIds,
      invalidReferenceIds,
    };
  }

  const metafield = {
    namespace: 'custom',
    key: 'addons',
    type: 'list.product_reference',
    value: JSON.stringify(validReferenceIds),
  };

  if (invalidReferenceIds.length) {
    console.warn('Some addon references were skipped because they are not valid Shopify product IDs.', {
      provided: addonShopifyProductIds,
      validReferenceIds,
      invalidReferenceIds,
    });
  }

  return {
    metafield,
    validReferenceIds,
    invalidReferenceIds,
  };
}

function buildMetafields(product, options = {}) {
  const { addonMetafieldResult } = options;
  const metafields = [];

  // Existing "custom" namespace mappings (kept for backward compatibility)
  const singleLineMappings = [
    { key: 'Occupants', source: product.Occupants },
    { key: 'Household_Size', source: product['Household Size'] },
    { key: 'Stories_Max', source: product['Stories Max'] },
    { key: 'Max_Flow_GPM', source: product['Max Flow Rate GPM'] || product['Max Flow GPM'] },
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

  const includedProducts = asMultiLineValue(product['Included Products']);
  if (includedProducts) {
    metafields.push({
      namespace: 'custom',
      key: 'included_products',
      type: 'multi_line_text_field',
      value: includedProducts,
    });
  }

  const includedProductIds = asMultiLineValue(product['Bundle Product IDs']);
  if (includedProductIds) {
    metafields.push({
      namespace: 'custom',
      key: 'bundle_product_ids',
      type: 'multi_line_text_field',
      value: includedProductIds,
    });
  }

  if (addonMetafieldResult?.metafield) {
    metafields.push(addonMetafieldResult.metafield);
  }

  // --- New Shopify Product namespace metafields (namespace: "product") ---

  // Input & Output Line (text)
  const inputOutputLine =
    asSingleLineValue(
      product['Input & Output Line'] ||
      product['Input Output Line'] ||
      product['Input/Output Line'] ||
      product['Input & Output'] ||
      product['Input and Output Line'] ||
      product['Input & Output Line Size']
    );
  if (inputOutputLine) {
    metafields.push({
      namespace: 'product',
      key: 'input_output_line',
      type: 'single_line_text_field',
      value: inputOutputLine,
    });
  }

  // System Capacity (GPD) - integer
  const systemCapacityGpd = toIntegerString(
    product['System Capacity'] ||
    product.Capacity ||
    product['System Capacity (GPD)'] ||
    product['Capacity (GPD)']
  );
  if (systemCapacityGpd) {
    metafields.push({
      namespace: 'product',
      key: 'system_capacity_gpd',
      type: 'number_integer',
      value: systemCapacityGpd,
    });
  }

  // Feed Water Pressure (psi) - decimal
  const feedWaterPressurePsi = toDecimalString(
    product['Feed Water Pressure'] ||
    product['Feed Water Pressure (psi)'] ||
    product['Water Pressure'] ||
    product['Pressure']
  );
  if (feedWaterPressurePsi) {
    metafields.push({
      namespace: 'product',
      key: 'feed_water_pressure_psi',
      type: 'number_decimal',
      value: feedWaterPressurePsi,
    });
  }

  // Feed Water Temperature (°C) min/max - decimal
  // Detect if the provided values are in Fahrenheit and convert to Celsius if needed.
  const rawTempSources = [
    product['Feed Water Temperature Min'],
    product['Feed Water Temp Min'],
    product['Temperature Min (C)'],
    product['Feed Water Temperature C Min'],
    product['Feed Water Temperature Max'],
    product['Feed Water Temp Max'],
    product['Temperature Max (C)'],
    product['Feed Water Temperature C Max'],
    product['Feed Water Temperature'],
    product['Feed Water Temp'],
    product['Feed Water Temperature Range'],
    product['Temperature'],
  ].filter(Boolean);

  const unitIsF = rawTempSources.some((val) => {
    const text = Array.isArray(val) ? val.join(' ') : String(val);
    return /(?:deg\s*F|°\s*F|\bF\b)/i.test(text);
  });

  let tempMin = toDecimalString(
    product['Feed Water Temperature Min'] ||
    product['Feed Water Temp Min'] ||
    product['Temperature Min (C)'] ||
    product['Feed Water Temperature C Min']
  );
  let tempMax = toDecimalString(
    product['Feed Water Temperature Max'] ||
    product['Feed Water Temp Max'] ||
    product['Temperature Max (C)'] ||
    product['Feed Water Temperature C Max']
  );
  if (!tempMin && !tempMax) {
    const parsed = parseMinMax(
      product['Feed Water Temperature'] ||
      product['Feed Water Temp'] ||
      product['Feed Water Temperature Range'] ||
      product['Temperature']
    );
    tempMin = parsed.min || tempMin;
    tempMax = parsed.max || tempMax;
  }

  if (unitIsF) {
    const toC = (nStr) => {
      const n = Number(nStr);
      if (!Number.isFinite(n)) return nStr;
      return String(((n - 32) * 5) / 9);
    };
    if (tempMin) tempMin = toC(tempMin);
    if (tempMax) tempMax = toC(tempMax);
  }

  if (tempMin) {
    metafields.push({
      namespace: 'product',
      key: 'feed_water_temperature_c_min',
      type: 'number_decimal',
      value: tempMin,
    });
  }
  if (tempMax) {
    metafields.push({
      namespace: 'product',
      key: 'feed_water_temperature_c_max',
      type: 'number_decimal',
      value: tempMax,
    });
  }

  // Max Total Dissolved Solids (TDS, ppm) - integer
  const maxTdsPpm = toIntegerString(
    product['Max Total Dissolved Solids'] ||
    product['Max Total Solids'] ||
    product['Max Total Solid'] ||
    product['Max TDS'] ||
    product['TDS (max)']
  );
  if (maxTdsPpm) {
    metafields.push({
      namespace: 'product',
      key: 'max_total_dissolved_solids_tds_ppm',
      type: 'number_integer',
      value: maxTdsPpm,
    });
  }

  // Feed Water pH - decimal
  const feedWaterPh = toDecimalString(
    product['Feed Water pH'] ||
    product['Feed Water ph'] ||
    product['Feed water pH']
  );
  if (feedWaterPh) {
    metafields.push({
      namespace: 'product',
      key: 'feed_water_ph',
      type: 'number_decimal',
      value: feedWaterPh,
    });
  }

  // Source Type (City/Well) - text
  const sourceType = asSingleLineValue(
    product['City/Well'] ||
    product['City or Well'] ||
    product['city & well'] ||
    product['Source Type']
  );
  if (sourceType) {
    metafields.push({
      namespace: 'product',
      key: 'source_type',
      type: 'single_line_text_field',
      value: sourceType,
    });
  }

  // Micron Rating (µm) - integer
  const micronUm = toIntegerString(product['Micron'] || product.Micron);
  if (micronUm) {
    metafields.push({
      namespace: 'product',
      key: 'micron_rating_um',
      type: 'number_integer',
      value: micronUm,
    });
  }

  // Voltage (VAC) - text to allow phase/Hz info
  const voltageVac = asSingleLineValue(
    product['Voltage'] ||
    product['Volt'] ||
    product['Valt'] ||
    product['Voltage (VAC)']
  );
  if (voltageVac) {
    metafields.push({
      namespace: 'product',
      key: 'voltage_vac',
      type: 'single_line_text_field',
      value: voltageVac,
    });
  }

  // Media Type - text
  const mediaType = asSingleLineValue(product['Media Type'] || product['Media']);
  if (mediaType) {
    metafields.push({
      namespace: 'product',
      key: 'media_type',
      type: 'single_line_text_field',
      value: mediaType,
    });
  }

  // Brine Tank Size (text) - preserve descriptive values like 18"x36" Gray
  const brineTankSizeText = asSingleLineValue(
    product['Brine Tank Size'] ||
    product['Brain Tank Size'] ||
    product['Brine Tank (L)']
  );
  if (brineTankSizeText) {
    metafields.push({
      namespace: 'product',
      key: 'brine_tank_size',
      type: 'single_line_text_field',
      value: brineTankSizeText,
    });
  }

  return metafields;
}

function buildProductInput(product, options = {}) {
  const { addonMetafieldResult } = options;
  const descriptionHtml = toDescriptionHtml(product);
  const input = {
    title: product['Product Name'] ? String(product['Product Name']) : undefined,
    descriptionHtml,
    status: product['Sell on Website'] === false ? 'DRAFT' : 'ACTIVE',
    productType: asSingleLineValue(product.Category),
    vendor: asSingleLineValue(product['Sub Brand'] || product.Vendor),
    metafields: buildMetafields(product, { addonMetafieldResult }),
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

function buildProductMediaArray(product) {
  const images = Array.isArray(product.Image) ? product.Image : [];
  const media = [];

  const baseAlt = String(product['Product Name'] || 'Product image');

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const candidates = [
      img?.thumbnails?.full?.url,
      img?.thumbnails?.large?.url,
      img?.url,
    ].filter(Boolean);

    if (!candidates.length) {
      continue;
    }

    const alt = images.length > 1 ? `${baseAlt} (${i + 1})` : baseAlt;

    media.push({
      alt,
      mediaContentType: 'IMAGE',
      originalSource: candidates[0],
    });
  }

  return media;
}

function buildVariantInput(product) {
  const price = product['Website Retail Price'];
  const compareAtPrice = product.MSRP;
  const sku = product.SKU;

  // If neither price nor sku is present, skip this variant
  if ((price === undefined || price === null) && !sku) {
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

/**
 * Grouping helpers to treat incoming rows as product variants rather than separate products
 */

// Heuristic sanitizers for fallback grouping when no explicit group identifiers are provided.
function stripTrademark(text) {
  return text.replace(/[™®]/g, '');
}
function stripQuotes(text) {
  return text.replace(/[“”"']/g, '');
}
function stripCapacityTokens(text) {
  // Remove tokens like "32K", "96 K", "120K Grain", "120 K Grains", "32,000 Grains"
  return text
    .replace(/\b\d{1,3}(?:,\d{3})*\s*(?:k|k\s+grains?|grains?)\b/gi, '')
    .replace(/\b\d{1,3}(?:,\d{3})*\s*(?:grains?)\b/gi, '')
    .replace(/\b\d{1,3}\s*k\b/gi, '');
}
function stripTankSize(text) {
  // Remove 9x48, 10x54, 12x52, 13x54, 14x65, 16x53 forms with optional spaces and case
  return text.replace(/\b\d{1,2}\s*[xX]\s*\d{1,2}\b/g, '');
}
function stripValveTokens(text) {
  // Remove segments like " - WS1-1in" or " WS1.5-1.5in"
  return text.replace(/\s*-\s*WS[0-9.]+(?:[-.][0-9]+)?in\b/gi, '').replace(/\bWS[0-9.]+(?:[-.][0-9]+)?in\b/gi, '');
}
function collapseWhitespace(text) {
  return text.replace(/\s{2,}/g, ' ').trim();
}
function toKey(...parts) {
  return parts
    .filter(Boolean)
    .map((p) => String(p).trim().toLowerCase())
    .join('|');
}

// Build a heuristic key from Product Name + Vendor + Category, stripping size/finish tokens.
// If Option 1 Value is present and appears inside the title, remove it for grouping.
function heuristicGroupKey(product) {
  const vendor = product.Vendor || '';
  const category = product.Category || product['Category'] || '';
  const optVal = (product['Option 1 Value'] || '').toString().trim().toLowerCase();

  let title = (product['Product Name'] || '').toString();
  title = stripTrademark(title);
  title = stripQuotes(title);

  let lower = title.toLowerCase();

  // If option value appears in the title, remove it first to encourage grouping by base name
  if (optVal && lower.includes(optVal)) {
    const re = new RegExp(optVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    lower = lower.replace(re, ' ');
  }

  lower = stripCapacityTokens(lower);
  lower = stripTankSize(lower);
  lower = stripValveTokens(lower);
  lower = collapseWhitespace(lower);

  // Construct a conservative key that includes vendor and category to avoid over-grouping
  if (lower) {
    return toKey(vendor, category, lower);
  }

  // Fallback to simple product name key
  return toKey(vendor, category, (product['Product Name'] || '').toString());
}

// Key used to group variant rows into a single Shopify product.
// Priority order:
// 1. Product Group
// 2. Parent ID
// 3. Handle
// 4. Link to Product Page
// 5. URL
// 6. Product Name (as-is)
// 7. Heuristic normalized name (Vendor|Category|Sanitized Product Name)
function getGroupKey(product) {
  // Prefer explicit, stable identifiers when present.
  // IMPORTANT: Do NOT use raw "Product Name" here because it often includes
  // variant tokens (e.g., sizes/capacities) and will split variants into
  // separate products. We always fall back to the heuristic key instead.
  const explicit =
    product['Product Group'] ||
    product['Parent ID'] ||
    product['Handle'] ||
    product['Link to Product Page'] ||
    product['URL'] ||
    '';

  const explicitKey = String(explicit).trim().toLowerCase();
  if (explicitKey) return explicitKey;

  // Heuristic fallback that normalizes the name and strips variant-like tokens
  // to ensure all variants of the same base product group together.
  return heuristicGroupKey(product);
}

// Build a variant input from a single record, optionally embedding the option name and value
function buildVariantInputFromRecord(product, optionName, optionValue) {
  const price = product['Website Retail Price'];
  const compareAtPrice = product.MSRP;
  const sku = product.SKU;

  // If neither price nor sku is present, skip creating a broken variant
  if ((price === undefined || price === null) && !sku) {
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

  // Add option values if both name and value are provided
  if (optionName && optionValue !== undefined && optionValue !== null) {
    const v = String(optionValue).trim();
    if (v) {
      // Use optionValues array with optionName and name (value)
      variant.optionValues = [
        {
          optionName: String(optionName),
          name: v,
        }
      ];
    }
  }

  return variant;
}

// Bulk create variants for a given product
async function createVariants(productId, variants) {
  // Filter out any nulls (e.g., missing price & sku)
  const prepared = variants.filter(Boolean);
  if (!prepared.length) {
    return { variantIds: [], variantErrors: [] };
  }

  const variables = {
    productId,
    strategy: 'REMOVE_STANDALONE_VARIANT',
    variants: prepared,
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

async function callShopify(query, variables = {}, requestLabel = 'graphqlRequest') {
  if (!GRAPHQL_URL || !SHOPIFY_TOKEN) {
    throw new Error('Shopify configuration missing. Ensure SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN env vars are set.');
  }

  console.log('Calling Shopify GraphQL', {
    requestLabel,
    graphqlUrl: GRAPHQL_URL,
    variableKeys: Object.keys(variables || {}),
  });

  if (variables?.input?.metafields) {
    const metafieldsToLog = Array.isArray(variables.input.metafields)
      ? variables.input.metafields.map((field, index) => ({
          index,
          namespace: field?.namespace,
          key: field?.key,
          type: field?.type,
          value: field?.value,
        }))
      : variables.input.metafields;

    console.log('Shopify metafields payload', {
      requestLabel,
      metafields: metafieldsToLog,
    });
  }

  const response = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': SHOPIFY_TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });

  console.log('Shopify GraphQL response', {
    requestLabel,
    status: response.status,
    ok: response.ok,
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
      title
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

const PRODUCT_UPDATE_MUTATION = `
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
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

const PUBLICATIONS_QUERY = `
query publications($first: Int!) {
  publications(first: $first) {
    nodes {
      id
      name
    }
  }
}
`;

const PUBLISHABLE_PUBLISH_MUTATION = `
mutation publishablePublish($id: ID!, $input: [PublicationInput!]!) {
  publishablePublish(id: $id, input: $input) {
    publishable {
      ... on Product {
        id
        status
      }
    }
    shop {
      id
    }
    userErrors {
      field
      message
    }
  }
}
`;

let cachedPublicationIds = null;
let publicationPromise = null;

async function createProduct(product, optionNames, context = {}) {
  const { addonMetafieldResult } = context;
  const input = buildProductInput(product, { addonMetafieldResult });
  if (!input.title) {
    throw new Error('Product name is required to create a product.');
  }

  // Note: options field is not supported in ProductInput for productCreate
  // Options are inferred from variants when they are created

  const media = buildProductMediaArray(product);
  const variables = {
    input,
    media,
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
    productTitle: result.product?.title || input.title,
    productStatus: input.status || 'ACTIVE',
  };
}

async function updateProduct(productId, product, optionNames, context = {}) {
  const { addonMetafieldResult } = context;
  const input = buildProductInput(product, { addonMetafieldResult });
  
  // Add the product ID to the input for updates
  input.id = productId;

  // Note: options field is not supported in ProductInput for productUpdate
  // Options are managed through variants

  const variables = {
    input,
  };

  const response = await callShopify(PRODUCT_UPDATE_MUTATION, variables, 'productUpdate');
  const result = response.data?.productUpdate;
  const userErrors = result?.userErrors || [];

  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`productUpdate userErrors: ${message}`);
  }

  const updatedProductId = result?.product?.id;
  if (!updatedProductId) {
    throw new Error('productUpdate did not return a product id.');
  }

  return {
    productId: updatedProductId,
    productTitle: result.product?.title || input.title,
    productStatus: input.status || 'ACTIVE',
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
  const response = await callShopify(
    COLLECTION_SEARCH_QUERY,
    { query: queryString },
    'collectionSearch'
  );

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

async function getPublicationIds() {
  if (cachedPublicationIds !== null) {
    return cachedPublicationIds;
  }

  if (!publicationPromise) {
    publicationPromise = callShopify(
      PUBLICATIONS_QUERY,
      { first: 50 },
      'publications'
    )
      .then((response) => {
        const nodes = response.data?.publications?.nodes || [];
        const onlineStorePublication = nodes.find((node) => node?.name === 'Online Store');
        const ids = onlineStorePublication?.id ? [onlineStorePublication.id] : [];
        if (!ids.length) {
          console.warn('No publication named "Online Store" found.');
        }
        cachedPublicationIds = ids;
        publicationPromise = null;
        return ids;
      })
      .catch((error) => {
        publicationPromise = null;
        throw error;
      });
  }

  return publicationPromise;
}

async function publishProduct(productId) {
  const publicationIds = await getPublicationIds();
  if (!publicationIds.length) {
    console.warn('No publications available. Skipping publish step.');
    return { published: false, publicationIds: [] };
  }

  const input = publicationIds.map((publicationId) => ({ publicationId }));
  const response = await callShopify(
    PUBLISHABLE_PUBLISH_MUTATION,
    { id: productId, input },
    'publishablePublish'
  );

  const payload = response.data?.publishablePublish;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`publishablePublish userErrors: ${message}`);
  }

  const publishStatus = payload?.publishable?.status;
  return {
    published: publishStatus === 'ACTIVE',
    publicationIds,
    status: publishStatus,
  };
}

async function shopifyProductSync(req, res) {
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

  // 1) Group incoming items so each group becomes a single Shopify product with multiple variants
  const groups = new Map();
  for (const record of req.body) {
    const key = getGroupKey(record);
    if (!key) {
      // Fallback: treat as its own group by random key to not crash
      const fallbackKey = `${String(record['Product Name'] || 'unknown').trim().toLowerCase()}::${Math.random()}`;
      groups.set(fallbackKey, [record]);
      continue;
    }
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }

  // 2) Process each group
  for (const [groupKey, group] of groups.entries()) {
    // Base item supplies core product fields
    const base = group[0];
    const sourceIds = group.map(g => g?.id || g?.ProductID).filter(Boolean);
    const context = { sourceId: sourceIds.join(',') || 'unknown' };

    try {
      // Determine option name if we have multiple variants
      const groupHasMultiple = group.length > 1;
      const optionName =
        group.find(r => r['Option 1 Name'])?.['Option 1 Name'] ||
        (groupHasMultiple ? 'Size' : undefined);
      const optionNames = optionName ? [optionName] : undefined;

      const addonShopifyProductIds = extractAddonShopifyProductIds(base);
      const addonMetafieldResult = buildAddonMetafield(addonShopifyProductIds);

      // Check if we should update or create
      const existingProductId = base['Shopify Product Id'] || base['shopify_product_id'];
      const created = existingProductId
        ? await updateProduct(existingProductId, base, optionNames, { addonMetafieldResult })
        : await createProduct(base, optionNames, { addonMetafieldResult });

      // Build all variants for this group
      const variants = group.map((rec, idx) => {
        const optionValue =
          optionName
            ? (rec['Option 1 Value'] || rec['Tank Size'] || rec.SKU || `Variant ${idx + 1}`)
            : undefined;
        return buildVariantInputFromRecord(rec, optionName, optionValue);
      });

      // Bulk create the group's variants (removes default standalone)
      const variantResult = await createVariants(created.productId, variants);

      // Merge collections across the group and attach product to all of them
      const mergedCollections = Array.from(
        new Set(
          group.flatMap((r) => normaliseArray(r.Collection))
               .map((v) => String(v || '').trim())
               .filter(Boolean)
        )
      );

      const collections = await attachCollections(
        created.productId,
        { Collection: mergedCollections },
        collectionCache
      );

      // Publish (or skip if DRAFT)
      const publishResult =
        created.productStatus === 'DRAFT'
          ? { published: false, skipped: true, reason: 'Product created with DRAFT status.' }
          : await publishProduct(created.productId);

      results.push({
        ...context,
        productId: created.productId,
        productTitle: created.productTitle,
        productStatus: created.productStatus,
        variantIds: variantResult.variantIds,
        collections,
        publish: publishResult,
        addons: {
          input: addonShopifyProductIds,
          valid: addonMetafieldResult.validReferenceIds,
          invalid: addonMetafieldResult.invalidReferenceIds,
        },
        status: 'success',
        operation: existingProductId ? 'updated' : 'created',
      });
    } catch (error) {
      console.error('Failed to process group', { groupKey, context }, error);
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
}

module.exports = {
  shopifyProductSync,
  callShopify,
  buildProductMediaArray,
  buildMetafields,
  buildVariantInput,
  buildVariantInputFromRecord,
  createProduct,
  updateProduct,
  createVariant,
  createVariants,
  normaliseArray,
  attachCollections,
  publishProduct,
  escapeHtml,
  splitParagraphs,
  asSingleLineValue,
  asMultiLineValue,
  firstNumber,
  toIntegerString,
  toDecimalString,
  parseMinMax,
  toDescriptionHtml,
  buildProductInput,
  findCollectionIdByName,
  addProductToCollection,
  getPublicationIds,
};
