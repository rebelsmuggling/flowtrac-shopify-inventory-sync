import { NextRequest, NextResponse } from 'next/server';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'rebelsmuggling/flowtrac-shopify-inventory-sync';
const MAPPING_FILE_PATH = 'mapping.json';

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
    return JSON.parse(content);
  } catch (error) {
    console.error('Failed to get GitHub file:', error);
    return null;
  }
}

async function updateGitHubFile(content: string, sha: string) {
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
          message: `Update mapping.json - ${new Date().toISOString()}`,
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

export async function GET() {
  try {
    const mapping = await getGitHubFile();
    
    if (!mapping) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to fetch mapping from GitHub' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      mapping,
      source: 'github'
    });

  } catch (error) {
    console.error('Get GitHub mapping failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mapping } = body;
    
    if (!mapping) {
      return NextResponse.json({ 
        success: false, 
        error: 'No mapping data provided' 
      }, { status: 400 });
    }

    // First get the current file to get the SHA
    const currentFile = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/contents/${MAPPING_FILE_PATH}`,
      {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
        },
      }
    );

    if (!currentFile.ok) {
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to get current file SHA from GitHub' 
      }, { status: 500 });
    }

    const fileData = await currentFile.json();
    const sha = fileData.sha;

    // Update the file
    const result = await updateGitHubFile(JSON.stringify(mapping, null, 2), sha);

    return NextResponse.json({ 
      success: true, 
      message: `Successfully updated GitHub mapping with ${mapping.products?.length || 0} products`,
      productCount: mapping.products?.length || 0,
      commit: result.commit?.sha
    });

  } catch (error) {
    console.error('Update GitHub mapping failed:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
} 