const axios = require('axios');
const qs = require('qs');

const FLOWTRAC_API_URL = process.env.FLOWTRAC_API_URL;
const FLOWTRAC_BADGE = process.env.FLOWTRAC_BADGE;
const FLOWTRAC_PIN = process.env.FLOWTRAC_PIN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'rebelsmuggling/flowtrac-shopify-inventory-sync';
const MAPPING_FILE_PATH = 'mapping.json';

async function getFlowtracAuthCookie() {
  const loginRes = await axios.post(
    `${FLOWTRAC_API_URL}/device-login/`,
    qs.stringify({ badge: FLOWTRAC_BADGE, pin: FLOWTRAC_PIN }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, withCredentials: true }
  );
  const cookies = loginRes.headers['set-cookie'];
  if (!cookies) throw new Error('No session cookie from Flowtrac login');
  const flowAuthCookie = cookies.find((c) => c.startsWith('flow_auth='));
  if (!flowAuthCookie) throw new Error('No flow_auth cookie from Flowtrac login');
  return flowAuthCookie;
}

async function fetchAllFlowtracProducts(flowAuthCookie) {
  const productsRes = await axios.get(`${FLOWTRAC_API_URL}/products`, {
    headers: { Cookie: flowAuthCookie },
    withCredentials: true,
  });
  return productsRes.data;
}

async function getGitHubFile() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${MAPPING_FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status}`);
    }

    const data = await response.json();
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { mapping: JSON.parse(content), sha: data.sha };
  } catch (error) {
    console.error('Failed to get GitHub file:', error);
    throw error;
  }
}

async function updateGitHubFile(content, sha) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${MAPPING_FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Add Flowtrac product IDs to mapping.json - ${new Date().toISOString()}`,
          content: Buffer.from(content).toString('base64'),
          sha: sha,
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(errorData)}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to update GitHub file:', error);
    throw error;
  }
}

function updateMappingWithProductIds(mapping, skuToProductId) {
  let updated = false;
  let updatedCount = 0;
  
  for (const product of mapping.products) {
    // Simple product
    if (product.flowtrac_sku) {
      const pid = skuToProductId[product.flowtrac_sku];
      if (pid && product.flowtrac_product_id !== pid) {
        product.flowtrac_product_id = pid;
        updated = true;
        updatedCount++;
        console.log(`✓ Added product_id for ${product.flowtrac_sku}: ${pid}`);
      }
    }
    // Bundle components
    if (Array.isArray(product.bundle_components)) {
      for (const comp of product.bundle_components) {
        const pid = skuToProductId[comp.flowtrac_sku];
        if (pid && comp.flowtrac_product_id !== pid) {
          comp.flowtrac_product_id = pid;
          updated = true;
          updatedCount++;
          console.log(`✓ Added product_id for bundle component ${comp.flowtrac_sku}: ${pid}`);
        }
      }
    }
  }
  
  return { updated, updatedCount };
}

async function main() {
  try {
    console.log('Starting to populate Flowtrac product IDs in GitHub mapping...');
    
    // Check credentials
    if (!FLOWTRAC_API_URL || !FLOWTRAC_BADGE || !FLOWTRAC_PIN) {
      console.error('Missing Flowtrac credentials. Please set FLOWTRAC_API_URL, FLOWTRAC_BADGE, and FLOWTRAC_PIN environment variables.');
      process.exit(1);
    }
    
    if (!GITHUB_TOKEN) {
      console.error('Missing GitHub token. Please set GITHUB_TOKEN environment variable.');
      process.exit(1);
    }
    
    // 1. Get current mapping from GitHub
    console.log('Fetching current mapping from GitHub...');
    const { mapping, sha } = await getGitHubFile();
    console.log(`Found ${mapping.products.length} products in mapping`);
    
    // 2. Authenticate and fetch all Flowtrac products
    console.log('Authenticating with Flowtrac...');
    const flowAuthCookie = await getFlowtracAuthCookie();
    console.log('Fetching all Flowtrac products...');
    const products = await fetchAllFlowtracProducts(flowAuthCookie);
    
    // 3. Build SKU to product_id map
    console.log('Building SKU to product_id mapping...');
    const skuToProductId = {};
    for (const p of products) {
      if (p.product) skuToProductId[p.product] = p.product_id;
      if (p.barcode) skuToProductId[p.barcode] = p.product_id;
    }
    
    console.log(`Found ${Object.keys(skuToProductId).length} SKUs in Flowtrac`);
    
    // 4. Update mapping with product IDs
    console.log('Updating mapping with product IDs...');
    const { updated, updatedCount } = updateMappingWithProductIds(mapping, skuToProductId);
    
    if (updated) {
      // 5. Update GitHub file
      console.log('Updating GitHub mapping file...');
      const result = await updateGitHubFile(JSON.stringify(mapping, null, 2), sha);
      console.log(`✅ Successfully updated GitHub mapping with ${updatedCount} product IDs.`);
      console.log(`Commit SHA: ${result.commit?.sha}`);
    } else {
      console.log('✅ No updates needed. All SKUs already have product_ids.');
    }
    
  } catch (error) {
    console.error('Error populating product IDs:', error);
    process.exit(1);
  }
}

main();
