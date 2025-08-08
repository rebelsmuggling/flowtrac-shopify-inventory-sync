# Inventory Preview CSV Feature

## Overview

The Inventory Preview CSV feature allows you to generate a CSV file showing the exact inventory quantities that would be posted to Amazon and Shopify in a live sync, without actually performing the sync operation.

## How to Use

1. **Access the Feature**: On the main dashboard, you'll see a "📊 Preview CSV" button next to the "Sync Now" button.

2. **Generate Preview**: Click the "📊 Preview CSV" button to generate and download a CSV file containing:
   - Current inventory levels from Flowtrac
   - Quantities that would be synced to Shopify
   - Quantities that would be synced to Amazon
   - Bundle component breakdowns
   - Warehouse bin locations

3. **Review Data**: Open the downloaded CSV file in Excel, Google Sheets, or any spreadsheet application to review the inventory data.

## CSV File Structure

The generated CSV file contains the following columns:

| Column | Description |
|--------|-------------|
| Shopify SKU | The SKU used in Shopify |
| Flowtrac SKU | The SKU used in Flowtrac (empty for bundles) |
| Amazon SKU | The SKU used in Amazon (if configured) |
| Product Type | "Simple" or "Bundle" |
| Flowtrac Available | Available quantity in Flowtrac |
| Shopify Quantity | Quantity that would be synced to Shopify |
| Amazon Quantity | Quantity that would be synced to Amazon |
| Bundle Components | For bundles: component SKUs with quantities and bins |
| Flowtrac Bins | Warehouse bin locations where inventory is stored |
| Last Updated | Timestamp of when the data was generated |

## Bundle Product Handling

For bundle products, the system:

1. **Calculates Component Availability**: Checks available inventory for each component
2. **Determines Bundle Quantity**: Uses the minimum quantity that can be assembled from available components
3. **Shows Component Details**: Lists each component with its available quantity and bin locations
4. **Syncs Bundle Quantity**: The same quantity is synced to both Shopify and Amazon

## Example CSV Output

```csv
Shopify SKU,Flowtrac SKU,Amazon SKU,Product Type,Flowtrac Available,Shopify Quantity,Amazon Quantity,Bundle Components,Flowtrac Bins,Last Updated
"IC-KOOL-0045","IC-KOOL-0045","IC-KOOL-0045","Simple",299,299,299,"","A1, B2, C3","2024-01-15T10:30:00.000Z"
"IC-HCPK-0096","","","Bundle",50,50,50,"IC-HCPK-0048:100(A1,B2); IC-HCPK-0049:50(C3)","A1, B2, C3","2024-01-15T10:30:00.000Z"
```

## Benefits

- **Preview Before Sync**: See exactly what quantities will be synced without making changes
- **Audit Trail**: Keep records of inventory levels at specific points in time
- **Troubleshooting**: Identify issues with inventory calculations before they affect live systems
- **Planning**: Use the data for inventory planning and analysis

## Technical Details

- **Data Source**: Uses the same Flowtrac inventory API as the live sync
- **Mapping**: Respects the current product mapping configuration
- **Warehouse Filtering**: Only includes inventory from the Manteca warehouse (as configured)
- **Bundle Logic**: Applies the same bundle calculation logic as the live sync
- **Real-time**: Generates fresh data each time the button is clicked

## API Endpoint

The feature is powered by the `/api/export-inventory-csv` endpoint, which:

1. Loads the current product mapping
2. Fetches real-time inventory from Flowtrac
3. Calculates quantities for both simple and bundle products
4. Generates a properly formatted CSV file
5. Returns the file as a downloadable attachment

## Error Handling

If the CSV generation fails, the system will:

- Log detailed error information
- Return an appropriate error response
- Not affect the live sync functionality

## Integration with Existing Features

This feature works seamlessly with:

- **Product Mapping**: Uses the same mapping configuration as live syncs
- **Bundle Support**: Handles both simple and bundle products
- **Warehouse Configuration**: Respects warehouse filtering settings
- **Import/Export Tools**: Can be used alongside existing mapping management tools 