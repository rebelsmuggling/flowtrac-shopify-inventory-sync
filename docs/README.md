# Flowtrac to Shopify Inventory Sync - Documentation

Welcome to the comprehensive documentation for the Flowtrac to Shopify Inventory Sync application. This documentation will help you understand, set up, and maintain your inventory synchronization system.

## 📚 Documentation Index

### Getting Started
- **[Setup Guide](setup-guide.md)** - Complete step-by-step setup instructions
- **[README](../README.md)** - Project overview and quick start

### API Documentation
- **[Flowtrac API](flowtrac-api.md)** - Complete Flowtrac API reference and integration guide
- **[Shopify API](shopify-api.md)** - Complete Shopify API reference and integration guide

### Technical Documentation
- **[Architecture Overview](#architecture-overview)** - System architecture and components
- **[Configuration Reference](#configuration-reference)** - All configuration options
- **[Troubleshooting Guide](#troubleshooting)** - Common issues and solutions

## 🏗️ Architecture Overview

### System Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Flowtrac API  │    │   Sync Service  │    │  Shopify API    │
│                 │    │                 │    │                 │
│ • Inventory     │◄──►│ • Orchestration │◄──►│ • Products      │
│ • Products      │    │ • Mapping       │    │ • Inventory     │
│ • Authentication│    │ • Error Handling│    │ • Locations     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Web Dashboard │
                       │                 │
                       │ • Status Monitor│
                       │ • Manual Sync   │
                       │ • Configuration │
                       └─────────────────┘
```

### Data Flow

1. **Inventory Fetch**: Sync service retrieves inventory data from Flowtrac
2. **Product Mapping**: System maps Flowtrac SKUs to Shopify product variants
3. **Inventory Update**: Updates Shopify inventory levels with Flowtrac quantities
4. **Result Logging**: Records sync results and any errors
5. **Dashboard Update**: Updates web interface with current status

### Key Features

- **Real-time Sync**: Automatic inventory synchronization
- **Manual Control**: On-demand sync triggering
- **Error Handling**: Robust error handling and retry logic
- **Monitoring**: Real-time status monitoring
- **Scalable**: Designed to handle large product catalogs

## ⚙️ Configuration Reference

### Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `FLOWTRAC_API_URL` | Yes | Flowtrac API base URL | `https://api.flowtrac.com` |
| `FLOWTRAC_API_KEY` | Yes | Flowtrac API key | `your_api_key_here` |
| `FLOWTRAC_USERNAME` | Yes | Flowtrac username | `your_username` |
| `FLOWTRAC_PASSWORD` | Yes | Flowtrac password | `your_password` |
| `SHOPIFY_SHOP_DOMAIN` | Yes | Shopify shop domain | `your-shop.myshopify.com` |
| `SHOPIFY_API_KEY` | Yes | Shopify API key | `your_shopify_key` |
| `SHOPIFY_API_PASSWORD` | Yes | Shopify API password | `your_shopify_password` |
| `SHOPIFY_API_VERSION` | No | Shopify API version | `2023-10` |
| `SYNC_INTERVAL_MINUTES` | No | Auto-sync interval | `60` |
| `ENABLE_AUTO_SYNC` | No | Enable automatic syncing | `true` |

### Product Mapping Structure

```typescript
interface ProductMapping {
  flowtracSku: string;           // SKU in Flowtrac
  shopifySku: string;            // SKU in Shopify
  shopifyProductId: number;      // Shopify product ID
  shopifyVariantId: number;      // Shopify variant ID
  shopifyInventoryItemId: number; // Shopify inventory item ID
}
```

### Sync Configuration

```typescript
interface SyncConfig {
  intervalMinutes: number;       // Sync interval in minutes
  enableAutoSync: boolean;       // Enable automatic syncing
  retryAttempts: number;         // Number of retry attempts
  retryDelay: number;           // Delay between retries (ms)
}
```

## 🔧 Troubleshooting

### Common Issues

#### 1. API Connection Failures

**Symptoms**: Dashboard shows "Disconnected" status

**Solutions**:
- Verify API credentials are correct
- Check network connectivity
- Ensure API endpoints are accessible
- Verify API permissions

#### 2. Sync Failures

**Symptoms**: Sync results show errors

**Solutions**:
- Check product mappings are correct
- Verify products exist in both systems
- Ensure inventory tracking is enabled in Shopify
- Review error logs for specific issues

#### 3. Performance Issues

**Symptoms**: Slow sync times or timeouts

**Solutions**:
- Increase sync intervals
- Implement request queuing
- Use bulk operations
- Monitor API rate limits

### Debug Mode

Enable debug logging by setting:

```env
DEBUG=true
LOG_LEVEL=debug
```

### Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| `AUTH_FAILED` | Authentication failed | Check API credentials |
| `RATE_LIMIT` | Rate limit exceeded | Increase sync intervals |
| `PRODUCT_NOT_FOUND` | Product not found | Verify product mappings |
| `INVALID_SKU` | Invalid SKU format | Check SKU formatting |
| `NETWORK_ERROR` | Network connection failed | Check connectivity |

## 📊 Monitoring and Metrics

### Dashboard Metrics

The dashboard displays:

- **API Connection Status**: Real-time connection health
- **Sync History**: Recent sync results and performance
- **Error Logs**: Detailed error information
- **Product Mapping Status**: Mapping configuration status

### Performance Metrics

Monitor these key metrics:

- **Sync Duration**: Time taken for each sync operation
- **Success Rate**: Percentage of successful syncs
- **Error Rate**: Frequency of sync failures
- **API Response Times**: Response times from both APIs

### Health Checks

The system includes health checks for:

- **API Connectivity**: Tests connection to both APIs
- **Authentication**: Verifies API credentials
- **Data Integrity**: Validates product mappings
- **System Resources**: Monitors server resources

## 🔒 Security

### API Security

- **HTTPS Only**: All API communications use HTTPS
- **Credential Protection**: Credentials stored in environment variables
- **Access Control**: API keys with minimal required permissions
- **Audit Logging**: All API calls are logged for security

### Data Protection

- **Encryption**: Data encrypted in transit and at rest
- **Access Controls**: Role-based access to system features
- **Audit Trail**: Complete audit trail of all operations
- **Compliance**: Designed to meet data protection requirements

## 🚀 Deployment

### Development

```bash
npm install
npm run dev
```

### Production

```bash
npm install
npm run build
npm start
```

### Docker (Optional)

```bash
docker build -t flowtrac-shopify-sync .
docker run -p 3000:3000 flowtrac-shopify-sync
```

## 📞 Support

### Getting Help

1. **Check Documentation**: Review relevant documentation sections
2. **Check Logs**: Examine application logs for error details
3. **Test Connections**: Verify API connections manually
4. **Contact Support**: Reach out with specific error details

### Support Resources

- **Documentation**: This documentation suite
- **Code Repository**: GitHub repository with issues
- **Community**: User community and forums
- **Professional Support**: Enterprise support options

### Contributing

To contribute to the documentation:

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Submit a pull request**

## 📝 Changelog

### Version 1.0.0
- Initial release
- Basic inventory sync functionality
- Web dashboard
- API integration for Flowtrac and Shopify

### Future Enhancements
- Advanced product mapping interface
- Bulk import/export functionality
- Enhanced monitoring and alerting
- Mobile application
- Multi-store support

---

**Last Updated**: January 2024  
**Version**: 1.0.0  
**Maintainer**: Development Team 