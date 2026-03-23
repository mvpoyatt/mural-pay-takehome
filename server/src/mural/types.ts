// Mural Pay API types

export interface MuralAccount {
  id: string;
  accountDetails?: {
    walletDetails?: {
      blockchain: string;
      walletAddress: string;
    };
  };
  // Keep catch-all for any undocumented fields
  [key: string]: unknown;
}

export interface MuralCounterparty {
  id: string;
  name: string;
  email: string;
  [key: string]: unknown;
}

export interface MuralPayoutMethod {
  id: string;
  counterpartyId: string;
  [key: string]: unknown;
}

export interface MuralPayoutRequest {
  id: string;
  status: string;
  payouts?: Array<{
    id: string;
    status: string;
    fiatAmount?: number;
    fiatCurrencyCode?: string;
  }>;
  [key: string]: unknown;
}

export interface MuralWebhook {
  id: string;
  status: string;
  publicKey: string;
  url: string;
  [key: string]: unknown;
}

export interface MuralTransaction {
  id: string;
  blockchainTxHash?: string;
  txHash?: string;
  transactionHash?: string;
  amount?: number;
  tokenAmount?: number;
  [key: string]: unknown;
}

// Webhook event payload shapes
export interface WebhookEvent {
  eventId: string;
  deliveryId: string;
  attemptNumber: number;
  eventCategory: string;
  occurredAt: string;
  payload: AccountCreditedPayload | PayoutStatusPayload | Record<string, unknown>;
}

export interface AccountCreditedPayload {
  type: 'account_credited' | 'account_debited';
  accountId: string;
  organizationId: string;
  transactionId: string;
  accountWalletAddress?: string;
  tokenAmount?: {
    blockchain?: string;
    tokenAmount?: number;
    tokenSymbol?: string;
    tokenContractAddress?: string;
  };
  transactionDetails?: {
    blockchain?: string;
    transactionDate?: string;
    transactionHash?: string;
    sourceWalletAddress?: string;
    destinationWalletAddress?: string;
  };
  [key: string]: unknown;
}

export interface PayoutStatusPayload {
  payoutRequestId?: string;
  payoutId?: string;
  status?: string;
  statusChangeDetails?: {
    currentStatus?: { type: string };
    previousStatus?: { type: string };
  };
  [key: string]: unknown;
}
