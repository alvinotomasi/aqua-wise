'use strict';

require('dotenv').config();

const API_VERSION = process.env.SHOPIFY_ADMIN_API_VERSION || '2024-07';
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const GRAPHQL_URL = SHOPIFY_DOMAIN
  ? `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/graphql.json`
  : null;
const SHOPIFY_STOREFRONT_DOMAIN = (process.env.SHOPIFY_STOREFRONT_DOMAIN || 'www.aqualivia.com')
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

function slugifySegment(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return undefined;
  }
  const slug = text
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || undefined;
}

function extractHandleFromCandidate(candidate) {
  if (candidate === undefined || candidate === null) {
    return undefined;
  }

  let text = String(candidate).trim();
  if (!text) {
    return undefined;
  }

  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      if (/\/admin\//i.test(url.pathname || '')) {
        return undefined;
      }
      text = url.pathname || '';
    } catch (error) {
      return undefined;
    }
  }

  text = text.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!text) {
    return undefined;
  }

  const productMatch = text.match(/products\/([^/?#]+)/i);
  if (productMatch) {
    text = productMatch[1];
  }

  text = text.split('?')[0].split('#')[0];

  return slugifySegment(text);
}

function resolveProductHandle(record) {
  const candidates = [
    record?.Handle,
    record?.handle,
    record?.['Product Handle'],
    record?.['Handle'],
    record?.['Link to Product Page'],
    record?.['URL'],
    record?.['Product URL'],
    record?.['Link to Product'],
  ];

  for (const raw of candidates) {
    const handle = extractHandleFromCandidate(raw);
    if (handle) {
      return handle;
    }
  }

  const nameFallback = extractHandleFromCandidate(record?.['Product Name']);
  if (nameFallback) {
    return nameFallback;
  }

  return undefined;
}

function resolvePrimaryCollectionSlug(record) {
  const collections = normaliseArray(record?.Collection);
  if (!collections.length) {
    return undefined;
  }
  return slugifySegment(collections[0]);
}

function resolveProductUrl(options = {}) {
  const {
    handle,
    onlineStoreUrl,
    fallbackHandle,
    collectionSlug,
    numericProductId,
  } = options;

  if (onlineStoreUrl) {
    return onlineStoreUrl;
  }

  const resolvedHandle = handle || fallbackHandle;
  if (SHOPIFY_STOREFRONT_DOMAIN && resolvedHandle) {
    const segments = collectionSlug
      ? ['collections', collectionSlug, 'products', resolvedHandle]
      : ['products', resolvedHandle];
    return `https://${SHOPIFY_STOREFRONT_DOMAIN}/${segments.join('/')}`;
  }

  if (SHOPIFY_DOMAIN && numericProductId) {
    return `https://${SHOPIFY_DOMAIN}/admin/products/${numericProductId}`;
  }

  return null;
}

// Temporary flag to disable grouping: each incoming record is treated as its own product.
const GROUPING_ENABLED = false;

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

function escapeHtmlAttribute(value) {
  return String(value)
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

function renderInlineMarkdown(text, depth = 0) {
  if (text === undefined || text === null) {
    return '';
  }

  const MAX_DEPTH = 10;
  const content = String(text);
  if (!content.trim()) {
    return '';
  }

  const placeholders = [];
  const placeholderFor = (html) => {
    const key = `@@MDPH${placeholders.length}@@`;
    placeholders.push({
      key,
      placeholder: `@@MD${placeholders.length}@@`,
      html,
    });
    return placeholders[placeholders.length - 1].placeholder;
  };

  let working = content;

  const transformers = [
    {
      regex: /`([^`]+)`/g,
      handler: (match, code) => placeholderFor(`<code>${escapeHtml(code)}</code>`),
    },
    {
      regex: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      handler: (match, label, href) => {
        const safeHref = escapeHtmlAttribute(href);
        const inner = depth < MAX_DEPTH ? renderInlineMarkdown(label, depth + 1) : escapeHtml(label);
        return placeholderFor(`<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${inner}</a>`);
      },
    },
  ];

  const renderNested = (value, tag) => {
    const inner = depth < MAX_DEPTH ? renderInlineMarkdown(value, depth + 1) : escapeHtml(value);
    return placeholderFor(`<${tag}>${inner}</${tag}>`);
  };

  const styleTransformers = [
    {
      regex: /\*\*([^*]+)\*\*/g,
      handler: (match, boldText) => renderNested(boldText, 'strong'),
    },
    {
      regex: /__([^_]+)__/g,
      handler: (match, boldText) => renderNested(boldText, 'strong'),
    },
    {
      regex: /(?<!\*)\*([^*]+)\*(?!\*)/g,
      handler: (match, italicText) => renderNested(italicText, 'em'),
    },
    {
      regex: /(?<!_)_([^_]+)_(?!_)/g,
      handler: (match, italicText) => renderNested(italicText, 'em'),
    },
  ];

  for (const transformer of transformers) {
    working = working.replace(transformer.regex, transformer.handler);
  }

  for (const transformer of styleTransformers) {
    working = working.replace(transformer.regex, transformer.handler);
  }

  let escaped = escapeHtml(working);

  for (const { key, placeholder, html } of placeholders) {
    const placeholderPattern = new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    escaped = escaped.replace(placeholderPattern, key);
  }

  for (const { key, html } of placeholders) {
    const pattern = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    escaped = escaped.replace(pattern, html);
  }

  return escaped;
}

function markdownToDivHtml(input) {
  if (input === undefined || input === null) {
    return undefined;
  }

  const text = String(input);
  if (!text.trim()) {
    return undefined;
  }

  const lines = text.split(/\r?\n/);
  const segments = [];
  let paragraphBuffer = [];
  let listContext = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const textContent = paragraphBuffer.join(' ').replace(/\s+/g, ' ').trim();
    if (textContent) {
      segments.push(`<div class="paragraph">${renderInlineMarkdown(textContent)}</div>`);
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listContext || !listContext.items.length) {
      listContext = null;
      return;
    }
    const isOrdered = listContext.type === 'ordered';
    const listTag = isOrdered ? 'ol' : 'ul';
    const className = isOrdered ? 'list list-ordered' : 'list list-unordered';
    const startValue = isOrdered && listContext.items[0].ordinal ? listContext.items[0].ordinal : 1;
    const startAttr = isOrdered && startValue !== 1 ? ` start="${startValue}"` : '';
    const items = listContext.items
      .filter((item) => item.content && item.content.trim())
      .map((item, index) => {
        const valueAttr = isOrdered && item.ordinal && item.ordinal !== startValue + index
          ? ` value="${item.ordinal}"`
          : '';
        return `<li${valueAttr}>${renderInlineMarkdown(item.content)}</li>`;
      })
      .join('');
    if (items) {
      segments.push(`<div class="${className}"><${listTag}${startAttr}>${items}</${listTag}></div>`);
    }
    listContext = null;
  };

  const ensureList = (type) => {
    if (!listContext || listContext.type !== type) {
      flushParagraph();
      flushList();
      listContext = { type, items: [] };
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (listContext) {
        listContext.items.push({ ordinal: null, content: '' });
      } else {
        flushParagraph();
      }
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      segments.push(`<div class="heading heading-${level}">${renderInlineMarkdown(headingMatch[2])}</div>`);
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      segments.push('<div class="divider"></div>');
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      segments.push(`<div class="blockquote">${renderInlineMarkdown(blockquoteMatch[1])}</div>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderedMatch && orderedMatch[2].trim()) {
      ensureList('ordered');
      listContext.items.push({ ordinal: Number(orderedMatch[1]), content: orderedMatch[2] });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch && unorderedMatch[1].trim()) {
      ensureList('unordered');
      listContext.items.push({ ordinal: null, content: unorderedMatch[1] });
      continue;
    }

    if (/^[-–—]$/.test(trimmed)) {
      flushParagraph();
      continue;
    }

    const dashParagraph = trimmed.match(/^[-–—]\s*(.*)$/);
    if (dashParagraph && dashParagraph[1]) {
      flushParagraph();
      paragraphBuffer.push(dashParagraph[1]);
      continue;
    }

    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return segments.join('');
}

function markdownToHtml(input) {
  if (input === undefined || input === null) {
    return undefined;
  }

  const text = String(input);
  if (!text.trim()) {
    return undefined;
  }

  const lines = text.split(/\r?\n/);
  const segments = [];
  let paragraphBuffer = [];
  let listContext = null; // { type: 'ordered' | 'unordered', items: Array<{ ordinal?: number, content: string }> }

  const flushParagraph = () => {
    if (!paragraphBuffer.length) {
      return;
    }
    const renderedLines = paragraphBuffer
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => renderInlineMarkdown(line));
    if (renderedLines.length) {
      segments.push(`<p>${renderedLines.join('<br />\n')}</p>`);
    }
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!listContext || !listContext.items.length) {
      listContext = null;
      return;
    }
    const isOrdered = listContext.type === 'ordered';
    const tag = isOrdered ? 'ol' : 'ul';
    const startValue = isOrdered && listContext.items[0].ordinal ? listContext.items[0].ordinal : 1;
    const startAttr = isOrdered && startValue !== 1 ? ` start="${startValue}"` : '';
    const styleAttr = isOrdered
      ? ' style="padding-left: 25px;"'
      : ' style="list-style-type: disc; padding-left: 25px;"';
    let items = '';
    const filtered = listContext.items.filter((item) => (item.content || '').trim().length > 0);
    for (let i = 0; i < filtered.length; i += 1) {
      const item = filtered[i];
      const valueAttr = isOrdered && item.ordinal && item.ordinal !== startValue + i
        ? ` value="${item.ordinal}"`
        : '';

      if (!isOrdered) {
        const content = (item.content || '').trim();
        const endsWithColon = /:\s*$/.test(content);
        const hasNext = i + 1 < filtered.length;
        if (endsWithColon && hasNext) {
          const next = filtered[i + 1];
          const nested = `<ul style="list-style-type: circle; padding-left: 20px;"><li>${renderInlineMarkdown(next.content)}</li></ul>`;
          items += `<li>${renderInlineMarkdown(content.replace(/:\s*$/, ''))}${nested}</li>`;
          i += 1; // consume the next item as nested
          continue;
        }
      }

      items += `<li${valueAttr}>${renderInlineMarkdown(item.content)}</li>`;
    }
    if (items) {
      segments.push(`<${tag}${startAttr}${styleAttr}>${items}</${tag}>`);
    }
    listContext = null;
  };

  const ensureList = (type) => {
    if (!listContext || listContext.type !== type) {
      flushParagraph();
      flushList();
      listContext = { type, items: [] };
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (!trimmed) {
      if (listContext) {
        // Allow blank lines within lists without breaking the list; treat as soft break inside item if needed later
        // Here we simply ignore to avoid empty <li>
      } else {
        flushParagraph();
      }
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s*(.*)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = Math.min(headingMatch[1].length, 6);
      const content = headingMatch[2] || '';
      segments.push(`<h${level}>${renderInlineMarkdown(content)}</h${level}>`);
      continue;
    }

    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      segments.push('<hr />');
      continue;
    }

    const blockquoteMatch = trimmed.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      segments.push(`<blockquote>${renderInlineMarkdown(blockquoteMatch[1])}</blockquote>`);
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)[.)]\s+(.*)$/);
    if (orderedMatch && orderedMatch[2].trim()) {
      ensureList('ordered');
      listContext.items.push({ ordinal: Number(orderedMatch[1]), content: orderedMatch[2] });
      continue;
    }

    const unorderedMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (unorderedMatch && unorderedMatch[1].trim()) {
      ensureList('unordered');
      listContext.items.push({ content: unorderedMatch[1] });
      continue;
    }

    if (/^[-–—]$/.test(trimmed)) {
      flushParagraph();
      continue;
    }

    const dashParagraph = trimmed.match(/^[-–—]\s*(.*)$/);
    if (dashParagraph && dashParagraph[1]) {
      flushParagraph();
      paragraphBuffer.push(dashParagraph[1]);
      continue;
    }

    // Normal text line → part of paragraph
    flushList();
    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return segments.join('');
}

function toDescriptionHtml(product) {
  const rawDescription = product?.Description;
  if (rawDescription !== undefined && rawDescription !== null) {
    const markdownHtml = markdownToDivHtml(rawDescription);
    if (markdownHtml) {
      return markdownHtml;
    }

    const sections = splitParagraphs(String(rawDescription));
    if (sections.length > 0) {
      return sections.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('');
    }
  }

  return '<p>No description provided.</p>';
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
    'Shopify Product Id (from Optional Upgrades)',
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

function extractOptionalUpgradeShopifyProductIds(record) {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const values = normaliseArray(record['Shopify Product Id (from Optional Upgrades)']);
  const referenceIds = new Set();

  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalised = normaliseShopifyProductGid(value);
    if (normalised) {
      referenceIds.add(normalised);
    }
  }

  return Array.from(referenceIds);
}

function extractReplacementShopifyProductIds(record) {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const values = normaliseArray(record['Shopify Product Id (from Replacements)']);
  const referenceIds = new Set();

  for (const value of values) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalised = normaliseShopifyProductGid(value);
    if (normalised) {
      referenceIds.add(normalised);
    }
  }

  return Array.from(referenceIds);
}

function extractVariantShopifyProductIds(record) {
  if (!record || typeof record !== 'object') {
    return [];
  }

  const candidateKeys = [
    'Shopify Product Id (from Variants)',
    'Shopify Product ID (from Variants)',
    'Shopify Product Id (Variants)',
    'Shopify Product ID (Variants)',
    'ShopifyProductIdFromVariants',
    'shopify_product_id_from_variants',
    'Shopify Product Id (from variant records)',
    'Shopify Product Id (From Occupants Variants)',
    'Shopify Product ID (From Occupants Variants)',
    'Shopify Product Id (Occupants Variants)',
    'Shopify Product ID (Occupants Variants)',
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
    return input
      .map((item) => String(item).trim().replace(/\s+/g, ' '))
      .map((value) => value.trim())
      .filter(Boolean)
      .join(', ')
      .trim() || undefined;
  }
  const value = String(input).trim();
  if (!value.length) {
    return undefined;
  }

  const normalised = value.replace(/\s+/g, ' ').trim();
  return normalised.length > 0 ? normalised : undefined;
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

function asBooleanFlag(input) {
  if (input === true) return true;
  if (input === false || input === undefined || input === null) return false;
  const text = String(input).trim().toLowerCase();
  if (!text) return false;
  if (text === 'true' || text === '1' || text === 'yes' || text === 'y' || text === 'on') return true;
  if (text === 'false' || text === '0' || text === 'no' || text === 'n' || text === 'off') return false;
  return false;
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

function buildOptionalUpgradesMetafield(optionalUpgradeIds) {
  if (!Array.isArray(optionalUpgradeIds) || optionalUpgradeIds.length === 0) {
    return {
      metafield: null,
      validReferenceIds: [],
    };
  }

  const validReferenceIds = [];
  const seen = new Set();

  for (const raw of optionalUpgradeIds) {
    const normalised = normaliseShopifyProductGid(raw);
    if (!normalised || seen.has(normalised)) {
      continue;
    }
    seen.add(normalised);
    validReferenceIds.push(normalised);
  }

  if (!validReferenceIds.length) {
    return {
      metafield: null,
      validReferenceIds,
    };
  }

  return {
    metafield: {
      namespace: 'custom',
      key: 'optional_upgrades',
      type: 'list.product_reference',
      value: JSON.stringify(validReferenceIds),
    },
    validReferenceIds,
  };
}

function buildReplacementMetafield(replacementIds) {
  if (!Array.isArray(replacementIds) || !replacementIds.length) {
    return {
      metafield: null,
      validReferenceIds: [],
    };
  }

  const validReferenceIds = [];
  const seen = new Set();

  for (const raw of replacementIds) {
    const normalised = normaliseShopifyProductGid(raw);
    if (!normalised || seen.has(normalised)) {
      continue;
    }
    seen.add(normalised);
    validReferenceIds.push(normalised);
  }

  if (!validReferenceIds.length) {
    return {
      metafield: null,
      validReferenceIds,
    };
  }

  return {
    metafield: {
      namespace: 'custom',
      key: 'replacements',
      type: 'list.product_reference',
      value: JSON.stringify(validReferenceIds),
    },
    validReferenceIds,
  };
}

function buildOccupantVariantsMetafield(variantIds) {
  if (!Array.isArray(variantIds) || !variantIds.length) {
    return {
      metafield: null,
      validReferenceIds: [],
      invalidReferenceIds: [],
    };
  }

  const validReferenceIds = [];
  const invalidReferenceIds = [];
  const seen = new Set();

  for (const raw of variantIds) {
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
      console.warn('No valid Shopify product references found for occupant variants metafield.', {
        provided: variantIds,
        invalidReferenceIds,
      });
    }
    return {
      metafield: null,
      validReferenceIds,
      invalidReferenceIds,
    };
  }

  if (invalidReferenceIds.length) {
    console.warn('Some occupant variant references were skipped because they are not valid Shopify product IDs.', {
      provided: variantIds,
      validReferenceIds,
      invalidReferenceIds,
    });
  }

  return {
    metafield: {
      namespace: 'custom',
      key: 'occupant_variants',
      type: 'list.product_reference',
      value: JSON.stringify(validReferenceIds),
    },
    validReferenceIds,
    invalidReferenceIds,
  };
}

function normaliseDocumentEntries(input) {
  if (input === undefined || input === null) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  return [input];
}

function deriveDocumentUrl(entry) {
  if (!entry) {
    return undefined;
  }
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof entry === 'object') {
    const candidates = [entry.url, entry.link, entry.href, entry.path];
    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }
      const text = String(candidate).trim();
      if (text) {
        return text;
      }
    }
  }
  return undefined;
}

/**
 * Upload file using staged upload (download from Airtable, re-upload to Shopify)
 * This ensures proper Content-Type headers
 */
async function uploadViaStagedUpload(trimmedUrl, documentEntry) {
  console.log('Using staged upload for proper Content-Type', {
    url: trimmedUrl,
    filename: documentEntry?.filename || 'N/A',
  });

  // Step 1: Download file from Airtable
  const fileResponse = await fetch(trimmedUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file: ${fileResponse.status}`);
  }

  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const filename = documentEntry?.filename || 'document.pdf';
  const mimeType = documentEntry?.type || 'application/pdf';

  // Step 2: Request staged upload URL from Shopify
  const STAGED_UPLOAD_MUTATION = `
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

  const stagedResponse = await callShopify(
    STAGED_UPLOAD_MUTATION,
    {
      input: [{
        resource: 'FILE',
        filename,
        mimeType,
        httpMethod: 'POST',
        fileSize: fileBuffer.length.toString(),
      }],
    },
    'stagedUploadsCreate'
  );

  const stagedTarget = stagedResponse.data?.stagedUploadsCreate?.stagedTargets?.[0];
  if (!stagedTarget) {
    const errors = stagedResponse.data?.stagedUploadsCreate?.userErrors || [];
    throw new Error(`Failed to get staged upload URL: ${JSON.stringify(errors)}`);
  }

  // Step 3: Upload file to staged URL
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
    throw new Error(`Staged upload failed: ${uploadResponse.status}`);
  }

  // Step 4: Create file reference in Shopify
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

  const payload = fileCreateResponse.data?.fileCreate;
  if (!payload) {
    throw new Error('fileCreate did not return a payload.');
  }

  const userErrors = payload.userErrors || [];
  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`fileCreate userErrors: ${message}`);
  }

  const createdFile = payload.files?.[0];
  if (!createdFile?.id) {
    throw new Error('fileCreate did not return a file id.');
  }

  console.log('✓ Staged upload successful with proper Content-Type', {
    fileId: createdFile.id,
    filename,
    mimeType,
    alt: fileInput.alt || '(none)',
  });

  return createdFile.id;
}

async function ensureShopifyFileReference(documentEntry, options = {}) {
  const { fileCache } = options;

  const url = deriveDocumentUrl(documentEntry);
  if (!url) {
    return {
      fileId: null,
      status: 'skipped',
      reason: 'Missing URL',
      url: undefined,
      source: documentEntry,
    };
  }

  const trimmedUrl = String(url).trim();
  if (!/^https?:\/\//i.test(trimmedUrl)) {
    return {
      fileId: null,
      status: 'skipped',
      reason: 'Unsupported URL scheme',
      url: trimmedUrl,
      source: documentEntry,
    };
  }

  const cacheKey =
    (documentEntry && typeof documentEntry === 'object' && (documentEntry.id || documentEntry.url || documentEntry.link))
    || trimmedUrl;

  if (fileCache && cacheKey && fileCache.has(cacheKey)) {
    return {
      fileId: fileCache.get(cacheKey),
      status: 'cached',
      url: trimmedUrl,
      source: documentEntry,
    };
  }

  const contentTypeCandidate =
    (documentEntry && typeof documentEntry === 'object' && documentEntry.type) || '';

  let urlPath = '';
  try {
    const parsed = new URL(trimmedUrl);
    urlPath = parsed.pathname || '';
  } catch (error) {
    urlPath = '';
  }

  const looksLikeImage =
    /image\//i.test(String(contentTypeCandidate)) ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(urlPath);

  // Check if URL has extension
  const urlHasExtension = /\.[A-Za-z0-9]{2,6}(\?|$)/.test(urlPath);

  try {
    let fileId;

    // For Airtable URLs without extensions: Use staged upload for proper Content-Type
    if (!urlHasExtension && !looksLikeImage) {
      fileId = await uploadViaStagedUpload(trimmedUrl, documentEntry);
    } else {
      // For URLs with extensions or images: Use direct URL upload
      const contentType = looksLikeImage ? 'IMAGE' : 'FILE';
      const fileInput = {
        originalSource: trimmedUrl,
        contentType,
      };

      if (urlHasExtension) {
        const parts = urlPath.split('/').filter(Boolean);
        const urlBase = parts.length ? parts[parts.length - 1].split('?')[0] : '';
        const extMatch = urlBase.match(/\.([A-Za-z0-9]{2,6})$/);

        if (extMatch) {
          const ext = `.${extMatch[1].toLowerCase()}`;
          const baseFilename = urlBase.substring(0, urlBase.lastIndexOf('.')) || 'document';
          fileInput.filename = `${baseFilename}${ext}`;
        }
      }

      // Set alt text from description or fallback to filename
      if (documentEntry && typeof documentEntry === 'object') {
        const alt = documentEntry.description || documentEntry.filename || fileInput.filename;
        if (alt) {
          fileInput.alt = String(alt).trim();
        }
      } else if (fileInput.filename) {
        fileInput.alt = fileInput.filename;
      }

      const response = await callShopify(
        FILE_CREATE_MUTATION,
        { files: [fileInput] },
        'fileCreate'
      );

      const payload = response.data?.fileCreate;
      if (!payload) {
        throw new Error('fileCreate did not return a payload.');
      }

      const userErrors = payload.userErrors || [];
      if (userErrors.length > 0) {
        const message = userErrors.map((error) => error.message).join('; ');
        throw new Error(`fileCreate userErrors: ${message}`);
      }

      const createdFile = payload.files?.[0];
      if (!createdFile?.id) {
        throw new Error('fileCreate did not return a file id.');
      }

      fileId = createdFile.id;
    }

    if (fileCache && cacheKey) {
      fileCache.set(cacheKey, fileId);
    }

    return {
      fileId,
      status: 'created',
      url: trimmedUrl,
      source: documentEntry,
    };
  } catch (error) {
    return {
      fileId: null,
      status: 'error',
      error: error.message,
      url: trimmedUrl,
      source: documentEntry,
    };
  }
}

async function buildProductDocumentationMetafield(product, options = {}) {
  const { fileCache } = options;
  const rawDocumentation = product ? product['Product Documentation'] : undefined;
  const documentationEntries = normaliseDocumentEntries(rawDocumentation);

  if (!documentationEntries.length) {
    return {
      metafield: null,
      fileIds: [],
      entries: [],
      errors: [],
      skipped: [],
    };
  }

  const results = [];
  const fileIds = [];
  const seenFileIds = new Set();

  for (const entry of documentationEntries) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await ensureShopifyFileReference(entry, { fileCache });
    results.push(outcome);
    if (outcome.fileId && !seenFileIds.has(outcome.fileId)) {
      seenFileIds.add(outcome.fileId);
      fileIds.push(outcome.fileId);
    }
  }

  const errors = results
    .filter((result) => result.status === 'error')
    .map((result) => ({ url: result.url, message: result.error }));
  const skipped = results
    .filter((result) => result.status === 'skipped')
    .map((result) => ({ url: result.url, reason: result.reason }));

  const productName = product['Product Name'] || product.title || product.Name;

  if (!fileIds.length) {
    console.warn('Failed to create Shopify file references for product documentation.', {
      productName,
      documentationCount: documentationEntries.length,
      errors,
      skipped,
    });
    return {
      metafield: null,
      fileIds,
      entries: results,
      errors,
      skipped,
    };
  }

  if (errors.length || skipped.length) {
    console.warn('Some product documentation entries could not be converted to Shopify file references.', {
      productName,
      errors,
      skipped,
      successfulReferences: fileIds.length,
    });
  }

  // Always use list.file_reference to match Shopify metafield definition
  return {
    metafield: {
      namespace: 'custom',
      key: 'product_documentation',
      type: 'list.file_reference',
      value: JSON.stringify(fileIds),
    },
    fileIds,
    entries: results,
    errors,
    skipped,
  };
}

function buildMetafields(product, options = {}) {
  const {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  } = options;
  const metafields = [];

  // Existing "custom" namespace mappings (kept for backward compatibility)
  const singleLineMappings = [
    { key: 'occupants', source: product.Occupants },
    { key: 'household_size', source: product['Household Size'] },
    { key: 'stories_max', source: product['Stories Max'] },
    { key: 'max_flow_gpm', source: product['Max Flow Rate GPM'] || product['Max Flow GPM'] || product['Max Flow Rate (GPM)'] || product['Max Flow Rate gpm'] },
    { key: 'cu_ft', source: product['Cu.Ft'] },
    { key: 'media_volume', source: product['Cu.Ft. (Media Volume)'] || product['Media Volume'] },
    { key: 'tank_size', source: product['Tank Size'] },
    { key: 'media_type', source: product['Media Type'] },
    { key: 'material', source: product.Material || product['Material'] || product['Materials'] },
    { key: 'capacity', source: product.Capacity },
    { key: 'valve', source: product.Valve },
    { key: 'city_or_well', source: product['City/Well'] },
    { key: 'product_dimensions', source: product['Product Dimensions'] || product['Product Dimensions (H x W x D)'] },
    { key: 'number_of_bathroom', source: product['Number of Bathroom'] || product['Number of Bathrooms'] },
    { key: 'micron', source: product.Micron || product['Micron'] },
    { key: 'practical_service_flow', source: product['Practical Service Flow (gpm @ EBCT≈2 min)'] },
    { key: 'backwash', source: product['Backwash (DLFC) (gpm)'] },
    { key: 'product_weight_lb', source: product['Product Weight lb'] || product['Product Weight (lb)'] },
    { key: 'power_requirement', source: product['Power Requirement'] },
    { key: 'bypass_valve_included', source: product['Bypass Valve Included'] },
    { key: 'operating_pressures', source: product['Operating Pressure'] },
    { key: 'operating_temperatures', source: product['Operating Temperatures'] || product['Max. operating temperature'] || product['Max. Operating Temperature'] },
    { key: 'drain_line', source: product['Drain Line'] },
    { key: 'installation_type', source: product['Installation Type'] },
    { key: 'estimated_installation_time', source: product['Estimated Installation Time'] },
    { key: 'recovery_rate', source: product['Recovery Rate'] },
    { key: 'storage_tank_capacity', source: product['Storage Tank Capacity'] },
    { key: 'waste_to_pure_ratio', source: product['Waste-to-Pure Ratio'] },
    { key: 'feed_water_tds_limit', source: product['Feed Water TDS Limit'] },
    { key: 'feed_water_ph_range', source: product['Feed Water pH Range'] },
    { key: 'operating_environment', source: product['Operating Environment'] },
    { key: 'tank_dimensions', source: product['Tank Dimensions'] },
    { key: 'maximum_pressure', source: product['Maximum Pressure'] },
    { key: 'ozone_output', source: product['Ozone Output'] },
    { key: 'operating_voltage', source: product['Operating Voltage'] },
    { key: 'power_consumption', source: product['Power Consumption'] },
    { key: 'service_life', source: product['Service Life'] },
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
    const listValues = contaminants.split('\n').map(line => line.trim()).filter(Boolean);
    if (listValues.length > 0) {
      metafields.push({
        namespace: 'custom',
        key: 'contaminants_removed',
        type: 'list.single_line_text_field',
        value: JSON.stringify(listValues),
      });
    }
  }

  const certifications = asSingleLineValue(product.Certifications);
  if (certifications) {
    const listValues = certifications.split(',').map(item => item.trim()).filter(Boolean);
    if (listValues.length > 0) {
      metafields.push({
        namespace: 'custom',
        key: 'certifications',
        type: 'list.single_line_text_field',
        value: JSON.stringify(listValues),
      });
    }
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

  const keyProductFeaturesRaw = asMultiLineValue(product['Key Product Features']);
  if (keyProductFeaturesRaw) {
    const listValues = keyProductFeaturesRaw
      .split('\n')
      .map((line) => line.trim())
      .map((line) => line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''))
      .filter(Boolean);

    if (listValues.length > 0) {
      metafields.push({
        namespace: 'custom',
        key: 'key_product_features',
        type: 'list.single_line_text_field',
        value: JSON.stringify(listValues),
      });
    }
  }

  const idealFor = asSingleLineValue(product['Ideal For']);
  if (idealFor) {
    metafields.push({
      namespace: 'custom',
      key: 'ideal_for',
      type: 'single_line_text_field',
      value: idealFor,
    });
  }

  const problemsSolvedKeywords = asMultiLineValue(product['Problems solved (keywords)']);
  if (problemsSolvedKeywords) {
    metafields.push({
      namespace: 'custom',
      key: 'problems_solved',
      type: 'single_line_text_field',
      value: problemsSolvedKeywords,
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

  const waterProblemsSolved = asMultiLineValue(product['Water Problems Solved']);
  if (waterProblemsSolved) {
    const listValues = waterProblemsSolved
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => renderInlineMarkdown(line));
    if (listValues.length > 0) {
      metafields.push({
        namespace: 'custom',
        key: 'water_problems_solved',
        type: 'list.single_line_text_field',
        value: JSON.stringify(listValues),
      });
    }
  }

  const sayGoodbyeTo = asMultiLineValue(product['Engineered to Reduce']);
  if (sayGoodbyeTo) {
    metafields.push({
      namespace: 'custom',
      key: 'say_goodbye_to',
      type: 'multi_line_text_field',
      value: sayGoodbyeTo,
    });
  }

  const perfectForHomesWith = asMultiLineValue(product['Perfect For Homes With']);
  if (perfectForHomesWith) {
    const listValues = perfectForHomesWith.split('\n').map(line => line.trim()).filter(Boolean);
    if (listValues.length > 0) {
      metafields.push({
        namespace: 'custom',
        key: 'perfect_for_homes_with',
        type: 'list.single_line_text_field',
        value: JSON.stringify(listValues),
      });
    }
  }

  const deliveryAndReturns = markdownToHtml(product['Delivery & Returns']);
  if (deliveryAndReturns) {
    metafields.push({
      namespace: 'custom',
      key: 'delivery_and_returns',
      type: 'multi_line_text_field',
      value: deliveryAndReturns,
    });
  }

  const extendedDescriptionHtml = markdownToHtml(product['Extended Description']);
  if (extendedDescriptionHtml) {
    metafields.push({
      namespace: 'custom',
      key: 'extended_description',
      type: 'multi_line_text_field',
      value: extendedDescriptionHtml,
    });
  }

  const estimatedInstallationTimeHtml = markdownToDivHtml(product['Estimated Installation Time']);
  if (estimatedInstallationTimeHtml) {
    metafields.push({
      namespace: 'custom',
      key: 'estimated_installation_time',
      type: 'multi_line_text_field',
      value: estimatedInstallationTimeHtml,
    });
  }

  const warrantyHtml = markdownToHtml(product['Warranty']);
  if (warrantyHtml) {
    metafields.push({
      namespace: 'custom',
      key: 'warranty',
      type: 'multi_line_text_field',
      value: warrantyHtml,
    });
  }

  const maintenanceRequirementHtml = markdownToDivHtml(product['Maintenance Requirement']);
  if (maintenanceRequirementHtml) {
    metafields.push({
      namespace: 'custom',
      key: 'maintenance_requirement',
      type: 'multi_line_text_field',
      value: maintenanceRequirementHtml,
    });
  }

  const productDocumentationRaw = product['Product Documentation'];
  if (addonMetafieldResult?.metafield) {
    metafields.push(addonMetafieldResult.metafield);
  }

  if (documentationMetafieldResult?.metafield) {
    metafields.push(documentationMetafieldResult.metafield);
  }

  if (occupantVariantsMetafieldResult?.metafield) {
    metafields.push(occupantVariantsMetafieldResult.metafield);
  }

  // optional_upgrades and replacements metafields are built upstream and passed via options

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
      namespace: 'custom',
      key: 'input_output_line',
      type: 'single_line_text_field',
      value: inputOutputLine,
    });
  }

  // System Capacity (GPD) - text
  const systemCapacityGpd = asSingleLineValue(
    product['System Capacity'] ||
    product.Capacity ||
    product['System Capacity (GPD)'] ||
    product['Capacity (GPD)']
  );
  if (systemCapacityGpd) {
    metafields.push({
      namespace: 'custom',
      key: 'system_capacity_gpd',
      type: 'single_line_text_field',
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
      namespace: 'custom',
      key: 'feed_water_pressure_psi',
      type: 'number_decimal',
      value: feedWaterPressurePsi,
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
      namespace: 'custom',
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
      namespace: 'custom',
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
      namespace: 'custom',
      key: 'source_type',
      type: 'single_line_text_field',
      value: sourceType,
    });
  }

  // Micron Rating (µm) - integer
  const micronUm = toIntegerString(product['Micron'] || product.Micron);
  if (micronUm) {
    metafields.push({
      namespace: 'custom',
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
      namespace: 'custom',
      key: 'voltage_vac',
      type: 'single_line_text_field',
      value: voltageVac,
    });
  }

  // Media Type - text
  const mediaType = asSingleLineValue(product['Media Type'] || product['Media']);
  if (mediaType) {
    metafields.push({
      namespace: 'custom',
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
      namespace: 'custom',
      key: 'brine_tank_size',
      type: 'single_line_text_field',
      value: brineTankSizeText,
    });
  }

  const operatingPressures = asSingleLineValue(product['Operating Pressures']);
  if (operatingPressures) {
    metafields.push({
      namespace: 'custom',
      key: 'operating_pressures',
      type: 'single_line_text_field',
      value: operatingPressures,
    });
  }

  const operatingTemperatures = asSingleLineValue(product['Operating Temperatures']);
  if (operatingTemperatures) {
    metafields.push({
      namespace: 'custom',
      key: 'operating_temperatures',
      type: 'single_line_text_field',
      value: operatingTemperatures,
    });
  }

  const drainLine = asSingleLineValue(product['Drain Line']);
  if (drainLine) {
    metafields.push({
      namespace: 'custom',
      key: 'drain_line',
      type: 'single_line_text_field',
      value: drainLine,
    });
  }

  const powerRequirement = asSingleLineValue(product['Power Requirement']);
  if (powerRequirement) {
    metafields.push({
      namespace: 'custom',
      key: 'power_requirement',
      type: 'single_line_text_field',
      value: powerRequirement,
    });
  }

  const bypassValveIncluded = asSingleLineValue(product['Bypass Valve Included']);
  if (bypassValveIncluded) {
    metafields.push({
      namespace: 'custom',
      key: 'bypass_valve_included',
      type: 'single_line_text_field',
      value: bypassValveIncluded,
    });
  }

  const installationType = asSingleLineValue(product['Installation Type']);
  if (installationType) {
    metafields.push({
      namespace: 'custom',
      key: 'installation_type',
      type: 'single_line_text_field',
      value: installationType,
    });
  }

  const estimatedInstallationTime = asSingleLineValue(product['Estimated Installation Time']);
  if (estimatedInstallationTime) {
    metafields.push({
      namespace: 'custom',
      key: 'estimated_installation_time',
      type: 'single_line_text_field',
      value: estimatedInstallationTime,
    });
  }

  return metafields;
}

function buildProductInput(product, options = {}) {
  const {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  } = options;
  const descriptionHtml = toDescriptionHtml(product);
  const input = {
    title: product['Product Name'] ? String(product['Product Name']) : undefined,
    descriptionHtml,
    status: asBooleanFlag(product['Sell on Website']) ? 'ACTIVE' : 'DRAFT',
    productType: asSingleLineValue(product.Category),
    vendor: asSingleLineValue(product['Sub Brand'] || product['Brand'] || product.Vendor),
    metafields: buildMetafields(product, {
      addonMetafieldResult,
      optionalUpgradesMetafieldResult,
      replacementsMetafieldResult,
      documentationMetafieldResult,
      occupantVariantsMetafieldResult,
    }),
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
  const available = product.available;

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
    inventoryPolicy: available === false ? 'DENY' : 'CONTINUE',
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
  return text.replace(/["']/g, '');
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
  const available = product.available;

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
    inventoryPolicy: available === false ? 'DENY' : 'CONTINUE',
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
      handle
      onlineStoreUrl
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

async function replaceProductMedia(productId, product) {
  const media = buildProductMediaArray(product);
  const hasNewMedia = Array.isArray(media) && media.length > 0;
  if (!hasNewMedia) {
    return { replaced: false, reason: 'no-new-media' };
  }

  // 1) Fetch existing media IDs
  const existing = await callShopify(
    PRODUCT_MEDIA_IDS_QUERY,
    { id: productId },
    'productMediaFetch'
  );
  const edges = existing?.data?.product?.media?.edges || [];
  const existingIds = edges.map((e) => e?.node?.id).filter(Boolean);

  // 2) Delete existing media if any
  if (existingIds.length > 0) {
    const del = await callShopify(
      PRODUCT_DELETE_MEDIA_MUTATION,
      { productId, mediaIds: existingIds },
      'productDeleteMedia'
    );
    const delErrors = del?.data?.productDeleteMedia?.userErrors || [];
    if (delErrors.length > 0) {
      const message = delErrors.map((e) => e.message).join('; ');
      throw new Error(`productDeleteMedia userErrors: ${message}`);
    }
  }

  // 3) Create new media
  const crt = await callShopify(
    PRODUCT_CREATE_MEDIA_MUTATION,
    { productId, media },
    'productCreateMedia'
  );
  const mediaErrors = crt?.data?.productCreateMedia?.mediaUserErrors || [];
  if (mediaErrors.length > 0) {
    const message = mediaErrors.map((e) => e.message).join('; ');
    throw new Error(`productCreateMedia mediaUserErrors: ${message}`);
  }

  return { replaced: true, createdCount: (crt?.data?.productCreateMedia?.media || []).length };
}

const PRODUCT_UPDATE_MUTATION = `
mutation productUpdate($input: ProductInput!) {
  productUpdate(input: $input) {
    product {
      id
      title
      handle
      onlineStoreUrl
    }
    userErrors {
      field
      message
    }
  }
}
`;

const FILE_CREATE_MUTATION = `
mutation fileCreate($files: [FileCreateInput!]!) {
  fileCreate(files: $files) {
    files {
      id
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

const PRODUCT_DETAILS_QUERY = `
query productDetails($id: ID!) {
  product(id: $id) {
    id
    handle
    onlineStoreUrl
  }
}
`;

const PRODUCT_MEDIA_IDS_QUERY = `
query productMedia($id: ID!) {
  product(id: $id) {
    id
    media(first: 100) {
      edges {
        node { id }
      }
    }
  }
}
`;

const PRODUCT_DELETE_MEDIA_MUTATION = `
mutation productDeleteMedia($productId: ID!, $mediaIds: [ID!]!) {
  productDeleteMedia(productId: $productId, mediaIds: $mediaIds) {
    deletedMediaIds
    userErrors { field message }
  }
}
`;

const PRODUCT_CREATE_MEDIA_MUTATION = `
mutation productCreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
  productCreateMedia(productId: $productId, media: $media) {
    media { id }
    mediaUserErrors { field message }
  }
}
`;

const PRODUCT_DELETE_MUTATION = `
mutation productDelete($input: ProductDeleteInput!) {
  productDelete(input: $input) {
    deletedProductId
    userErrors {
      field
      message
    }
  }
}
`;

async function createProduct(product, optionNames, context = {}) {
  const {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  } = context;
  const input = buildProductInput(product, {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  });
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

  const productHandle = result?.product?.handle;
  const onlineStoreUrl = result?.product?.onlineStoreUrl;

  return {
    productId,
    productTitle: result.product?.title || input.title,
    productStatus: input.status || 'ACTIVE',
    productHandle,
    onlineStoreUrl,
  };
}

async function updateProduct(productId, product, optionNames, context = {}) {
  const {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  } = context;
  const input = buildProductInput(product, {
    addonMetafieldResult,
    optionalUpgradesMetafieldResult,
    replacementsMetafieldResult,
    documentationMetafieldResult,
    occupantVariantsMetafieldResult,
  });

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

  const productHandle = result?.product?.handle;
  const onlineStoreUrl = result?.product?.onlineStoreUrl;

  // Replace media after product core fields are updated
  try {
    await replaceProductMedia(productId, product);
  } catch (mediaError) {
    console.warn('Failed to replace product media during update', { productId, error: mediaError.message });
  }

  return {
    productId: updatedProductId,
    productTitle: result.product?.title || input.title,
    productStatus: input.status || 'ACTIVE',
    productHandle,
    onlineStoreUrl,
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

async function fetchProductDetails(productId) {
  try {
    const response = await callShopify(
      PRODUCT_DETAILS_QUERY,
      { id: productId },
      'productDetails'
    );
    const product = response.data?.product;
    return {
      handle: product?.handle || null,
      onlineStoreUrl: product?.onlineStoreUrl || null,
    };
  } catch (error) {
    console.warn('Failed to fetch product details after publish.', {
      productId,
      error: error.message,
    });
    return {
      handle: null,
      onlineStoreUrl: null,
    };
  }
}

async function deleteProduct(productId) {
  const response = await callShopify(
    PRODUCT_DELETE_MUTATION,
    { input: { id: productId } },
    'productDelete'
  );

  const payload = response.data?.productDelete;
  const userErrors = payload?.userErrors || [];
  if (userErrors.length > 0) {
    const message = userErrors.map((error) => error.message).join('; ');
    throw new Error(`productDelete userErrors: ${message}`);
  }

  return {
    deletedProductId: payload?.deletedProductId || productId,
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
  const fileReferenceCache = new Map();
  const results = [];

  // 1) Optional grouping of incoming items. Currently disabled so each record is processed individually.
  const groups = new Map();
  if (GROUPING_ENABLED) {
    for (const record of req.body) {
      const key = getGroupKey(record);
      if (!key) {
        const fallbackKey = `${String(record['Product Name'] || 'unknown').trim().toLowerCase()}::${Math.random()}`;
        groups.set(fallbackKey, [record]);
        continue;
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
  } else {
    req.body.forEach((record, index) => {
      const baseKey =
        record?.id ||
        record?.ProductID ||
        record?.SKU ||
        record?.['Product Name'] ||
        'record';
      const uniqueKey = `${String(baseKey).trim().toLowerCase()}::${index}`;
      groups.set(uniqueKey, [record]);
    });
  }

  // 2) Process each group
  for (const [groupKey, group] of groups.entries()) {
    // Base item supplies core product fields
    const base = group[0];
    const sourceIds = group.map(g => g?.id || g?.ProductID).filter(Boolean);
    const context = { sourceId: sourceIds.join(',') || 'unknown', fileCache: fileReferenceCache };

    try {
      const existingProductId = base['Shopify Product Id'] || base['shopify_product_id'];

      // Determine option name if we have multiple variants
      const groupHasMultiple = group.length > 1;
      const optionName =
        group.find(r => r['Option 1 Name'])?.['Option 1 Name'] ||
        (groupHasMultiple ? 'Size' : undefined);
      const optionNames = optionName ? [optionName] : undefined;

      const addonShopifyProductIds = extractAddonShopifyProductIds(base);
      const addonMetafieldResult = buildAddonMetafield(addonShopifyProductIds);
      const optionalUpgradeIds = extractOptionalUpgradeShopifyProductIds(base);
      const optionalUpgradesMetafieldResult = buildOptionalUpgradesMetafield(optionalUpgradeIds);
      const replacementIds = extractReplacementShopifyProductIds(base);
      const replacementsMetafieldResult = buildReplacementMetafield(replacementIds);
      const variantShopifyProductIds = extractVariantShopifyProductIds(base);
      const occupantVariantsMetafieldResult = buildOccupantVariantsMetafield(variantShopifyProductIds);
      const documentationMetafieldResult = await buildProductDocumentationMetafield(base, {
        fileCache: context.fileCache,
      });

      // Check if we should update or create
      const created = existingProductId
        ? await updateProduct(existingProductId, base, optionNames, {
          addonMetafieldResult,
          optionalUpgradesMetafieldResult,
          replacementsMetafieldResult,
          documentationMetafieldResult,
          occupantVariantsMetafieldResult,
        })
        : await createProduct(base, optionNames, {
          addonMetafieldResult,
          optionalUpgradesMetafieldResult,
          replacementsMetafieldResult,
          documentationMetafieldResult,
          occupantVariantsMetafieldResult,
        });

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

      let publishResult;
      if (created.productStatus === 'DRAFT') {
        publishResult = { published: false, skipped: true, reason: 'Product created with DRAFT status.' };
      } else {
        publishResult = await publishProduct(created.productId);
      }

      const productDetails = await fetchProductDetails(created.productId);

      const numericProductId = created.productId.replace('gid://shopify/Product/', '');

      const productUrl = resolveProductUrl({
        handle: productDetails.handle || created.productHandle,
        onlineStoreUrl: productDetails.onlineStoreUrl || created.onlineStoreUrl,
        fallbackHandle: resolveProductHandle(base),
        collectionSlug: resolvePrimaryCollectionSlug(base),
        numericProductId,
      });

      results.push({
        ...context,
        productId: created.productId,
        productIdNumeric: numericProductId,
        productUrl: productUrl,
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
        optionalUpgrades: {
          input: optionalUpgradeIds,
          valid: optionalUpgradesMetafieldResult.validReferenceIds,
        },
        replacements: {
          input: replacementIds,
          valid: replacementsMetafieldResult.validReferenceIds,
        },
        occupantVariants: {
          input: variantShopifyProductIds,
          valid: occupantVariantsMetafieldResult.validReferenceIds,
          invalid: occupantVariantsMetafieldResult.invalidReferenceIds,
        },
        documentation: {
          fileIds: documentationMetafieldResult.fileIds,
          errors: documentationMetafieldResult.errors,
          skipped: documentationMetafieldResult.skipped,
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
  deleteProduct,
  normaliseArray,
  extractVariantShopifyProductIds,
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
  buildOccupantVariantsMetafield,
};
