import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    // First, let's test if the endpoint is working at all
    console.log('Test GitHub endpoint called');
    
    // Check if GitHub token exists
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'GITHUB_TOKEN not configured',
        message: 'Please set up your GitHub token first',
        debug: 'No token found in environment'
      });
    }

    // Test basic GitHub API connectivity
    const GITHUB_REPO = process.env.GITHUB_REPO || 'rebelsmuggling/flowtrac-shopify-inventory-sync';
    const MAPPING_FILE_PATH = 'mapping.json';

    console.log('Attempting to fetch from GitHub:', GITHUB_REPO);

    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${MAPPING_FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    console.log('GitHub API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.log('GitHub API error response:', errorText);
      
      return NextResponse.json({ 
        success: false, 
        error: `GitHub API error: ${response.status}`,
        message: 'Could not fetch mapping from GitHub',
        debug: {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText.substring(0, 200) // First 200 chars
        }
      });
    }

    const data = await response.json();
    console.log('GitHub API success, parsing content');
    
    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    const mapping = JSON.parse(content);

    return NextResponse.json({ 
      success: true, 
      message: 'Successfully fetched mapping from GitHub',
      productCount: mapping.products?.length || 0,
      lastCommit: data.sha,
      lastUpdated: data.last_modified,
      products: mapping.products?.map((p: any) => ({
        flowtrac_sku: p.flowtrac_sku,
        shopify_sku: p.shopify_sku,
        amazon_sku: p.amazon_sku
      })) || []
    });

  } catch (error) {
    console.error('Test GitHub failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message,
      debug: 'Exception caught in try-catch'
    }, { status: 500 });
  }
} 