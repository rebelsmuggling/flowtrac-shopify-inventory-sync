#!/usr/bin/env node

/**
 * Utility script to help export products to CSV format
 * Usage: node utils/export-to-csv.js
 */

const fs = require('fs');
const path = require('path');

// Example function to convert Shopify products to CSV
function shopifyProductsToCSV(products) {
  const headers = ['shopify_sku', 'flowtrac_sku', 'product_name', 'bundle_components'];
  const csvRows = [headers.join(',')];
  
  products.forEach(product => {
    const row = [
      product.sku || product.variant_sku,
      product.flowtrac_sku || product.sku, // You'll need to map this
      product.title || product.name,
      product.bundle_components ? JSON.stringify(product.bundle_components) : '[]'
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Example function to convert Flowtrac products to CSV
function flowtracProductsToCSV(products) {
  const headers = ['shopify_sku', 'flowtrac_sku', 'product_name', 'bundle_components'];
  const csvRows = [headers.join(',')];
  
  products.forEach(product => {
    const row = [
      product.shopify_sku || product.sku, // You'll need to map this
      product.sku || product.flowtrac_sku,
      product.name || product.description,
      product.bundle_components ? JSON.stringify(product.bundle_components) : '[]'
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}

// Example usage
console.log('Export Utility Script');
console.log('====================');
console.log('');
console.log('This script helps you convert product data to CSV format.');
console.log('');
console.log('Example usage:');
console.log('1. Export Shopify products:');
console.log('   const shopifyProducts = [/* your Shopify products */];');
console.log('   const csv = shopifyProductsToCSV(shopifyProducts);');
console.log('   fs.writeFileSync("shopify-products.csv", csv);');
console.log('');
console.log('2. Export Flowtrac products:');
console.log('   const flowtracProducts = [/* your Flowtrac products */];');
console.log('   const csv = flowtracProductsToCSV(flowtracProducts);');
console.log('   fs.writeFileSync("flowtrac-products.csv", csv);');
console.log('');
console.log('3. Manual CSV format:');
console.log('   shopify_sku,flowtrac_sku,product_name,bundle_components');
console.log('   IC-KOOL-0045,IC-KOOL-0045,Kool Aid Cherry,[]');
console.log('   BUNDLE-001,IC-KOOL-0045,Variety Pack,"[{""flowtrac_sku"": ""IC-KOOL-0045"", ""quantity"": 2}]"');
console.log('');
console.log('Note: You\'ll need to manually map Shopify SKUs to Flowtrac SKUs for most products.');

module.exports = {
  shopifyProductsToCSV,
  flowtracProductsToCSV
}; 