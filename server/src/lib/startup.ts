// Runs once at server boot. Ensures Mural resources exist and caches key values.
import { config } from '../config';
import * as mural from '../mural/client';

// Runtime state cached after startup
export const state = {
  accountId: '',
  walletAddress: '',
  counterpartyId: '',
  payoutMethodId: '',
  webhookPublicKey: '',
};

export async function initialize(webhookUrl: string): Promise<void> {
  console.log('Initializing Mural Pay resources...');

  // 1. Fetch account and Polygon wallet address
  const account = await mural.getAccount(config.mural.accountId);
  state.accountId = account.id;
  console.log(`Account ID: ${state.accountId}`);

  const polygonWallet = findPolygonWallet(account);
  if (!polygonWallet) {
    throw new Error('No Polygon wallet found on Mural account. Check your account setup.');
  }
  state.walletAddress = polygonWallet;
  console.log(`Merchant wallet: ${state.walletAddress}`);

  // 2. Ensure counterparty exists
  state.counterpartyId = await ensureCounterparty();
  console.log(`Counterparty ID: ${state.counterpartyId}`);

  // 3. Ensure COP payout method exists
  state.payoutMethodId = await ensurePayoutMethod(state.counterpartyId);
  console.log(`Payout method ID: ${state.payoutMethodId}`);

  // 4. Ensure webhook is registered and active (requires public HTTPS URL)
  if (webhookUrl.startsWith('http://localhost')) {
    console.warn('Webhook skipped: localhost is not a valid webhook URL. Use a tunnel (e.g. localtunnel) and set PUBLIC_URL to enable webhooks locally.');
  } else {
    state.webhookPublicKey = await ensureWebhook(webhookUrl);
    console.log('Webhook active');
  }

  console.log('Mural Pay initialization complete.');
}

function findPolygonWallet(account: Awaited<ReturnType<typeof mural.listAccounts>>[number]): string | null {
  const walletAddress = account.accountDetails?.walletDetails?.walletAddress;
  if (walletAddress) return walletAddress;
  // Fallback: scan JSON for any 0x address
  const match = JSON.stringify(account).match(/"walletAddress"\s*:\s*"(0x[a-fA-F0-9]{40})"/);
  return match ? match[1] : null;
}

async function ensureCounterparty(): Promise<string> {
  // Search by merchant name first to avoid duplicates
  try {
    const { results } = await mural.searchCounterparties(config.merchant.name);
    if (results && results.length > 0) {
      return results[0].id;
    }
  } catch {
    // Search failed — create fresh
  }

  const counterparty = await mural.createCounterparty({
    name: config.merchant.name,
    email: config.merchant.email,
    address: config.merchant.address,
  });
  return counterparty.id;
}

async function ensurePayoutMethod(counterpartyId: string): Promise<string> {
  try {
    const { results } = await mural.searchPayoutMethods(counterpartyId);
    if (results && results.length > 0) {
      return results[0].id;
    }
  } catch {
    // Search failed — create fresh
  }

  const bankId = await fetchCopBankId();
  const method = await mural.createCopPayoutMethod(counterpartyId, bankId);
  return method.id;
}

async function fetchCopBankId(): Promise<string> {
  const banks = await mural.getCopDomesticBanks();
  if (banks.copDomestic?.type === 'required' && banks.copDomestic.banks.length > 0) {
    const bank = banks.copDomestic.banks[0];
    console.log(`Using COP bank: ${bank.name} (${bank.id})`);
    return bank.id;
  }
  // Bank selection not required — return empty string
  return '';
}

async function ensureWebhook(webhookUrl: string): Promise<string> {
  const all = await mural.listWebhooks();

  // Reuse existing webhook for this URL if already active
  const existing = all.find((w) => w.url === webhookUrl);
  if (existing?.status === 'ACTIVE') {
    return existing.publicKey;
  }

  // Delete all stale webhooks to stay under the 5-webhook limit
  for (const w of all) {
    if (w.url !== webhookUrl) {
      await mural.deleteWebhook(w.id);
      console.log(`Deleted old webhook ${w.id} (${w.url})`);
    }
  }

  const webhook = await mural.createWebhook(webhookUrl);
  const activated = await mural.activateWebhook(webhook.id);
  return activated.publicKey;
}
