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

    // Simple test - try to get repository info
    const response = await fetch('https://api.github.com/repos/rebelsmuggling/flowtrac-shopify-inventory-sync', {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (response.ok) {
      const repoData = await response.json();
      return NextResponse.json({ 
        success: true, 
        message: 'Repository found!',
        repo: {
          name: repoData.name,
          full_name: repoData.full_name,
          private: repoData.private
        }
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: `Repository not found: ${response.status}`,
        status: response.status
      });
    }

  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 