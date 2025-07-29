import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'rebelsmuggling/flowtrac-shopify-inventory-sync';
const MAPPING_FILE_PATH = 'mapping.json';

export async function GET() {
  try {
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'GITHUB_TOKEN not configured',
        message: 'Please set up your GitHub token first'
      });
    }

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
      return NextResponse.json({ 
        success: false, 
        error: `GitHub API error: ${response.status}`,
        message: 'Could not fetch mapping from GitHub'
      });
    }

    const data = await response.json();
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
      error: (error as Error).message 
    }, { status: 500 });
  }
} 