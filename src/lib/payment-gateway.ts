/**
 * Payment Gateway Interface
 *
 * This is a stub implementation. Replace with a real payment provider
 * (e.g., Stripe, PayHere, Dialog Genie, Frimi) for production.
 *
 * TODO: Integrate with a real payment gateway for card payments.
 * Cash on Delivery (COD) does not require a gateway integration.
 */

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentGateway {
  createPayment(amount: number, currency: string, metadata: Record<string, string>): Promise<PaymentResult>;
  verifyPayment(transactionId: string): Promise<PaymentResult>;
  refund(transactionId: string, amount: number): Promise<PaymentResult>;
}

/**
 * Mock implementation that simulates successful payments.
 * For production, replace with PayHere, Stripe, or Dialog Genie integration.
 */
export class MockPaymentGateway implements PaymentGateway {
  async createPayment(
    amount: number,
    currency: string,
    metadata: Record<string, string>
  ): Promise<PaymentResult> {
    const transactionId = `TXN_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(
      `[PAYMENT STUB] Created payment: ${amount} ${currency} — ${transactionId}`
    );
    console.log(
      "[PAYMENT STUB] In production, this would redirect to a payment page."
    );
    return { success: true, transactionId };
  }

  async verifyPayment(transactionId: string): Promise<PaymentResult> {
    console.log(`[PAYMENT STUB] Verifying payment: ${transactionId}`);
    return { success: true, transactionId };
  }

  async refund(transactionId: string, amount: number): Promise<PaymentResult> {
    console.log(
      `[PAYMENT STUB] Refunding ${amount} for transaction: ${transactionId}`
    );
    return { success: true, transactionId };
  }
}

/**
 * TODO: Implement a real payment provider, e.g.:
 *
 * export class PayHereGateway implements PaymentGateway {
 *   async createPayment(amount, currency, metadata) {
 *     // Use PayHere SDK to create a payment
 *     // Return the redirect URL for the buyer
 *   }
 *   // ...
 * }
 */

// Export the active provider — swap this for production
export const paymentGateway: PaymentGateway = new MockPaymentGateway();
