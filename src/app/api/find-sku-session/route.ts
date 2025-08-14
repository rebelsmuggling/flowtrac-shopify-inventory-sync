import { NextRequest, NextResponse } from 'next/server';
import { mappingService } from '../../../services/mapping';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sku = url.searchParams.get('sku') || 'IC-RBBE-0002';
    const batchSize = parseInt(url.searchParams.get('batchSize') || '60');
    
    console.log(`Finding session for SKU: ${sku}`);
    
    // Get fresh mapping data
    const { mapping, source } = await mappingService.getMapping();
    
    // Get all mapped SKUs
    const mappedSkus = await mappingService.getMappedSkus();
    const skuArray = Array.from(mappedSkus);
    
    // Find which session this SKU belongs to
    const skuIndex = skuArray.indexOf(sku);
    const sessionNumber = skuIndex >= 0 ? Math.floor(skuIndex / batchSize) + 1 : -1;
    const positionInSession = skuIndex >= 0 ? (skuIndex % batchSize) + 1 : -1;
    
    // Calculate session boundaries
    const sessionStartIndex = sessionNumber > 0 ? (sessionNumber - 1) * batchSize : -1;
    const sessionEndIndex = sessionNumber > 0 ? Math.min(sessionStartIndex + batchSize, skuArray.length) : -1;
    
    // Get the actual session SKUs
    const sessionSkus = sessionNumber > 0 ? skuArray.slice(sessionStartIndex, sessionEndIndex) : [];
    
    // Calculate total sessions
    const totalSessions = Math.ceil(skuArray.length / batchSize);
    
    return NextResponse.json({
      success: true,
      sku,
      batchSize,
      skuInfo: {
        found: skuIndex >= 0,
        index: skuIndex,
        sessionNumber,
        positionInSession,
        totalSessions
      },
      sessionInfo: {
        sessionNumber,
        sessionStartIndex,
        sessionEndIndex,
        sessionSkusCount: sessionSkus.length,
        sessionSkusSample: sessionSkus.slice(0, 10)
      },
      allSkusInfo: {
        totalSkus: skuArray.length,
        skuArraySample: skuArray.slice(0, 20)
      },
      analysis: {
        skuInCorrectSession: sessionSkus.includes(sku),
        skuShouldBeInSession: sessionNumber,
        skuIsInSession: sessionNumber > 0 && sessionNumber <= totalSessions
      }
    });
    
  } catch (error) {
    console.error('Error finding SKU session:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    });
  }
}
