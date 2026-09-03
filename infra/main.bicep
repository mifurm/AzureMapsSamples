@description('Azure region for the App Service resources.')
param location string = resourceGroup().location

@description('Name of the Linux Web App. Must be globally unique.')
param appName string = 'geoap-${uniqueString(resourceGroup().id)}'

@description('Name of the App Service plan.')
param appServicePlanName string = '${appName}-plan'

@description('App Service plan SKU. S1 is the default requested deployment size.')
param appServicePlanSku string = 'S1'

@secure()
@description('Existing Azure Maps subscription key. The deploy script reads this from .env.')
param azureMapsSubscriptionKey string

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: appServicePlanSku
    tier: 'Standard'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      alwaysOn: true
      appCommandLine: 'npm start'
      ftpsState: 'Disabled'
      http20Enabled: true
      linuxFxVersion: 'NODE|24-lts'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'AZURE_MAPS_SUBSCRIPTION_KEY'
          value: azureMapsSubscriptionKey
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
      ]
    }
  }
}

output appName string = webApp.name
output appUrl string = 'https://${webApp.properties.defaultHostName}'
