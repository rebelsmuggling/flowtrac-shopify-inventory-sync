import { NextRequest, NextResponse } from 'next/server';

export async function GET() {
  try {
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    
    if (!GITHUB_TOKEN) {
      return NextResponse.json({ 
        success: false, 
        error: 'No GitHub token configured' 
      });
    }

    // Try different possible repository names
    const possibleRepos = [
      'rebelsmuggling/flowtrac-shopify-inventory-sync',
      'rebelsmuggling/flowtracshopifyinvv2',
      'rebelsmuggling/flowtrac-shopify-inventory-sync-v2',
      'rebelsmuggling/flowtrac-shopify-inventory'
    ];

    const results = [];

    for (const repo of possibleRepos) {
      try {
        const response = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            'Authorization': `token ${GITHUB_TOKEN}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });

        if (response.ok) {
          const repoData = await response.json();
          results.push({
            repository: repo,
            status: 'found',
            name: repoData.name,
            full_name: repoData.full_name,
            private: repoData.private
          });
        } else {
          results.push({
            repository: repo,
            status: 'not_found',
            error: response.status
          });
        }
      } catch (error) {
        results.push({
          repository: repo,
          status: 'error',
          error: (error as Error).message
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Repository name test completed',
      results
    });

  } catch (error) {
    console.error('Repository name test failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 