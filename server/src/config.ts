// All configuration lives here. Values are hardcoded per assignment FAQ (sandbox only).
// To productionize: replace hardcoded values with process.env lookups.

export const config = {
  port: process.env.PORT ? parseInt(process.env.PORT) : 3001,

  // Our own API key for simple auth (X-API-Key header)
  apiKey: 'mural-takehome-secret',

  // Mural Pay sandbox
  mural: {
    apiKey: 'edf1da0115b48af68db654f3:4b0012cd4468b9a883dcff3a21a96f9607179d5d1132e849941381c4508b8a08df9b6b47:40858fb512473a98e657c7d2a3ef1799.a2adbfe42c967eb1f8f31fbb8f88e492f9fdc31a17b4847f89857c0dc6c41579',
    transferApiKey: '2d2d9669decc3bb389646d8b:48fdb0a4755d5943252f08ede1c73d47d8380c6e9d7731641eb21d9e2d69e222e8ff8f54:9423387e42538bf507f30ac4d51b862e.86f5e34d5b21c5fd9fd29378cfa4fc30e7a4930be4e439723b34bad6ba5fca56',
    accountId: 'b8964701-bb5c-4afa-af6a-40f3aa0b1c3f',
    baseUrl: 'https://api-staging.muralpay.com',
    // Stored after webhook registration at startup
    webhookId: '',
    webhookPublicKey: '',
  },

  // Polygon Amoy (Mural sandbox chain)
  polygon: {
    chainId: 80002,
    usdcAddress: '0x41E94Eb019C0762f9Bfcf9Fb1E58725BfB0e7582',
    rpc: 'https://rpc-amoy.polygon.technology',
  },

  // Merchant COP payout details (dummy sandbox values)
  merchant: {
    name: 'Mural Test Merchant',
    email: 'merchant@example.com',
    address: {
      addressLine1: 'Calle 123',
      city: 'Bogota',
      state: 'DC',
      country: 'CO',
      postalCode: '110111',
    },
    payout: {
      accountType: 'CHECKING',
      bankAccountNumber: '1234567890',
      documentType: 'NATIONAL_ID',
      documentNumber: '1234567890',
      phoneNumber: '+573001234567',
    },
  },
};
