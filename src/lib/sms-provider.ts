/**
 * SMS OTP Provider Interface
 *
 * This is a stub implementation. Replace with a real SMS provider
 * (e.g., Twilio, Vonage, Dialog, Mobitel) for production.
 *
 * TODO: Integrate with a real SMS provider for OTP delivery.
 * The interface below defines the contract that any provider must fulfill.
 */

export interface SmsProvider {
  sendOtp(phone: string, code: string): Promise<{ success: boolean; error?: string }>;
}

/**
 * Mock implementation that logs OTP codes to the console.
 * For production, replace with a real SMS gateway integration.
 */
export class MockSmsProvider implements SmsProvider {
  async sendOtp(
    phone: string,
    code: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log(`[SMS STUB] OTP for ${phone}: ${code}`);
    console.log(
      "[SMS STUB] In production, this would be sent via an SMS gateway."
    );
    return { success: true };
  }
}

/**
 * TODO: Implement a real SMS provider, e.g.:
 *
 * export class TwilioSmsProvider implements SmsProvider {
 *   async sendOtp(phone: string, code: string) {
 *     // Use Twilio SDK to send SMS
 *     const twilio = require('twilio')(ACCOUNT_SID, AUTH_TOKEN);
 *     await twilio.messages.create({
 *       body: `Your Fortune Market verification code is: ${code}`,
 *       to: phone,
 *       from: TWILIO_PHONE_NUMBER,
 *     });
 *     return { success: true };
 *   }
 * }
 */

// Export the active provider — swap this for production
export const smsProvider: SmsProvider = new MockSmsProvider();
