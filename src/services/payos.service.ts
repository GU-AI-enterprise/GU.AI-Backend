import crypto from 'crypto';

const PAYOS_BASE_URL = 'https://api-merchant.payos.vn';

export interface CreateLinkParams {
  orderCode: number;
  amount: number;
  description: string;
  returnUrl: string;
  cancelUrl: string;
  buyerName?: string;
  buyerEmail?: string;
  expiredAt?: number;
  items?: Array<{ name: string; quantity: number; price: number }>;
}

export interface PaymentLinkData {
  bin: string;
  accountNumber: string;
  checkoutUrl: string;
  qrCode: string;
  paymentLinkId: string;
}

export interface PaymentStatusData {
  id: string;
  orderCode: number;
  amount: number;
  amountPaid: number;
  amountRemaining: number;
  status: 'PENDING' | 'PAID' | 'CANCELLED' | 'EXPIRED';
  transactions?: Array<{
    reference: string;
    amount: number;
    transactionDateTime: string;
  }>;
}

export interface PayOSResponse<T = unknown> {
  code: string;
  desc: string;
  data?: T;
}

export class PayOSService {
  private static get clientId()    { return process.env.PAYOS_CLIENT_ID!; }
  private static get apiKey()      { return process.env.PAYOS_API_KEY!; }
  private static get checksumKey() { return process.env.PAYOS_CHECKSUM_KEY!; }

  private static sign(data: Record<string, unknown>): string {
    const key = this.checksumKey;
    if (!key) throw new Error('PAYOS_CHECKSUM_KEY is not set. Restart the server after adding it to .env');
    // PayOS includes ALL fields (including empty strings) — do NOT filter them out
    const str = Object.keys(data)
      .sort()
      .filter(k => data[k] !== undefined && data[k] !== null)
      .map(k => `${k}=${data[k]}`)
      .join('&');
    return crypto.createHmac('sha256', key).update(str).digest('hex');
  }

  private static headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'x-client-id': this.clientId,
      'x-api-key': this.apiKey,
    };
  }

  static async createPaymentLink(params: CreateLinkParams): Promise<PayOSResponse<PaymentLinkData>> {
    const signature = this.sign({
      amount: params.amount,
      cancelUrl: params.cancelUrl,
      description: params.description,
      orderCode: params.orderCode,
      returnUrl: params.returnUrl,
    });

    const res = await fetch(`${PAYOS_BASE_URL}/v2/payment-requests`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ ...params, signature }),
    });

    return res.json() as Promise<PayOSResponse<PaymentLinkData>>;
  }

  static async getPaymentInfo(orderCode: number | string): Promise<PayOSResponse<PaymentStatusData>> {
    const res = await fetch(`${PAYOS_BASE_URL}/v2/payment-requests/${orderCode}`, {
      headers: this.headers(),
    });
    return res.json() as Promise<PayOSResponse<PaymentStatusData>>;
  }

  static async cancelPaymentLink(
    orderCode: number | string,
    reason?: string
  ): Promise<PayOSResponse> {
    const res = await fetch(`${PAYOS_BASE_URL}/v2/payment-requests/${orderCode}/cancel`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ cancellationReason: reason ?? 'Cancelled by user' }),
    });
    return res.json() as Promise<PayOSResponse>;
  }

  static async confirmWebhookUrl(webhookUrl: string): Promise<PayOSResponse> {
    const res = await fetch(`${PAYOS_BASE_URL}/confirm-webhook`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ webhookUrl }),
    });
    return res.json() as Promise<PayOSResponse>;
  }

  static verifyWebhookSignature(body: { data?: Record<string, unknown>; signature?: string }): boolean {
    if (!body.signature || !body.data) return false;
    const expected = this.sign(body.data);
    return expected === body.signature;
  }
}
