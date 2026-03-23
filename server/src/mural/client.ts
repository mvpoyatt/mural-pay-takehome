// All HTTP calls to the Mural Pay sandbox API live here.
import { config } from '../config';
import {
  MuralAccount,
  MuralCounterparty,
  MuralPayoutMethod,
  MuralPayoutRequest,
  MuralWebhook,
  MuralTransaction,
} from './types';

async function muralFetch<T = void>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.mural.baseUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.mural.apiKey}`,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mural API error ${res.status} on ${path}: ${body}`);
  }

  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }

  return res.json() as Promise<T>;
}

// --- Accounts ---

export async function listAccounts(): Promise<MuralAccount[]> {
  return muralFetch<MuralAccount[]>('/api/accounts');
}

export async function getAccount(accountId: string): Promise<MuralAccount> {
  return muralFetch<MuralAccount>(`/api/accounts/${accountId}`);
}

// --- Counterparties ---

export async function createCounterparty(data: {
  name: string;
  email: string;
  address: {
    addressLine1: string;
    city: string;
    state: string;
    country: string;
    postalCode: string;
  };
}): Promise<MuralCounterparty> {
  return muralFetch<MuralCounterparty>('/api/counterparties', {
    method: 'POST',
    body: JSON.stringify({
      counterparty: {
        type: 'business',
        name: data.name,
        email: data.email,
        physicalAddress: {
          address1: data.address.addressLine1,
          city: data.address.city,
          subDivision: data.address.state,
          country: data.address.country,
          postalCode: data.address.postalCode,
        },
      },
    }),
  });
}

export async function searchCounterparties(name: string): Promise<{ results: MuralCounterparty[] }> {
  return muralFetch('/api/counterparties/search', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

// --- Payout Methods ---

export async function createCopPayoutMethod(
  counterpartyId: string,
  bankId: string,
): Promise<MuralPayoutMethod> {
  const { payout } = config.merchant;
  return muralFetch<MuralPayoutMethod>(`/api/counterparties/${counterpartyId}/payout-methods`, {
    method: 'POST',
    body: JSON.stringify({
      alias: 'Merchant COP account',
      payoutMethod: {
        type: 'cop',
        details: {
          type: 'copDomestic',
          symbol: 'COP',
          accountType: payout.accountType,
          bankAccountNumber: payout.bankAccountNumber,
          bankId,
          documentType: payout.documentType,
          documentNumber: payout.documentNumber,
          phoneNumber: payout.phoneNumber,
        },
      },
    }),
  });
}

export async function searchPayoutMethods(
  counterpartyId: string
): Promise<{ results: MuralPayoutMethod[] }> {
  return muralFetch(`/api/counterparties/${counterpartyId}/payout-methods/search`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getCopDomesticBanks(): Promise<{
  copDomestic?: { type: 'required'; banks: Array<{ id: string; name: string }> } | { type: 'notRequired' };
}> {
  return muralFetch('/api/counterparties/payment-methods/supported-banks?payoutMethodTypes=copDomestic');
}

// --- Payouts ---

export async function createPayout(data: {
  accountId: string;
  counterpartyId: string;
  payoutMethodId: string;
  tokenAmount: number;
}): Promise<MuralPayoutRequest> {
  return muralFetch<MuralPayoutRequest>('/api/payouts/payout', {
    method: 'POST',
    body: JSON.stringify({
      sourceAccountId: data.accountId,
      memo: 'USDC to COP conversion',
      payouts: [
        {
          amount: {
            tokenAmount: data.tokenAmount,
            tokenSymbol: 'USDC',
          },
          recipientInfo: {
            type: 'counterpartyInfo',
            counterpartyId: data.counterpartyId,
          },
          payoutDetails: {
            type: 'counterpartyPayoutMethod',
            payoutMethodId: data.payoutMethodId,
          },
        },
      ],
    }),
  });
}

export async function executePayout(payoutRequestId: string): Promise<MuralPayoutRequest> {
  return muralFetch<MuralPayoutRequest>(`/api/payouts/payout/${payoutRequestId}/execute`, {
    method: 'POST',
    headers: { 'transfer-api-key': config.mural.transferApiKey },
  });
}

export async function getPayoutRequest(payoutRequestId: string): Promise<MuralPayoutRequest> {
  return muralFetch<MuralPayoutRequest>(`/api/payouts/${payoutRequestId}`);
}

// --- Transactions ---

export async function getTransaction(transactionId: string): Promise<MuralTransaction> {
  return muralFetch<MuralTransaction>(`/api/transactions/${transactionId}`);
}

// --- Webhooks ---

export async function listWebhooks(): Promise<MuralWebhook[]> {
  return muralFetch<MuralWebhook[]>('/api/webhooks');
}

export async function createWebhook(url: string): Promise<MuralWebhook> {
  return muralFetch<MuralWebhook>('/api/webhooks', {
    method: 'POST',
    body: JSON.stringify({
      url,
      categories: ['MURAL_ACCOUNT_BALANCE_ACTIVITY', 'PAYOUT_REQUEST'],
    }),
  });
}

export async function deleteWebhook(webhookId: string): Promise<void> {
  await muralFetch(`/api/webhooks/${webhookId}`, { method: 'DELETE' });
}

export async function activateWebhook(webhookId: string): Promise<MuralWebhook> {
  return muralFetch<MuralWebhook>(`/api/webhooks/${webhookId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
}
